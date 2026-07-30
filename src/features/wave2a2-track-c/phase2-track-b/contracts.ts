import {
  TRACK_C_SECTIONS,
  type TrackCBulkAssignmentProposal,
  type TrackCCrewDetail,
  type TrackCSection,
  type TrackCState,
  type TrackCTrade,
  type TrackCUnit,
  type TrackCWorkProjection,
  type TrackCWorkTarget,
  trackCWorkKey,
} from '../model';
import {
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
  type TrackCSectionAction,
} from '../operations';
import {
  projectTrackCAssignmentEligibility,
  projectTrackCCrewDetail,
  projectTrackCWork,
} from '../projections';

export interface Phase2TrackBAssignmentUnit {
  readonly unit: TrackCUnit;
  readonly releasedTargets: readonly TrackCWorkTarget[];
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}

const unique = <T,>(values: readonly T[]) => [...new Set(values)];

export const projectPhase2TrackBAssignmentUnits = (
  state: TrackCState,
  trade: TrackCTrade,
): readonly Phase2TrackBAssignmentUnit[] =>
  state.units.map((unit) => {
    const projections = unit.applicableSections
      .map((section) => projectTrackCWork(state, {
        section,
        trade,
        unitId: unit.id,
      }))
      .filter((projection): projection is TrackCWorkProjection =>
        Boolean(projection),
      );
    const releasedTargets = projections
      .filter((projection) => projection.release === 'released')
      .map(({ section, unitId }) => ({ section, trade, unitId }));
    const eligibility = releasedTargets.map((target) =>
      projectTrackCAssignmentEligibility(state, target),
    );
    const responsibilityReasons = projections.flatMap((projection) => {
      if (projection.assignmentConflict) {
        return [
          `Unit ${unit.unitNumber} has conflicting ${trade} responsibility on ${projection.section}. Resolve it before assigning the Unit.`,
        ];
      }
      if (projection.activeCrewIds.length > 0) {
        return [
          `Unit ${unit.unitNumber} already has confirmed ${trade} responsibility on ${projection.section}. Clear it before assigning the Unit.`,
        ];
      }
      return [];
    });
    const reasons = unique([
      ...(releasedTargets.length === 0
        ? [`Unit ${unit.unitNumber} has no confirmed released ${trade} work.`]
        : eligibility.flatMap((item) => item.reasons)),
      ...responsibilityReasons,
    ]);

    return {
      unit,
      releasedTargets,
      eligible:
        releasedTargets.length > 0 &&
        responsibilityReasons.length === 0 &&
        eligibility.every((item) => item.eligible),
      reasons,
    };
  });

export interface Phase2TrackBAssignmentInput {
  readonly proposalId: string;
  readonly trade: TrackCTrade;
  readonly crewId: string;
  readonly unitIds: readonly string[];
  readonly createdAt: string;
  readonly createdBy: string;
}

export type Phase2TrackBAssignmentResult =
  | { readonly ok: true; readonly value: TrackCBulkAssignmentProposal }
  | { readonly ok: false; readonly error: string };

export const createPhase2TrackBAssignmentProposal = (
  state: TrackCState,
  input: Phase2TrackBAssignmentInput,
): Phase2TrackBAssignmentResult => {
  const crew = state.crews.find((candidate) => candidate.id === input.crewId);
  if (!crew || crew.trade !== input.trade) {
    return {
      ok: false,
      error: `Choose a compatible ${input.trade} crew before review.`,
    };
  }

  const unitIds = unique(input.unitIds);
  if (unitIds.length === 0) {
    return { ok: false, error: 'Choose at least one released eligible Unit.' };
  }

  const options = new Map(
    projectPhase2TrackBAssignmentUnits(state, input.trade).map((option) => [
      option.unit.id,
      option,
    ]),
  );
  const invalidSelection = unitIds
    .map((unitId) => options.get(unitId))
    .find((option) => !option?.eligible);
  if (invalidSelection) {
    return {
      ok: false,
      error:
        invalidSelection.reasons.join(' ') ||
        'One selected Unit is no longer eligible. Review released work again.',
    };
  }
  if (unitIds.some((unitId) => !options.has(unitId))) {
    return {
      ok: false,
      error: 'One selected Unit is not in the active property roster.',
    };
  }

  return {
    ok: true,
    value: createTrackCBulkAssignmentProposal(state, {
      proposalId: input.proposalId,
      trade: input.trade,
      crewId: input.crewId,
      unitIds,
      sectionMode: 'all-released',
      createdAt: input.createdAt,
      createdBy: input.createdBy,
    }),
  };
};

export const confirmPhase2TrackBAssignmentProposal = (
  state: TrackCState,
  proposal: TrackCBulkAssignmentProposal,
  input: Parameters<typeof confirmTrackCBulkAssignmentProposal>[2],
): ReturnType<typeof confirmTrackCBulkAssignmentProposal> => {
  const options = new Map(
    projectPhase2TrackBAssignmentUnits(state, proposal.trade).map((option) => [
      option.unit.id,
      option,
    ]),
  );
  const invalidUnit = proposal.unitIds
    .map((unitId) => options.get(unitId))
    .find((option) => !option?.eligible);

  if (invalidUnit) {
    return {
      ok: false,
      error: {
        code: 'invalid-proposal',
        message:
          `The reviewed proposal is stale because Unit-level responsibility changed. ${invalidUnit.reasons.join(' ')}`,
      },
    };
  }

  if (proposal.unitIds.some((unitId) => !options.has(unitId))) {
    return {
      ok: false,
      error: {
        code: 'invalid-proposal',
        message:
          'The reviewed proposal is stale because a Unit left the active property roster.',
      },
    };
  }

  return confirmTrackCBulkAssignmentProposal(state, proposal, input);
};

export interface Phase2TrackBCrewDetail extends TrackCCrewDetail {
  readonly currentAssignedUnitIds: readonly string[];
  readonly callbackHistory: readonly Phase2TrackBCallbackHistoryRecord[];
}

export interface Phase2TrackBCallbackHistoryRecord {
  readonly callbackId: string;
  readonly target: TrackCWorkTarget;
  readonly assignmentEventIdAtOpen?: string;
  readonly responsibleCrewIdAtOpen?: string;
  readonly responsibleCrewLabel: string;
  readonly responsibleCrewReference:
    | 'current-roster'
    | 'stable-id-fallback'
    | 'not-recorded';
  readonly openedAt: string;
  readonly openedBy: string;
  readonly openingNote: string;
  readonly sourceLabel: string;
  readonly correctionReportedAt?: string;
  readonly correctionReportedBy?: string;
  readonly correctionNote?: string;
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
  readonly resolutionNote?: string;
  readonly state: 'open' | 'resolved';
}

interface MutableCallbackHistoryRecord {
  callbackId: string;
  target: TrackCWorkTarget;
  assignmentEventIdAtOpen?: string;
  responsibleCrewIdAtOpen?: string;
  responsibleCrewLabel: string;
  responsibleCrewReference:
    | 'current-roster'
    | 'stable-id-fallback'
    | 'not-recorded';
  openedAt: string;
  openedBy: string;
  openingNote: string;
  sourceLabel: string;
  correctionReportedAt?: string;
  correctionReportedBy?: string;
  correctionNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  state: 'open' | 'resolved';
}

export const projectPhase2TrackBCallbackHistory = (
  state: TrackCState,
): readonly Phase2TrackBCallbackHistoryRecord[] => {
  const activeAssignmentByTarget = new Map<
    string,
    TrackCState['events'][number]
  >();
  const openCallbackByTarget = new Map<
    string,
    MutableCallbackHistoryRecord
  >();
  const history: MutableCallbackHistoryRecord[] = [];

  state.events
    .filter((event) => event.confirmation === 'confirmed')
    .forEach((event) => {
      const targetKey = trackCWorkKey(event.target);
      if (event.eventType === 'assignment-confirmed' && event.crewId) {
        activeAssignmentByTarget.set(targetKey, event);
        return;
      }
      if (event.eventType === 'assignment-cleared') {
        const activeAssignment = activeAssignmentByTarget.get(targetKey);
        if (!event.crewId || activeAssignment?.crewId === event.crewId) {
          activeAssignmentByTarget.delete(targetKey);
        }
        return;
      }
      if (
        event.eventType !== 'callback-opened' &&
        event.eventType !== 'property-correction-requested' &&
        event.eventType !== 'callback-correction-reported' &&
        event.eventType !== 'callback-resolved'
      ) {
        return;
      }

      if (
        event.eventType === 'callback-opened' ||
        event.eventType === 'property-correction-requested'
      ) {
        const rosterCrew = event.crewId
          ? state.crews.find((crew) => crew.id === event.crewId)
          : undefined;
        const activeAssignment = activeAssignmentByTarget.get(targetKey);
        const record: MutableCallbackHistoryRecord = {
          callbackId: event.id,
          target: event.target,
          assignmentEventIdAtOpen:
            activeAssignment?.crewId === event.crewId
              ? activeAssignment?.id
              : undefined,
          responsibleCrewIdAtOpen: event.crewId,
          responsibleCrewLabel:
            rosterCrew?.name ??
            (event.crewId ? `Former crew (${event.crewId})` : 'Crew not recorded'),
          responsibleCrewReference: rosterCrew
            ? 'current-roster'
            : event.crewId
              ? 'stable-id-fallback'
              : 'not-recorded',
          openedAt: event.recordedAt,
          openedBy: event.recordedBy,
          openingNote: event.summary,
          sourceLabel: event.sourceLabel,
          state: 'open',
        };
        history.push(record);
        openCallbackByTarget.set(targetKey, record);
        return;
      }

      const openCallback = openCallbackByTarget.get(targetKey);
      if (!openCallback) return;
      if (
        event.crewId &&
        openCallback.responsibleCrewIdAtOpen &&
        event.crewId !== openCallback.responsibleCrewIdAtOpen
      ) {
        return;
      }
      if (event.eventType === 'callback-correction-reported') {
        openCallback.correctionReportedAt = event.recordedAt;
        openCallback.correctionReportedBy = event.recordedBy;
        openCallback.correctionNote = event.summary;
        return;
      }
      openCallback.resolvedAt = event.recordedAt;
      openCallback.resolvedBy = event.recordedBy;
      openCallback.resolutionNote = event.summary;
      openCallback.state = 'resolved';
      openCallbackByTarget.delete(targetKey);
    });

  return history
    .map((record) => ({ ...record }))
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt));
};

export const projectPhase2TrackBCrewDetail = (
  state: TrackCState,
  crewId: string,
): Phase2TrackBCrewDetail | undefined => {
  const detail = projectTrackCCrewDetail(state, crewId);
  if (!detail) return undefined;

  const callbackHistory = projectPhase2TrackBCallbackHistory(state).filter(
    (record) => record.responsibleCrewIdAtOpen === crewId,
  );

  return {
    ...detail,
    stats: {
      ...detail.stats,
      openCallbacks: callbackHistory.filter((record) => record.state === 'open')
        .length,
      resolvedCallbacks: callbackHistory.filter(
        (record) => record.state === 'resolved',
      ).length,
    },
    recentActivity: detail.recentActivity.filter(
      (event) => event.crewId === crewId,
    ),
    currentAssignedUnitIds: unique(
      detail.currentWork.map((work) => work.unitId),
    ),
    callbackHistory,
  };
};

export const PHASE2_ADDITIONAL_SCOPE_CATEGORIES = [
  'full-paint',
  'doors',
  'drywall-repair',
  'bathtub-clean',
  'other',
] as const;

export const PHASE2_ADDITIONAL_SCOPE_STATUSES = [
  'recorded',
  'in-progress',
  'reported-complete',
  'deferred',
] as const;

export type Phase2AdditionalScopeCategory =
  (typeof PHASE2_ADDITIONAL_SCOPE_CATEGORIES)[number];
export type Phase2AdditionalScopeStatus =
  (typeof PHASE2_ADDITIONAL_SCOPE_STATUSES)[number];
export type Phase2ChangeOrderCandidate = 'yes' | 'no' | 'uncertain';
export type Phase2ScopeSourceConfidence = 'confirmed' | 'uncertain';
export type Phase2AdditionalScopeTradeClassification =
  | TrackCTrade
  | 'trade-neutral';

export interface Phase2AdditionalScopeRecord {
  readonly id: string;
  readonly unitId: string;
  readonly category: Phase2AdditionalScopeCategory;
  readonly description: string;
  readonly tradeClassification: Phase2AdditionalScopeTradeClassification;
  readonly trade?: TrackCTrade;
  readonly sections: readonly TrackCSection[];
  readonly sourceContact: string;
  readonly sourceConfidence: Phase2ScopeSourceConfidence;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly requiredForBaseCompletion: boolean;
  readonly changeOrderCandidate: Phase2ChangeOrderCandidate;
  readonly status: Phase2AdditionalScopeStatus;
  readonly personalRecordOnly: true;
  readonly pricingCalculated: false;
  readonly approvalGranted: false;
  readonly officialFormSubmitted: false;
}

export interface Phase2AdditionalScopeInput {
  readonly id: string;
  readonly unitId: string;
  readonly category: Phase2AdditionalScopeCategory;
  readonly description: string;
  readonly tradeClassification: Phase2AdditionalScopeTradeClassification;
  readonly sections?: readonly TrackCSection[];
  readonly sourceContact: string;
  readonly sourceConfidence: Phase2ScopeSourceConfidence;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly requiredForBaseCompletion: boolean;
  readonly changeOrderCandidate: Phase2ChangeOrderCandidate;
  readonly status: Phase2AdditionalScopeStatus;
}

export type Phase2AdditionalScopeResult =
  | { readonly ok: true; readonly value: Phase2AdditionalScopeRecord }
  | { readonly ok: false; readonly error: string };

export interface Phase2AdditionalScopeCommitReceipt {
  readonly recordId: string;
  readonly committedAt: string;
  readonly durable: true;
}

export type Phase2AdditionalScopeCommitResult =
  | {
      readonly ok: true;
      readonly receipt: Phase2AdditionalScopeCommitReceipt;
    }
  | { readonly ok: false; readonly error: string };

export type Phase2AdditionalScopeCommit = (
  record: Phase2AdditionalScopeRecord,
) => Promise<Phase2AdditionalScopeCommitResult>;

const tradeClassificationsByCategory: Readonly<
  Record<
    Phase2AdditionalScopeCategory,
    readonly Phase2AdditionalScopeTradeClassification[]
  >
> = {
  'full-paint': ['paint'],
  doors: ['paint'],
  'drywall-repair': ['trade-neutral'],
  'bathtub-clean': ['clean'],
  other: ['trade-neutral', 'paint', 'clean'],
};

export const phase2AdditionalScopeTradeOptions = (
  category: Phase2AdditionalScopeCategory,
): readonly Phase2AdditionalScopeTradeClassification[] =>
  tradeClassificationsByCategory[category] ?? [];

export const phase2AdditionalScopeDefaultTradeClassification = (
  category: Phase2AdditionalScopeCategory,
): Phase2AdditionalScopeTradeClassification | undefined => {
  const options = phase2AdditionalScopeTradeOptions(category);
  return options.length === 1 ? options[0] : undefined;
};

export const phase2AdditionalScopeTradeLabel = (
  trade: Phase2AdditionalScopeTradeClassification,
) =>
  trade === 'paint'
    ? 'Paint'
    : trade === 'clean'
      ? 'Clean'
      : 'Trade-neutral / other scope';

export const validatePhase2AdditionalScopeTrade = (
  category: Phase2AdditionalScopeCategory,
  tradeClassification: Phase2AdditionalScopeTradeClassification,
): Phase2AdditionalScopeResult | undefined => {
  const compatible = phase2AdditionalScopeTradeOptions(category);
  if (!compatible.includes(tradeClassification)) {
    return {
      ok: false,
      error: `${phase2AdditionalScopeCategoryLabel(category)} is incompatible with ${phase2AdditionalScopeTradeLabel(tradeClassification)}. Review the category and trade classification before saving.`,
    };
  }
  return undefined;
};

export const createPhase2AdditionalScopeRecord = (
  state: TrackCState,
  input: Phase2AdditionalScopeInput,
): Phase2AdditionalScopeResult => {
  const unit = state.units.find((candidate) => candidate.id === input.unitId);
  if (!unit) {
    return { ok: false, error: 'Choose a Unit from the active property roster.' };
  }
  if (!PHASE2_ADDITIONAL_SCOPE_CATEGORIES.includes(input.category)) {
    return { ok: false, error: 'Choose a supported additional-scope category.' };
  }
  if (!input.description.trim()) {
    return { ok: false, error: 'Describe the additional scope.' };
  }
  if (!input.tradeClassification) {
    return {
      ok: false,
      error: 'Choose Paint, Clean, or trade-neutral classification.',
    };
  }
  const tradeError = validatePhase2AdditionalScopeTrade(
    input.category,
    input.tradeClassification,
  );
  if (tradeError) return tradeError;
  if (!input.sourceContact.trim()) {
    return {
      ok: false,
      error: 'Record the source or contact who supplied this scope.',
    };
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    return { ok: false, error: 'Record a valid date and time.' };
  }
  if (!PHASE2_ADDITIONAL_SCOPE_STATUSES.includes(input.status)) {
    return { ok: false, error: 'Choose a supported personal status.' };
  }

  const sections = unique(input.sections ?? []);
  if (
    sections.some(
      (section) =>
        !TRACK_C_SECTIONS.includes(section) ||
        !unit.applicableSections.includes(section),
    )
  ) {
    return {
      ok: false,
      error: 'Additional scope may use only applicable Common/A-E sections.',
    };
  }

  return {
    ok: true,
    value: {
      id: input.id,
      unitId: input.unitId,
      category: input.category,
      description: input.description,
      tradeClassification: input.tradeClassification,
      trade:
        input.tradeClassification === 'trade-neutral'
          ? undefined
          : input.tradeClassification,
      sections,
      sourceContact: input.sourceContact,
      sourceConfidence: input.sourceConfidence,
      occurredAt: input.occurredAt,
      recordedAt: input.recordedAt,
      requiredForBaseCompletion: input.requiredForBaseCompletion,
      changeOrderCandidate: input.changeOrderCandidate,
      status: input.status,
      personalRecordOnly: true,
      pricingCalculated: false,
      approvalGranted: false,
      officialFormSubmitted: false,
    },
  };
};

export const commitPhase2AdditionalScopeRecord = async (
  state: TrackCState,
  record: Phase2AdditionalScopeRecord,
  commit: Phase2AdditionalScopeCommit,
): Promise<Phase2AdditionalScopeCommitResult> => {
  const validated = createPhase2AdditionalScopeRecord(state, {
    id: record.id,
    unitId: record.unitId,
    category: record.category,
    description: record.description,
    tradeClassification: record.tradeClassification,
    sections: record.sections,
    sourceContact: record.sourceContact,
    sourceConfidence: record.sourceConfidence,
    occurredAt: record.occurredAt,
    recordedAt: record.recordedAt,
    requiredForBaseCompletion: record.requiredForBaseCompletion,
    changeOrderCandidate: record.changeOrderCandidate,
    status: record.status,
  });
  if (!validated.ok) {
    return validated;
  }
  if (validated.value.trade !== record.trade) {
    return {
      ok: false,
      error:
        'The reviewed category and stored trade no longer match. Review the draft before saving.',
    };
  }
  return commit(validated.value);
};

export const phase2AdditionalScopeBlocksBaseCompletion = (
  scope: Phase2AdditionalScopeRecord,
) =>
  scope.requiredForBaseCompletion &&
  scope.status !== 'reported-complete';

const phase2AdditionalScopeMatchesTarget = (
  scope: Phase2AdditionalScopeRecord,
  target: TrackCWorkTarget,
) =>
  scope.unitId === target.unitId &&
  (!scope.trade || scope.trade === target.trade) &&
  (scope.sections.length === 0 || scope.sections.includes(target.section));

export const projectPhase2AdditionalScopeActionBlockers = (
  scopes: readonly Phase2AdditionalScopeRecord[],
  target: TrackCWorkTarget,
  action: TrackCSectionAction,
): readonly Phase2AdditionalScopeRecord[] => {
  if (
    action !== 'record-los-pass' &&
    action !== 'record-reinspection-pass'
  ) {
    return [];
  }

  return scopes.filter(
    (scope) =>
      phase2AdditionalScopeBlocksBaseCompletion(scope) &&
      phase2AdditionalScopeMatchesTarget(scope, target),
  );
};

export interface Phase2AdditionalScopeCompletion {
  readonly blocked: boolean;
  readonly optionalCount: number;
  readonly requiredCompleteCount: number;
  readonly requiredUnresolvedCount: number;
}

export const projectPhase2AdditionalScopeCompletion = (
  scopes: readonly Phase2AdditionalScopeRecord[],
): Phase2AdditionalScopeCompletion => ({
  blocked: scopes.some(phase2AdditionalScopeBlocksBaseCompletion),
  optionalCount: scopes.filter((scope) => !scope.requiredForBaseCompletion)
    .length,
  requiredCompleteCount: scopes.filter(
    (scope) =>
      scope.requiredForBaseCompletion && scope.status === 'reported-complete',
  ).length,
  requiredUnresolvedCount: scopes.filter(
    phase2AdditionalScopeBlocksBaseCompletion,
  ).length,
});

export const phase2AdditionalScopeCategoryLabel = (
  category: Phase2AdditionalScopeCategory,
) =>
  ({
    'full-paint': 'Full Paint',
    doors: 'Doors',
    'drywall-repair': 'Drywall Repair',
    'bathtub-clean': 'Bathtub Clean',
    other: 'Other',
  })[category];

export const phase2AdditionalScopeStatusLabel = (
  status: Phase2AdditionalScopeStatus,
) =>
  ({
    recorded: 'Recorded',
    'in-progress': 'In progress',
    'reported-complete': 'Reported complete',
    deferred: 'Deferred',
  })[status];
