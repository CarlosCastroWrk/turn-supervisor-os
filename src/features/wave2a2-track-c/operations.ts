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
  type TrackCWalkSelectionReview,
  type TrackCWalkSession,
  type TrackCWorkProjection,
  type TrackCWorkTarget,
} from './model';
import { trackCWorkKey } from './model';
import {
  projectTrackCAssignmentEligibility,
  projectTrackCUnitWork,
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

const sourceOrAssignmentBlocker = (
  projection: TrackCWorkProjection,
): string | undefined => {
  if (projection.release !== 'released') return 'Work is not confirmed released.';
  if (projection.sourceConfidence !== 'confirmed') {
    return 'Source evidence is uncertain or conflicting.';
  }
  if (projection.assignmentConflict) return 'Assignment evidence conflicts.';
  return undefined;
};

const accessBlocker = (
  projection: TrackCWorkProjection,
): string | undefined => {
  if (projection.access === 'occupied-restricted') {
    return 'Occupied or restricted scope cannot be entered.';
  }
  if (projection.access !== 'clear') return 'Access is blocked.';
  return undefined;
};

const transitionBlocker = (
  projection: TrackCWorkProjection,
  action: TrackCSectionAction,
): string | undefined => {
  const sourceBlocker = sourceOrAssignmentBlocker(projection);
  if (sourceBlocker) return sourceBlocker;

  // A crew report is historical evidence. Current access can block Los from
  // entering or inspecting without erasing a completion report already received.
  if (action === 'record-crew-complete') return undefined;
  return accessBlocker(projection);
};

export type TrackCSectionAction =
  | 'start-work'
  | 'record-crew-complete'
  | 'record-los-pass'
  | 'open-callback'
  | 'record-correction-ready'
  | 'record-reinspection-pass'
  | 'reopen-inspection';

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

  const blocker = transitionBlocker(projection, request.action);
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
    case 'reopen-inspection':
      if (projection.inspection !== 'los-passed') {
        return error(
          'invalid-transition',
          'Only a Los-passed section can be reopened for inspection.',
        );
      }
      if (projection.property === 'property-accepted') {
        return error(
          'invalid-transition',
          'Property-accepted work cannot be reopened. Use a walk correction.',
        );
      }
      // The crew's completion report still stands; the recorded pass is
      // superseded by this explicit reopen, and the section returns to
      // Needs Inspection. History keeps both events.
      eventType = 'crew-reported-complete';
      summary =
        request.note ??
        'Los reopened this section for inspection — the earlier pass was recorded in error.';
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

export interface TrackCChangeCrewInput {
  readonly unitId: string;
  readonly trade: TrackCTrade;
  readonly toCrewId: string;
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly eventIdPrefix: string;
}

// Move a Unit+Trade from its current crew to another. Emits an explicit
// assignment-cleared for the outgoing crew, an assignment-confirmed for the
// incoming crew, and work-started, per released section — history preserved.
export const changeTrackCCrew = (
  state: TrackCState,
  input: TrackCChangeCrewInput,
): TrackCResult<TrackCState> => {
  const toCrew = state.crews.find((crew) => crew.id === input.toCrewId);
  if (!toCrew) return error('not-found', 'The selected crew was not found.');
  if (toCrew.trade !== input.trade) {
    return error('blocked', `${toCrew.name} is not a ${input.trade} crew.`);
  }
  const unit = state.units.find((candidate) => candidate.id === input.unitId);
  if (!unit) return error('not-found', 'The Unit was not found.');
  const targets = unit.workFacts
    .filter((fact) => fact.trade === input.trade && fact.release === 'released')
    .map((fact) => ({
      section: fact.section,
      trade: fact.trade,
      unitId: fact.unitId,
    }));
  if (targets.length === 0) {
    return error('blocked', 'No released sections exist for this Unit and trade.');
  }
  const events: TrackCConfirmedEvent[] = [];
  let changed = 0;
  for (const [index, target] of targets.entries()) {
    const projection = projectTrackCWork(state, target);
    if (!projection || projection.property === 'property-accepted') continue;
    const fromCrewId = projection.responsibleCrewId;
    if (fromCrewId === input.toCrewId) continue;
    if (fromCrewId) {
      events.push(confirmedEvent({
        crewId: fromCrewId,
        eventType: 'assignment-cleared',
        id: `${input.eventIdPrefix}-clear-${index}`,
        recordedAt: input.recordedAt,
        recordedBy: input.recordedBy,
        sourceLabel: 'Los crew change',
        sourceType: 'personal-confirmation',
        summary: 'Los moved this work to a different crew.',
        target,
      }));
    }
    events.push(confirmedEvent({
      crewId: input.toCrewId,
      eventType: 'assignment-confirmed',
      id: `${input.eventIdPrefix}-assign-${index}`,
      recordedAt: input.recordedAt,
      recordedBy: input.recordedBy,
      sourceLabel: 'Los crew change',
      sourceType: 'personal-confirmation',
      summary: `Los assigned ${toCrew.name} to this work.`,
      target,
    }));
    events.push(confirmedEvent({
      crewId: input.toCrewId,
      eventType: 'work-started',
      id: `${input.eventIdPrefix}-start-${index}`,
      recordedAt: input.recordedAt,
      recordedBy: input.recordedBy,
      sourceLabel: 'Los crew change',
      sourceType: 'personal-confirmation',
      summary: `${toCrew.name} is working this section.`,
      target,
    }));
    changed += 1;
  }
  if (changed === 0) {
    return error('blocked', 'Nothing to change — this crew already owns the eligible work.');
  }
  return { ok: true, value: appendEvents(state, events) };
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

const fingerprintText = (value: unknown) => {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `track-c-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const reviewedStateFingerprint = (projection: TrackCWorkProjection) =>
  fingerprintText({
    factId: projection.id,
    target: {
      unitId: projection.unitId,
      trade: projection.trade,
      section: projection.section,
    },
    release: projection.release,
    access: projection.access,
    sourceConfidence: projection.sourceConfidence,
    sourceLabel: projection.sourceLabel,
    restrictionLabel: projection.restrictionLabel ?? null,
    activeCrewIds: [...projection.activeCrewIds].sort(),
    assignmentConflict: projection.assignmentConflict,
    confirmedEventCount: projection.confirmedEventCount,
    latestConfirmedEventId: projection.latestConfirmedEvent?.id ?? null,
  });

type TrackCProposalWithoutFingerprint = Omit<
  TrackCBulkAssignmentProposal,
  'reviewFingerprint'
>;

const proposalReviewFingerprint = (
  proposal: TrackCProposalWithoutFingerprint | TrackCBulkAssignmentProposal,
) =>
  fingerprintText({
    id: proposal.id,
    trade: proposal.trade,
    crewId: proposal.crewId,
    unitIds: proposal.unitIds,
    sectionMode: proposal.sectionMode,
    requestedSections: proposal.requestedSections,
    createdAt: proposal.createdAt,
    createdBy: proposal.createdBy,
    items: proposal.items.map((item) => ({
      target: item.target,
      eligible: item.eligible,
      warningCodes: item.warnings.map((warning) => [
        warning.code,
        warning.severity,
      ]),
      reviewedStateFingerprint: item.reviewedStateFingerprint,
    })),
    warningCodes: proposal.warnings.map((warning) => [
      warning.code,
      warning.severity,
    ]),
    personalProposalOnly: proposal.personalProposalOnly,
    officialPaperChanged: proposal.officialPaperChanged,
    payrollChanged: proposal.payrollChanged,
  });

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

    if (
      input.sectionMode === 'all-released'
      && candidateProjections.some((item) => item.release !== 'released')
    ) {
      proposalWarnings.push({
        code: 'unreleased',
        severity: 'caution',
        message: `Unit ${unit.unitNumber} includes unreleased ${input.trade} sections. They were excluded from this proposal.`,
      });
    }

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
        reviewedStateFingerprint: reviewedStateFingerprint(projection),
      });
    }
  }

  const proposal: TrackCProposalWithoutFingerprint = {
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
  return {
    ...proposal,
    reviewFingerprint: proposalReviewFingerprint(proposal),
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
  if (proposalReviewFingerprint(proposal) !== proposal.reviewFingerprint) {
    return error(
      'invalid-proposal',
      'The reviewed proposal identity changed. Review the crew, trade, Units, and sections again.',
    );
  }

  const freshProposal = createTrackCBulkAssignmentProposal(state, {
    proposalId: proposal.id,
    trade: proposal.trade,
    crewId: proposal.crewId,
    unitIds: proposal.unitIds,
    sectionMode: proposal.sectionMode,
    sections: proposal.requestedSections,
    createdAt: proposal.createdAt,
    createdBy: proposal.createdBy,
  });
  if (freshProposal.reviewFingerprint !== proposal.reviewFingerprint) {
    return error(
      'invalid-proposal',
      'The reviewed proposal is stale because assignment, access, release, source, crew, Unit, trade, or section evidence changed. Review again.',
    );
  }

  const eligibleItems = proposal.items.filter((item) => item.eligible);
  if (eligibleItems.length === 0) {
    return error('invalid-proposal', 'The proposal contains no eligible sections.');
  }
  const crew = state.crews.find((candidate) => candidate.id === proposal.crewId);
  if (!crew || crew.trade !== proposal.trade) {
    return error('invalid-proposal', 'The selected crew is not compatible.');
  }
  for (const item of eligibleItems) {
    const eligibility = projectTrackCAssignmentEligibility(state, item.target);
    if (!eligibility.eligible) {
      return error(
        'invalid-proposal',
        `Assignment is no longer eligible: ${eligibility.reasons.join(' ')}`,
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

const walkPackageKey = (
  target: Pick<TrackCWorkTarget, 'trade' | 'unitId'>,
) => `${target.unitId}:${target.trade}`;

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
  const candidates = projectTrackCWalkCandidates(state);
  const requestedTargets = [
    ...new Map(
      input.selectedTargets.map((target) => [trackCWorkKey(target), target]),
    ).values(),
  ];
  const requestedKeys = new Set(requestedTargets.map(trackCWorkKey));
  const selectedCandidates = candidates.filter((candidate) =>
    candidate.targets.some((target) => requestedKeys.has(trackCWorkKey(target))),
  );
  const selectedTargets = selectedCandidates.flatMap(
    (candidate) => candidate.targets,
  );
  const selectedKeys = new Set(selectedTargets.map(trackCWorkKey));
  if (
    requestedTargets.length === 0 ||
    requestedKeys.size !== selectedKeys.size ||
    requestedTargets.some((target) => !selectedKeys.has(trackCWorkKey(target)))
  ) {
    return error(
      'not-walk-candidate',
      'Select the complete Los-passed Unit+Trade package. Partial section walks are not allowed.',
    );
  }
  const reviewedSelections: TrackCWalkSelectionReview[] = [];
  for (const target of selectedTargets) {
    const projection = projectTrackCWork(state, target);
    if (!projection?.responsibleCrewId) {
      return error(
        'not-walk-candidate',
        'Every selected item must retain one confirmed responsible crew.',
      );
    }
    reviewedSelections.push({
      target,
      responsibleCrewId: projection.responsibleCrewId,
      release: projection.release,
      access: projection.access,
      sourceConfidence: projection.sourceConfidence,
      assignmentConflict: projection.assignmentConflict,
      inspection: projection.inspection,
      property: projection.property,
      callbackOpen: projection.callbackOpen,
      confirmedEventCount: projection.confirmedEventCount,
    });
  }
  const activeWalk: TrackCWalkSession = {
    id: input.walkSessionId,
    propertyContact: input.propertyContact.trim(),
    startedAt: input.startedAt,
    startedBy: input.startedBy,
    selectedTargets,
    reviewedSelections,
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
  const selectedKeys = activeWalk.selectedTargets.map(trackCWorkKey);
  const outcomeKeys = input.outcomes.map((outcome) =>
    trackCWorkKey(outcome.target)
  );
  const uniqueOutcomeKeys = new Set(outcomeKeys);
  if (
    input.outcomes.length !== selectedKeys.length ||
    uniqueOutcomeKeys.size !== outcomeKeys.length ||
    outcomeKeys.some((key) => !selectedKeys.includes(key))
  ) {
    return error(
      'incomplete-walk',
      'Record exactly one outcome for every selected section and trade.',
    );
  }
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

  const reviewedByKey = new Map(
    activeWalk.reviewedSelections.map((review) => [
      trackCWorkKey(review.target),
      review,
    ]),
  );
  const currentByKey = new Map<string, TrackCWorkProjection>();
  for (const target of activeWalk.selectedTargets) {
    const key = trackCWorkKey(target);
    const reviewed = reviewedByKey.get(key);
    const current = projectTrackCWork(state, target);
    const stillWalkEligible =
      current?.release === 'released' &&
      current.access === 'clear' &&
      current.sourceConfidence === 'confirmed' &&
      !current.assignmentConflict &&
      Boolean(current.responsibleCrewId) &&
      current.inspection === 'los-passed' &&
      current.property === 'pending-property-walk' &&
      !current.callbackOpen;
    const unchangedSinceStart =
      reviewed &&
      current &&
      reviewed.responsibleCrewId === current.responsibleCrewId &&
      reviewed.release === current.release &&
      reviewed.access === current.access &&
      reviewed.sourceConfidence === current.sourceConfidence &&
      reviewed.assignmentConflict === current.assignmentConflict &&
      reviewed.inspection === current.inspection &&
      reviewed.property === current.property &&
      reviewed.callbackOpen === current.callbackOpen &&
      reviewed.confirmedEventCount === current.confirmedEventCount;

    if (!stillWalkEligible || !unchangedSinceStart) {
      return error(
        'not-walk-candidate',
        'Walk review is stale because callback, rework, access, assignment, release, source, inspection, or acceptance state changed. Review the walk again.',
      );
    }
    currentByKey.set(key, current);
  }

  const outcomes = activeWalk.selectedTargets.map(
    (target) => outcomeByKey.get(trackCWorkKey(target)) as TrackCWalkOutcomeRecord,
  );
  const packageOutcomes = new Map<string, TrackCWalkOutcomeRecord[]>();
  for (const outcome of outcomes) {
    const key = walkPackageKey(outcome.target);
    packageOutcomes.set(key, [...(packageOutcomes.get(key) ?? []), outcome]);
  }
  for (const packageRecords of packageOutcomes.values()) {
    const packageStates = new Set(
      packageRecords.map((outcome) => outcome.outcome),
    );
    const correctionPackage = packageStates.has('correction-requested');
    const coherentCorrection =
      correctionPackage &&
      [...packageStates].every(
        (outcome) =>
          outcome === 'accepted' || outcome === 'correction-requested',
      );
    if (
      (!correctionPackage && packageStates.size !== 1) ||
      (correctionPackage && !coherentCorrection)
    ) {
      return error(
        'incomplete-walk',
        'Record one coherent outcome for the complete Unit+Trade package. Corrections may identify affected sections.',
      );
    }
  }
  const events = outcomes.map((outcome, index) => {
    const projection = currentByKey.get(trackCWorkKey(outcome.target));
    const crewId = projection?.responsibleCrewId;
    const packageHasCorrection = packageOutcomes
      .get(walkPackageKey(outcome.target))
      ?.some((record) => record.outcome === 'correction-requested');
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
        if (packageHasCorrection) {
          return confirmedEvent({
            ...common,
            eventType: 'walk-deferred',
            summary:
              outcome.note ??
              'This section remains Los-passed while the Unit+Trade package returns for correction.',
          });
        }
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

export interface TrackCDirectAcceptanceInput {
  readonly unitId: string;
  readonly trade: TrackCTrade;
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly idFactory: (prefix: string) => string;
  readonly contactName?: string;
}

// "PDS approved" from inside the unit: Los walked this trade with the
// property (Tony/Joseph/Paige) outside a formal walk session. Accepts every
// Los-passed section of the trade using the SAME property-accepted event the
// walk flow writes — no new event type, paper and payroll untouched.
export const recordTrackCDirectPropertyAcceptance = (
  state: TrackCState,
  input: TrackCDirectAcceptanceInput,
): TrackCResult<TrackCState> => {
  const eligible = projectTrackCUnitWork(state, input.unitId).filter((work) =>
    work.trade === input.trade
    && work.release === 'released'
    && work.inspection === 'los-passed'
    && work.property !== 'property-accepted');
  if (eligible.length === 0) {
    return error(
      'invalid-transition',
      'Nothing is ready: sections need your pass first, or they are already accepted.',
    );
  }
  const summary = input.contactName?.trim()
    ? `PDS approved — walked with ${input.contactName.trim()}. Paper and payroll remain unchanged.`
    : 'PDS approved — walked with the property. Paper and payroll remain unchanged.';
  return {
    ok: true,
    value: appendEvents(state, eligible.map((work) => confirmedEvent({
      id: input.idFactory('event'),
      eventType: 'property-accepted',
      target: { section: work.section, trade: work.trade, unitId: work.unitId },
      recordedAt: input.recordedAt,
      recordedBy: input.recordedBy,
      sourceType: 'property-walk-observation',
      sourceLabel: 'Unit page · PDS approved',
      summary,
    }))),
  };
};
