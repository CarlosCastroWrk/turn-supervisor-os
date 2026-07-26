import { getActivityAuthorityLayer, projectActivityEvents } from './activity.js';
import type {
  ActivityAuthorityLayer,
  GroundedAnswerRecord,
  OperationalFactProvenance,
  SupportedTurnQuestionKind,
  TradeScopeSnapshot,
  TurnContextSnapshot,
  TurnQuestionResult,
  TurnSection,
} from './contracts.js';

interface ClassifiedQuestion {
  kind?: SupportedTurnQuestionKind;
  payrollUnavailable?: boolean;
  unitRef?: string;
  section?: TurnSection;
}

const normalizeQuestion = (question: string) =>
  question.toLowerCase().replace(/[?!.,:;]+/g, ' ').replace(/\s+/g, ' ').trim();

const sectionFromText = (value?: string): TurnSection | undefined => {
  if (!value) return undefined;
  if (value.toLowerCase() === 'common') return 'Common';
  const upper = value.toUpperCase();
  return ['A', 'B', 'C', 'D', 'E'].includes(upper) ? (upper as TurnSection) : undefined;
};

export const classifyDeterministicTurnQuestion = (question: string): ClassifiedQuestion => {
  const normalized = normalizeQuestion(question);

  if (/\bpayroll\b|\bpay\s*period\b|\bpay\s*eligible\b/.test(normalized)) {
    return { payrollUnavailable: true };
  }
  if (/\bneeds? (?:my )?inspection\b/.test(normalized)) {
    return { kind: 'needs-inspection' };
  }
  if (/\bcallbacks?\b|\bgo backs?\b|\breinspection\b/.test(normalized)) {
    return { kind: 'callbacks' };
  }
  if (/\bready for (?:a )?property (?:walk|walkthrough)\b/.test(normalized)) {
    return { kind: 'ready-for-property-walk' };
  }
  if (/\bneeds? paper (?:review|reconciliation)\b|\bpaper reconciliation\b/.test(normalized)) {
    return { kind: 'needs-paper-reconciliation' };
  }
  if (/\bwhat happened (?:with|in|at)\b/.test(normalized)) {
    const target = normalized.match(/\bunit\s*([0-9]+)\s*(common|[a-e])?\b/);
    return {
      kind: 'unit-history',
      unitRef: target?.[1],
      section: sectionFromText(target?.[2]),
    };
  }

  return {};
};

const scopeRecord = (scope: TradeScopeSnapshot, layers: GroundedAnswerRecord['facts']): GroundedAnswerRecord => ({
  recordKind: 'current-scope',
  unitRef: scope.unitRef,
  section: scope.section,
  trade: scope.trade,
  facts: layers,
});

const unresolvedProvenance = (layer: ActivityAuthorityLayer): OperationalFactProvenance => ({
  sourceKind: 'unresolved-evidence',
  confidence: 'unresolved',
  label: `Missing ${layer} provenance`,
  recordedAt: '',
});

const scopeFact = (
  scope: TradeScopeSnapshot,
  layer: ActivityAuthorityLayer,
  value: string,
): GroundedAnswerRecord['facts'][number] => ({
  layer,
  value,
  provenance: scope.provenance?.[layer] ?? unresolvedProvenance(layer),
});

const hasResolvedProvenance = (scope: TradeScopeSnapshot, layer: ActivityAuthorityLayer) => {
  const provenance = scope.provenance?.[layer];
  return Boolean(
    provenance &&
      provenance.sourceKind !== 'unresolved-evidence' &&
      provenance.confidence !== 'unresolved',
  );
};

const hasCoherentCompleteCoverage = (snapshot: TurnContextSnapshot) => {
  const coverage = snapshot.coverage;
  if (
    !coverage ||
    coverage.scope !== 'property-wide' ||
    coverage.status !== 'complete' ||
    coverage.provenance.sourceKind === 'unresolved-evidence' ||
    coverage.provenance.confidence === 'unresolved'
  ) {
    return false;
  }

  const snapshotUnitRefs = new Set(snapshot.units.map((unit) => unit.unitRef));
  const coveredUnitRefs = new Set(coverage.includedUnitRefs);
  return (
    snapshotUnitRefs.size === snapshot.units.length &&
    coveredUnitRefs.size === coverage.includedUnitRefs.length &&
    snapshotUnitRefs.size === coveredUnitRefs.size &&
    [...snapshotUnitRefs].every((unitRef) => coveredUnitRefs.has(unitRef))
  );
};

const answered = (
  snapshot: TurnContextSnapshot,
  questionKind: SupportedTurnQuestionKind,
  records: GroundedAnswerRecord[],
  noun: string,
): TurnQuestionResult => ({
  status: 'answered',
  questionKind,
  asOf: snapshot.asOf,
  propertyScopeRef: snapshot.propertyScope.redactedRef,
  coverageStatus: snapshot.coverage?.status ?? 'unknown',
  summary: `${records.length} explicit ${noun} ${records.length === 1 ? 'record matches' : 'records match'} the ${snapshot.coverage?.status ?? 'unknown'}-coverage snapshot.`,
  records,
});

const allScopes = (snapshot: TurnContextSnapshot) => snapshot.units.flatMap((unit) => unit.scopes);

const needsSnapshotEvidence = (snapshot: TurnContextSnapshot): TurnQuestionResult | undefined =>
  snapshot.units.length === 0
    ? {
        status: 'not-answered',
        reason: 'insufficient-evidence',
        message: 'The current snapshot contains no Unit scope evidence.',
      }
    : undefined;

const answerPropertyWide = (
  snapshot: TurnContextSnapshot,
  questionKind: SupportedTurnQuestionKind,
  records: GroundedAnswerRecord[],
  noun: string,
): TurnQuestionResult => {
  if (records.length === 0 && !hasCoherentCompleteCoverage(snapshot)) {
    return {
      status: 'not-answered',
      reason: 'insufficient-evidence',
      message: `No ${noun} records are visible, but property-wide snapshot coverage is not coherently complete (reported ${snapshot.coverage?.status ?? 'unknown'}); a zero result cannot be confirmed.`,
    };
  }

  return answered(snapshot, questionKind, records, noun);
};

const PROPERTY_WALK_LAYERS: ActivityAuthorityLayer[] = [
  'authorization',
  'access',
  'crew-execution',
  'los-inspection',
  'property-walk',
];

const isReadyForPropertyWalk = (scope: TradeScopeSnapshot) =>
  scope.authorization === 'released' &&
  scope.access === 'accessible' &&
  scope.crewExecution === 'crew-reported-complete' &&
  ['los-passed', 'passed-after-callback'].includes(scope.losInspection) &&
  scope.propertyWalk === 'walk-pending' &&
  PROPERTY_WALK_LAYERS.every((layer) => hasResolvedProvenance(scope, layer));

export const answerDeterministicTurnQuestion = (
  snapshot: TurnContextSnapshot,
  question: string,
): TurnQuestionResult => {
  const classified = classifyDeterministicTurnQuestion(question);

  if (classified.payrollUnavailable) {
    return {
      status: 'not-answered',
      reason: 'payroll-unavailable',
      message: 'Payroll is unavailable and is never calculated or inferred from this snapshot.',
    };
  }
  if (!classified.kind) {
    return {
      status: 'not-answered',
      reason: 'unsupported-question',
      message: 'This deterministic foundation does not support that question.',
    };
  }

  const missingEvidence = needsSnapshotEvidence(snapshot);
  if (missingEvidence) return missingEvidence;

  const scopes = allScopes(snapshot);
  if (classified.kind === 'needs-inspection') {
    const records = scopes
      .filter(
        (scope) =>
          scope.crewExecution === 'crew-reported-complete' && scope.losInspection === 'inspection-pending',
      )
      .map((scope) =>
        scopeRecord(scope, [
          scopeFact(scope, 'crew-execution', scope.crewExecution),
          scopeFact(scope, 'los-inspection', scope.losInspection),
          scopeFact(scope, 'access', scope.access),
        ]),
      );
    return answerPropertyWide(snapshot, classified.kind, records, 'inspection');
  }

  if (classified.kind === 'callbacks') {
    const records = scopes
      .filter((scope) => ['callback-required', 'reinspection-pending'].includes(scope.losInspection))
      .map((scope) => scopeRecord(scope, [scopeFact(scope, 'los-inspection', scope.losInspection)]));
    return answerPropertyWide(snapshot, classified.kind, records, 'callback');
  }

  if (classified.kind === 'ready-for-property-walk') {
    const walkPendingScopes = scopes.filter((scope) => scope.propertyWalk === 'walk-pending');
    if (walkPendingScopes.some((scope) => !isReadyForPropertyWalk(scope))) {
      return {
        status: 'not-answered',
        reason: 'insufficient-evidence',
        message: 'At least one walk-pending scope conflicts with authorization, access, crew completion, Los inspection, or provenance evidence.',
      };
    }
    const records = walkPendingScopes.map((scope) =>
      scopeRecord(
        scope,
        PROPERTY_WALK_LAYERS.map((layer) => {
          const valueByLayer: Record<ActivityAuthorityLayer, string> = {
            authorization: scope.authorization,
            access: scope.access,
            'crew-execution': scope.crewExecution,
            'los-inspection': scope.losInspection,
            'property-walk': scope.propertyWalk,
            'paper-reconciliation': scope.paperReconciliation,
          };
          return scopeFact(scope, layer, valueByLayer[layer]);
        }),
      ),
    );
    return answerPropertyWide(snapshot, classified.kind, records, 'property-walk');
  }

  if (classified.kind === 'needs-paper-reconciliation') {
    const records = scopes
      .filter((scope) => scope.paperReconciliation === 'needs-paper-review')
      .map((scope) =>
        scopeRecord(scope, [scopeFact(scope, 'paper-reconciliation', scope.paperReconciliation)]),
      );
    return answerPropertyWide(snapshot, classified.kind, records, 'paper-reconciliation');
  }

  if (!classified.unitRef) {
    return {
      status: 'not-answered',
      reason: 'insufficient-evidence',
      message: 'A Unit reference is required for Unit history.',
    };
  }

  const unit = snapshot.units.find((candidate) => candidate.unitRef.toLowerCase() === classified.unitRef?.toLowerCase());
  if (!unit) {
    return {
      status: 'not-answered',
      reason: 'insufficient-evidence',
      message: `Unit ${classified.unitRef} is not present in the current snapshot.`,
    };
  }

  const currentRecords = unit.scopes
    .filter((scope) => !classified.section || scope.section === classified.section)
    .map((scope) =>
      scopeRecord(scope, [
        scopeFact(scope, 'authorization', scope.authorization),
        scopeFact(scope, 'access', scope.access),
        scopeFact(scope, 'crew-execution', scope.crewExecution),
        scopeFact(scope, 'los-inspection', scope.losInspection),
        scopeFact(scope, 'property-walk', scope.propertyWalk),
        scopeFact(scope, 'paper-reconciliation', scope.paperReconciliation),
      ]),
    );
  const eventRecords: GroundedAnswerRecord[] = projectActivityEvents(
    snapshot.activityEvents.filter((event) => event.propertyScopeRef === snapshot.propertyScope.redactedRef),
  ).timeline
    .filter(
      (event) =>
        event.unitRef === unit.unitRef && (!classified.section || event.section === classified.section),
    )
    .map((event) => ({
      recordKind: 'activity-event',
      unitRef: event.unitRef,
      section: event.section,
      trade: event.trade,
      occurredAt: event.occurredAt,
      facts: [{
        layer: getActivityAuthorityLayer(event.eventType),
        value: event.eventType,
        provenance: {
          sourceKind: event.source,
          confidence: event.source === 'synthetic-fixture' ? 'fixture-only' : 'recorded',
          label: event.source === 'synthetic-fixture' ? 'Synthetic activity fixture' : 'Los manual activity record',
          recordedAt: event.occurredAt,
          evidenceRef: `activity://${event.id}`,
        },
      }],
    }));

  if (currentRecords.length === 0 && eventRecords.length === 0) {
    return {
      status: 'not-answered',
      reason: 'insufficient-evidence',
      message: `No scope or activity evidence is available for Unit ${classified.unitRef}${classified.section ?? ''}.`,
    };
  }

  return answered(snapshot, classified.kind, [...currentRecords, ...eventRecords], 'Unit-history');
};
