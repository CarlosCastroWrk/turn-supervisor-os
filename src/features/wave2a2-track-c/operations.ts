import {
  TRACK_C_SECTIONS,
  type TrackCAssignmentReceipt,
  type TrackCAssignmentWarning,
  type TrackCBulkAssignmentProposal,
  type TrackCBulkAssignmentProposalItem,
  type TrackCConfirmedEvent,
  type TrackCResult,
  type TrackCSection,
  type TrackCState,
  type TrackCTrade,
  type TrackCWalkOutcomeRecord,
  type TrackCWalkSession,
  type TrackCWorkProjection,
  type TrackCWorkTarget,
} from './model';
import { trackCWorkKey } from './model';
import {
  projectTrackCWalkCandidates,
  projectTrackCWork,
} from './projections';

const error = (
  code: Parameters<typeof operationError>[0],
  message: string,
) => ({ ok: false, error: operationError(code, message) }) as const;

const operationError = (
  code:
    | 'not-found'
    | 'invalid-transition'
    | 'blocked'
    | 'invalid-proposal'
    | 'active-walk-exists'
    | 'no-active-walk'
    | 'not-walk-candidate'
    | 'incomplete-walk'
    | 'mirror-not-eligible'
    | 'confirmation-required',
  message: string,
) => ({ code, message }) as const;

const confirmedEvent = (
  input: Omit<
    TrackCConfirmedEvent,
    | 'confirmation'
    | 'personalRecordOnly'
    | 'officialPaperChanged'
    | 'payrollChanged'
  >,
): TrackCConfirmedEvent => ({
  ...input,
  confirmation: 'confirmed',
  personalRecordOnly: true,
  officialPaperChanged: false,
  payrollChanged: false,
});

const appendEvents = (
  state: TrackCState,
  events: readonly TrackCConfirmedEvent[],
): TrackCState => ({
  ...state,
  events: [...state.events, ...events],
});

const transitionBlocker = (
  projection: TrackCWorkProjection,
): string | undefined => {
  if (projection.release !== 'released') return 'Work is not confirmed released.';
  if (projection.access === 'occupied-restricted') {
    return 'Occupied or restricted scope cannot be entered.';
  }
  if (projection.access !== 'clear') return 'Access is blocked.';
  if (projection.sourceConfidence !== 'confirmed') {
    return 'Source evidence is uncertain or conflicting.';
  }
  if (projection.assignmentConflict) return 'Assignment evidence conflicts.';
  return undefined;
};

export type TrackCSectionAction =
  | 'start-work'
  | 'record-crew-complete'
  | 'record-los-pass'
  | 'open-callback'
  | 'record-correction-ready'
  | 'record-reinspection-pass';

export interface TrackCSectionActionRequest {
  readonly eventId: string;
  readonly action: TrackCSectionAction;
  readonly target: TrackCWorkTarget;
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly note?: string;
}

export const applyTrackCSectionAction = (
  state: TrackCState,
  request: TrackCSectionActionRequest,
): TrackCResult<TrackCState> => {
  const projection = projectTrackCWork(state, request.target);
  if (!projection) return error('not-found', 'The selected section/trade was not found.');

  const blocker = transitionBlocker(projection);
  if (blocker) return error('blocked', blocker);
  if (projection.activeCrewIds.length !== 1) {
    return error(
      'blocked',
      'Exactly one confirmed responsible crew is required before work actions.',
    );
  }

  const crewId = projection.responsibleCrewId;
  let eventType: TrackCConfirmedEvent['eventType'];
  let summary: string;

  switch (request.action) {
    case 'start-work':
      if (projection.execution !== 'assigned') {
        return error('invalid-transition', 'Start Work requires an assigned section.');
      }
      eventType = 'work-started';
      summary = request.note ?? 'Los recorded that work started.';
      break;
    case 'record-crew-complete':
      if (!['assigned', 'working'].includes(projection.execution)) {
        return error(
          'invalid-transition',
          'Crew-reported completion requires assigned or working scope.',
        );
      }
      eventType = 'crew-reported-complete';
      summary =
        request.note ??
        'Crew-reported completion recorded. Los inspection remains separate.';
      break;
    case 'record-los-pass':
      if (projection.inspection !== 'needs-los-inspection') {
        return error(
          'invalid-transition',
          'Los pass requires confirmed crew-reported completion.',
        );
      }
      eventType = 'los-passed';
      summary =
        request.note ??
        'Los inspection passed. Property acceptance remains pending.';
      break;
    case 'open-callback':
      if (
        projection.execution !== 'crew-reported-complete' &&
        projection.inspection !== 'los-passed'
      ) {
        return error(
          'invalid-transition',
          'A callback requires completed work that Los can inspect.',
        );
      }
      eventType = 'callback-opened';
      summary = request.note ?? 'Los opened a callback for the responsible crew.';
      break;
    case 'record-correction-ready':
      if (projection.inspection !== 'callback-open') {
        return error(
          'invalid-transition',
          'Correction ready requires an open callback.',
        );
      }
      eventType = 'callback-correction-reported';
      summary =
        request.note ??
        'Correction was reported ready. Los reinspection is still required.';
      break;
    case 'record-reinspection-pass':
      if (projection.inspection !== 'reinspection-pending') {
        return error(
          'invalid-transition',
          'Reinspection pass requires a correction reported ready.',
        );
      }
      eventType = 'callback-resolved';
      summary =
        request.note ??
        'Los passed reinspection. Property acceptance remains pending.';
      break;
  }

  return {
    ok: true,
    value: appendEvents(state, [
      confirmedEvent({
        id: request.eventId,
        eventType,
        target: request.target,
        crewId,
        recordedAt: request.recordedAt,
        recordedBy: request.recordedBy,
        sourceType: 'personal-confirmation',
        sourceLabel: 'Los explicit section action',
        summary,
      }),
    ]),
  };
};

export interface TrackCBulkProposalInput {
  readonly proposalId: string;
  readonly trade: TrackCTrade;
  readonly crewId: string;
  readonly unitIds: readonly string[];
  readonly sectionMode: 'all-released' | 'specific';
  readonly sections?: readonly TrackCSection[];
  readonly createdAt: string;
  readonly createdBy: string;
}

const warningForProjection = (
  projection: TrackCWorkProjection,
): readonly TrackCAssignmentWarning[] => {
  const warnings: TrackCAssignmentWarning[] = [];
  const target = {
    unitId: projection.unitId,
    trade: projection.trade,
    section: projection.section,
  };
  if (projection.release === 'unreleased') {
    warnings.push({
      code: 'unreleased',
      severity: 'blocking',
      message: 'Section is not released.',
      target,
    });
  }
  if (projection.release === 'assignment-conflict') {
    warnings.push({
      code: 'assignment-source-conflict',
      severity: 'blocking',
      message: 'Assignment-source evidence conflicts.',
      target,
    });
  }
  if (
    projection.release === 'source-uncertain' ||
    projection.sourceConfidence === 'uncertain'
  ) {
    warnings.push({
      code: 'source-uncertain',
      severity: 'blocking',
      message: 'Release or assignment source remains uncertain.',
      target,
    });
  }
  if (projection.sourceConfidence === 'conflicting') {
    warnings.push({
      code: 'assignment-source-conflict',
      severity: 'blocking',
      message: 'Source evidence conflicts.',
      target,
    });
  }
  if (projection.activeCrewIds.length > 0) {
    warnings.push({
      code: 'duplicate-active-crew',
      severity: 'blocking',
      message: 'A confirmed active crew is already assigned.',
      target,
    });
  }
  if (projection.access === 'occupied-restricted') {
    warnings.push({
      code: 'occupancy-restriction',
      severity: 'blocking',
      message: 'Occupied or restricted scope must not be assigned.',
      target,
    });
  }
  if (projection.access === 'access-blocked') {
    warnings.push({
      code: 'access-conflict',
      severity: 'blocking',
      message: 'Access is blocked.',
      target,
    });
  }
  if (projection.access === 'maintenance-blocked') {
    warnings.push({
      code: 'maintenance-blocked',
      severity: 'blocking',
      message: 'Maintenance is blocking the section.',
      target,
    });
  }
  return warnings;
};

export const createTrackCBulkAssignmentProposal = (
  state: TrackCState,
  input: TrackCBulkProposalInput,
): TrackCBulkAssignmentProposal => {
  const crew = state.crews.find((candidate) => candidate.id === input.crewId);
  const requestedSections =
    input.sectionMode === 'specific'
      ? [...new Set(input.sections ?? [])]
      : TRACK_C_SECTIONS;
  const items: TrackCBulkAssignmentProposalItem[] = [];
  const proposalWarnings: TrackCAssignmentWarning[] = [];

  if (!crew || crew.trade !== input.trade) {
    proposalWarnings.push({
      code: 'crew-trade-mismatch',
      severity: 'blocking',
      message: `Selected crew is not a compatible ${input.trade} crew.`,
    });
  }

  for (const unitId of [...new Set(input.unitIds)]) {
    const unit = state.units.find((candidate) => candidate.id === unitId);
    if (!unit) continue;
    const candidateSections =
      input.sectionMode === 'all-released'
        ? unit.applicableSections
        : unit.applicableSections.filter((section) =>
            requestedSections.includes(section)
          );
    const candidateProjections = candidateSections
      .map((section) => projectTrackCWork(state, { unitId, trade: input.trade, section }))
      .filter((item): item is TrackCWorkProjection => Boolean(item));

    const selectedProjections =
      input.sectionMode === 'all-released'
        ? candidateProjections.filter((item) => item.release === 'released')
        : candidateProjections;

    if (selectedProjections.length === 0) {
      proposalWarnings.push({
        code: 'no-applicable-released-sections',
        severity: 'caution',
        message: `Unit ${unit.unitNumber} has no applicable released ${input.trade} sections in this selection.`,
      });
      continue;
    }

    for (const projection of selectedProjections) {
      const warnings = [
        ...warningForProjection(projection),
        ...proposalWarnings.filter((warning) => warning.code === 'crew-trade-mismatch'),
      ];
      items.push({
        target: {
          unitId: projection.unitId,
          trade: projection.trade,
          section: projection.section,
        },
        eligible: warnings.every((warning) => warning.severity !== 'blocking'),
        warnings,
      });
    }
  }

  return {
    id: input.proposalId,
    trade: input.trade,
    crewId: input.crewId,
    unitIds: [...new Set(input.unitIds)],
    sectionMode: input.sectionMode,
    requestedSections,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    items,
    warnings: proposalWarnings,
    personalProposalOnly: true,
    officialPaperChanged: false,
    payrollChanged: false,
  };
};

export interface TrackCConfirmBulkInput {
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly eventIdPrefix: string;
  readonly confirmed: boolean;
}

export const confirmTrackCBulkAssignmentProposal = (
  state: TrackCState,
  proposal: TrackCBulkAssignmentProposal,
  input: TrackCConfirmBulkInput,
): TrackCResult<{
  readonly state: TrackCState;
  readonly receipt: TrackCAssignmentReceipt;
}> => {
  if (!input.confirmed) {
    return error('confirmation-required', 'Explicit proposal confirmation is required.');
  }
  const eligibleItems = proposal.items.filter((item) => item.eligible);
  if (eligibleItems.length === 0) {
    return error('invalid-proposal', 'The proposal contains no eligible sections.');
  }
  const crew = state.crews.find((candidate) => candidate.id === proposal.crewId);
  if (!crew || crew.trade !== proposal.trade) {
    return error('invalid-proposal', 'The selected crew is not compatible.');
  }

  for (const item of proposal.items) {
    const current = projectTrackCWork(state, item.target);
    if (!current) {
      return error(
        'invalid-proposal',
        'The reviewed proposal is stale because a selected section no longer exists. Review again.',
      );
    }
    const currentWarnings = warningForProjection(current);
    const currentlyEligible = currentWarnings.every(
      (warning) => warning.severity !== 'blocking',
    );
    if (currentlyEligible !== item.eligible) {
      return error(
        'invalid-proposal',
        'The reviewed proposal is stale because assignment, access, release, or source evidence changed. Review again.',
      );
    }
  }

  const events = eligibleItems.map((item, index) =>
    confirmedEvent({
      id: `${input.eventIdPrefix}-${index + 1}`,
      eventType: 'assignment-confirmed',
      target: item.target,
      crewId: proposal.crewId,
      recordedAt: input.recordedAt,
      recordedBy: input.recordedBy,
      sourceType: 'personal-confirmation',
      sourceLabel: `Confirmed personal proposal ${proposal.id}`,
      summary:
        'Personal crew assignment recorded. Authoritative paper and payroll remain unchanged.',
    })
  );
  const assignedTargets = eligibleItems.map((item) => item.target);
  const skippedTargets = proposal.items
    .filter((item) => !item.eligible)
    .map((item) => item.target);

  return {
    ok: true,
    value: {
      state: appendEvents(state, events),
      receipt: {
        proposalId: proposal.id,
        assignedTargets,
        skippedTargets,
        recordedAt: input.recordedAt,
        officialPaperChanged: false,
        payrollChanged: false,
      },
    },
  };
};

export interface TrackCStartWalkInput {
  readonly walkSessionId: string;
  readonly propertyContact: string;
  readonly selectedTargets: readonly TrackCWorkTarget[];
  readonly startedAt: string;
  readonly startedBy: string;
  readonly confirmedLosInspection: boolean;
}

export const startTrackCWalk = (
  state: TrackCState,
  input: TrackCStartWalkInput,
): TrackCResult<TrackCState> => {
  if (state.activeWalk) {
    return error('active-walk-exists', 'End the active walk before starting another.');
  }
  if (!input.confirmedLosInspection) {
    return error(
      'confirmation-required',
      'Confirm that Los inspected every selected item.',
    );
  }
  if (!input.propertyContact.trim()) {
    return error('confirmation-required', 'A property walkthrough contact is required.');
  }
  const candidateKeys = new Set(
    projectTrackCWalkCandidates(state).map((candidate) =>
      trackCWorkKey(candidate.target)
    ),
  );
  const selectedTargets = [
    ...new Map(
      input.selectedTargets.map((target) => [trackCWorkKey(target), target]),
    ).values(),
  ];
  if (
    selectedTargets.length === 0 ||
    selectedTargets.some((target) => !candidateKeys.has(trackCWorkKey(target)))
  ) {
    return error(
      'not-walk-candidate',
      'Every selected item must be Los-passed, unblocked, pending property walk, and not accepted.',
    );
  }
  const activeWalk: TrackCWalkSession = {
    id: input.walkSessionId,
    propertyContact: input.propertyContact.trim(),
    startedAt: input.startedAt,
    startedBy: input.startedBy,
    selectedTargets,
    status: 'active',
  };
  return { ok: true, value: { ...state, activeWalk } };
};

export interface TrackCEndWalkInput {
  readonly endedAt: string;
  readonly recordedBy: string;
  readonly eventIdPrefix: string;
  readonly outcomes: readonly TrackCWalkOutcomeRecord[];
}

export const endTrackCWalk = (
  state: TrackCState,
  input: TrackCEndWalkInput,
): TrackCResult<TrackCState> => {
  const activeWalk = state.activeWalk;
  if (!activeWalk) return error('no-active-walk', 'There is no active walk to end.');
  const outcomeByKey = new Map(
    input.outcomes.map((outcome) => [trackCWorkKey(outcome.target), outcome]),
  );
  if (
    activeWalk.selectedTargets.some(
      (target) => !outcomeByKey.has(trackCWorkKey(target)),
    )
  ) {
    return error(
      'incomplete-walk',
      'Record Accepted, Correction, Not walked, or Deferred for every selected item.',
    );
  }

  const outcomes = activeWalk.selectedTargets.map(
    (target) => outcomeByKey.get(trackCWorkKey(target)) as TrackCWalkOutcomeRecord,
  );
  const events = outcomes.map((outcome, index) => {
    const projection = projectTrackCWork(state, outcome.target);
    const crewId = projection?.responsibleCrewId;
    const common = {
      id: `${input.eventIdPrefix}-${index + 1}`,
      target: outcome.target,
      crewId,
      recordedAt: input.endedAt,
      recordedBy: input.recordedBy,
      sourceType: 'property-walk-observation' as const,
      sourceLabel: `Walk with ${activeWalk.propertyContact}`,
      walkSessionId: activeWalk.id,
    };
    switch (outcome.outcome) {
      case 'accepted':
        return confirmedEvent({
          ...common,
          eventType: 'property-accepted',
          summary:
            outcome.note ??
            'Property acceptance recorded personally. Paper and payroll remain unchanged.',
        });
      case 'correction-requested':
        return confirmedEvent({
          ...common,
          eventType: 'property-correction-requested',
          summary:
            outcome.note ??
            'Property correction requested. Responsible crew was preserved for callback.',
        });
      case 'not-walked':
        return confirmedEvent({
          ...common,
          eventType: 'walk-not-walked',
          summary: outcome.note ?? 'This item was not walked.',
        });
      case 'deferred':
        return confirmedEvent({
          ...common,
          eventType: 'walk-deferred',
          summary: outcome.note ?? 'This item was deferred for a later property walk.',
        });
    }
  });

  const completedWalk: TrackCWalkSession = {
    ...activeWalk,
    status: 'completed',
    endedAt: input.endedAt,
    outcomes,
  };
  return {
    ok: true,
    value: {
      ...appendEvents(state, events),
      activeWalk: undefined,
      completedWalks: [...state.completedWalks, completedWalk],
    },
  };
};

export interface TrackCRecordMirrorInput {
  readonly eventId: string;
  readonly target: TrackCWorkTarget;
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly confirmed: boolean;
}

export const recordTrackCPersonalPdsMirror = (
  state: TrackCState,
  input: TrackCRecordMirrorInput,
): TrackCResult<TrackCState> => {
  if (!input.confirmed) {
    return error(
      'confirmation-required',
      'Explicit confirmation is required for the personal paper mirror.',
    );
  }
  const projection = projectTrackCWork(state, input.target);
  if (!projection) return error('not-found', 'The selected section/trade was not found.');
  if (projection.property !== 'property-accepted') {
    return error(
      'mirror-not-eligible',
      'Property acceptance is required before recording the personal PDS mirror.',
    );
  }
  if (projection.personalPdsMirror) {
    return error('invalid-transition', 'The personal paper mirror is already recorded.');
  }
  return {
    ok: true,
    value: appendEvents(state, [
      confirmedEvent({
        id: input.eventId,
        eventType: 'personal-pds-mirror-recorded',
        target: input.target,
        crewId: projection.responsibleCrewId,
        recordedAt: input.recordedAt,
        recordedBy: input.recordedBy,
        sourceType: 'personal-confirmation',
        sourceLabel: 'Los explicit personal paper mirror',
        summary:
          'Personal PDS Approved paper mirror recorded. Update the authoritative paper TurnBoard.',
      }),
    ]),
  };
};

export const TRACK_C_OPERATION_BOUNDARY = Object.freeze({
  recordAuthority: 'personal-turn-os-only',
  officialPaperAuthority: 'unchanged',
  payrollEffect: 'none',
  automaticApproval: false,
  legalSignature: false,
  wholeUnitDone: false,
});
