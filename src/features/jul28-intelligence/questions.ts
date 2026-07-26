import { getActivityAuthorityLayer, projectActivityEvents } from './activity.js';
import type {
  GroundedAnswerRecord,
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
  summary: `${records.length} explicit ${noun} ${records.length === 1 ? 'record matches' : 'records match'} the snapshot.`,
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
          { layer: 'crew-execution', value: scope.crewExecution },
          { layer: 'los-inspection', value: scope.losInspection },
          { layer: 'access', value: scope.access },
        ]),
      );
    return answered(snapshot, classified.kind, records, 'inspection');
  }

  if (classified.kind === 'callbacks') {
    const records = scopes
      .filter((scope) => ['callback-required', 'reinspection-pending'].includes(scope.losInspection))
      .map((scope) => scopeRecord(scope, [{ layer: 'los-inspection', value: scope.losInspection }]));
    return answered(snapshot, classified.kind, records, 'callback');
  }

  if (classified.kind === 'ready-for-property-walk') {
    const records = scopes
      .filter((scope) => scope.propertyWalk === 'walk-pending')
      .map((scope) => scopeRecord(scope, [{ layer: 'property-walk', value: scope.propertyWalk }]));
    return answered(snapshot, classified.kind, records, 'property-walk');
  }

  if (classified.kind === 'needs-paper-reconciliation') {
    const records = scopes
      .filter((scope) => scope.paperReconciliation === 'needs-paper-review')
      .map((scope) =>
        scopeRecord(scope, [{ layer: 'paper-reconciliation', value: scope.paperReconciliation }]),
      );
    return answered(snapshot, classified.kind, records, 'paper-reconciliation');
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
        { layer: 'authorization', value: scope.authorization },
        { layer: 'access', value: scope.access },
        { layer: 'crew-execution', value: scope.crewExecution },
        { layer: 'los-inspection', value: scope.losInspection },
        { layer: 'property-walk', value: scope.propertyWalk },
        { layer: 'paper-reconciliation', value: scope.paperReconciliation },
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
      facts: [{ layer: getActivityAuthorityLayer(event.eventType), value: event.eventType }],
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
