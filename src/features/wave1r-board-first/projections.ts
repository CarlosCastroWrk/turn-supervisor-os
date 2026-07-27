import type {
  Jul28BlockerKind,
  Jul28Section,
  Jul28SectionTradeRecord,
  Jul28Trade,
  Jul28TurnBoardRepository,
  Jul28UnitRecord,
} from '../jul28-turnboard/model';
import {
  projectJul28Blocker,
  projectJul28TradeSummary,
  recordsForTrade,
  validateJul28SourceCoverage,
} from '../jul28-turnboard/projections';
import type {
  BoardFirstActionProposal,
  BoardFirstActivityItem,
  BoardFirstAssignmentProposal,
  BoardFirstAssistantAction,
  BoardFirstAssistantState,
  BoardFirstAttentionProjection,
  BoardFirstBoardFilter,
  BoardFirstCaptureReceipt,
  BoardFirstCaptureRequest,
  BoardFirstSectionAction,
  BoardFirstSectionProjection,
  BoardFirstTone,
  BoardFirstTradeProjection,
  BoardFirstUnitProjection,
} from './types';

const SECTION_ORDER: Jul28Section[] = ['common', 'A', 'B', 'C', 'D', 'E'];
const TRADE_ORDER: Jul28Trade[] = ['paint', 'clean'];
const PASSED_INSPECTIONS = new Set<Jul28SectionTradeRecord['inspection']>([
  'los-passed',
  'passed-after-callback',
]);

const sectionLabel = (section: Jul28Section) => section === 'common' ? 'Common' : section;
const tradeLabel = (trade: Jul28Trade) => trade === 'paint' ? 'Paint' : 'Clean';

const activeAssignments = (record: Jul28SectionTradeRecord) =>
  record.assignmentEpisodes.filter((episode) => episode.active && episode.kind !== 'cancellation');

const sectionTone = (record: Jul28SectionTradeRecord): BoardFirstTone => {
  if (record.applicability === 'not-applicable') return 'neutral';
  if (
    record.authorization === 'assignment-conflict'
    || record.authorization === 'uncertain'
    || record.access !== 'accessible'
    || record.inspection === 'callback-required'
    || record.inspection === 'reinspection-pending'
    || activeAssignments(record).length > 1
  ) {
    return 'attention';
  }
  if (PASSED_INSPECTIONS.has(record.inspection)) return 'positive';
  if (record.crewExecution === 'crew-reported-complete') return 'caution';
  return 'neutral';
};

const sectionStateLabel = (record: Jul28SectionTradeRecord) => {
  if (record.applicability === 'not-applicable') return `${sectionLabel(record.section)} not applicable`;
  if (record.authorization === 'assignment-conflict' || activeAssignments(record).length > 1) {
    return `${sectionLabel(record.section)} assignment conflict`;
  }
  if (record.access === 'occupied-or-restricted') return `${sectionLabel(record.section)} occupied or restricted`;
  if (record.access === 'access-blocked') return `${sectionLabel(record.section)} access blocked`;
  if (record.access === 'maintenance-blocked') return `${sectionLabel(record.section)} maintenance blocked`;
  if (record.inspection === 'callback-required') return `${sectionLabel(record.section)} callback required`;
  if (record.inspection === 'reinspection-pending') return `${sectionLabel(record.section)} reinspection pending`;
  if (PASSED_INSPECTIONS.has(record.inspection)) return `${sectionLabel(record.section)} my inspection recorded`;
  if (record.crewExecution === 'crew-reported-complete') return `${sectionLabel(record.section)} ready for my inspection`;
  if (record.crewExecution === 'working') return `${sectionLabel(record.section)} crew working`;
  if (record.crewExecution === 'assigned') return `${sectionLabel(record.section)} assigned`;
  if (record.authorization === 'released') return `${sectionLabel(record.section)} released and unassigned`;
  return `${sectionLabel(record.section)} not released`;
};

const projectSections = (records: Jul28SectionTradeRecord[]): BoardFirstSectionProjection[] =>
  records.map((record) => ({
    section: record.section,
    applicable: record.applicability === 'applicable',
    label: sectionStateLabel(record),
    tone: sectionTone(record),
  }));

const projectCrewNames = (records: Jul28SectionTradeRecord[]) => [
  ...new Set(records.flatMap((record) => activeAssignments(record).map((episode) => episode.crewName))),
];

const projectTrade = (unit: Jul28UnitRecord, trade: Jul28Trade): BoardFirstTradeProjection => {
  const records = recordsForTrade(unit, trade);
  const crewNames = projectCrewNames(records);
  const summary = projectJul28TradeSummary(unit, trade);
  const summaryLabel = !summary.sourceCoverageComplete
    ? 'Source incomplete'
    : (summary.readyForMyWalkCount ?? 0) > 0
      ? `${summary.readyForMyWalkCount}/${summary.applicableSectionCount} ready for me`
      : `${summary.losPassedSectionCount}/${summary.applicableSectionCount} inspected`;

  return {
    trade,
    crewLabel: crewNames.length === 0
      ? 'Not assigned'
      : crewNames.length === 1
        ? crewNames[0]
        : `${crewNames.length} crew claims`,
    crewNames,
    summaryLabel,
    sections: projectSections(records),
  };
};

const blockerRank = (
  record: Jul28SectionTradeRecord,
  blockerKind: Jul28BlockerKind | undefined,
) => {
  if (record.authorization === 'assignment-conflict' || record.authorization === 'uncertain') return 100;
  if (activeAssignments(record).length > 1) return 98;
  if (record.access === 'occupied-or-restricted') return 94;
  if (record.access === 'access-blocked') return 92;
  if (record.access === 'maintenance-blocked') return 90;
  if (record.inspection === 'callback-required') return 86;
  if (record.inspection === 'reinspection-pending') return 82;
  if (
    record.crewExecution === 'crew-reported-complete'
    && record.access === 'accessible'
    && record.inspection === 'inspection-pending'
  ) {
    return 76;
  }
  if (record.authorization === 'not-released') return 58;
  if (record.authorization === 'released' && activeAssignments(record).length === 0) return 54;
  if (blockerKind === 'crew-report') return 30;
  if (blockerKind === 'paper-review') return 18;
  return 10;
};

const attentionForRecord = (
  record: Jul28SectionTradeRecord,
  unit: Jul28UnitRecord,
): BoardFirstAttentionProjection | null => {
  if (record.applicability === 'not-applicable') return null;
  const coverage = validateJul28SourceCoverage(unit);
  const assignmentConflict = record.authorization === 'assignment-conflict'
    || record.authorization === 'uncertain'
    || activeAssignments(record).length > 1;
  const accessBlocker = coverage.complete && !assignmentConflict && record.access !== 'accessible'
    ? {
        kind: record.access === 'occupied-or-restricted'
          ? 'occupied-or-restricted' as const
          : record.access === 'access-blocked'
            ? 'access-blocked' as const
            : 'maintenance-blocked' as const,
        label: record.access === 'occupied-or-restricted'
          ? 'Occupied / restricted'
          : record.access === 'access-blocked'
            ? 'Access blocked'
            : 'Maintenance blocked',
        nextAction: record.access === 'occupied-or-restricted'
          ? 'Confirm whether entry is allowed and record the permitted work window.'
          : record.access === 'access-blocked'
            ? 'Restore or clarify key, fob, door, or escort access.'
            : 'Coordinate completion of the maintenance dependency.',
        tone: 'attention' as const,
      }
    : null;
  const blocker = accessBlocker ?? projectJul28Blocker(record, coverage);

  if (
    !blocker
    && record.crewExecution === 'crew-reported-complete'
    && record.access === 'accessible'
    && record.inspection === 'inspection-pending'
  ) {
    return {
      label: `${tradeLabel(record.trade)} ${sectionLabel(record.section)} ready for my inspection`,
      nextAction: `Inspect ${tradeLabel(record.trade)} ${sectionLabel(record.section)}.`,
      rank: blockerRank(record, undefined),
      section: record.section,
      trade: record.trade,
      tone: 'pending',
    };
  }

  if (!blocker) return null;
  return {
    blockerKind: blocker.kind,
    label: `${tradeLabel(record.trade)} ${sectionLabel(record.section)} · ${blocker.label}`,
    nextAction: blocker.nextAction,
    rank: coverage.complete ? blockerRank(record, blocker.kind) : 120,
    section: record.section,
    trade: record.trade,
    tone: blocker.tone,
  };
};

export const projectBoardFirstUnitAttentions = (
  unit: Jul28UnitRecord,
): BoardFirstAttentionProjection[] => unit.records
    .map((record) => attentionForRecord(record, unit))
    .filter((attention): attention is BoardFirstAttentionProjection => Boolean(attention))
    .sort((left, right) => {
      if (right.rank !== left.rank) return right.rank - left.rank;
      const tradeDifference = TRADE_ORDER.indexOf(left.trade) - TRADE_ORDER.indexOf(right.trade);
      if (tradeDifference !== 0) return tradeDifference;
      return SECTION_ORDER.indexOf(left.section) - SECTION_ORDER.indexOf(right.section);
    });

export const projectBoardFirstUnit = (unit: Jul28UnitRecord): BoardFirstUnitProjection => {
  const attentions = projectBoardFirstUnitAttentions(unit);
  const applicableSections = SECTION_ORDER.filter((section) =>
    unit.records.some((record) => record.section === section && record.applicability === 'applicable'),
  );
  const highestAttention = attentions[0] ?? null;
  const assignmentConflict = unit.records.some((record) =>
    record.authorization === 'assignment-conflict'
    || activeAssignments(record).length > 1);

  return {
    unitId: unit.id,
    unitNumber: unit.unitNumber,
    unitTypeLabel: unit.unitTypeLabel,
    locationLabel: `${unit.floorLabel} · ${unit.buildingLabel}`,
    applicableSections,
    assignmentConflict,
    paint: projectTrade(unit, 'paint'),
    clean: projectTrade(unit, 'clean'),
    highestAttention,
    needsMe: Boolean(highestAttention && highestAttention.rank >= 76),
  };
};

export const projectBoardFirstBoard = (
  repository: Jul28TurnBoardRepository,
): BoardFirstUnitProjection[] => repository.listUnits().map(projectBoardFirstUnit);

const normalizeBoardSearch = (value: string) => value.trim().toLocaleLowerCase();

export const filterBoardFirstBoard = (
  projections: readonly BoardFirstUnitProjection[],
  query: string,
  filter: BoardFirstBoardFilter,
): BoardFirstUnitProjection[] => {
  const normalizedQuery = normalizeBoardSearch(query);
  return projections.filter((projection) => {
    if (filter === 'needs-me' && !projection.needsMe) return false;
    if (filter === 'assignment-conflict' && !projection.assignmentConflict) return false;
    if (!normalizedQuery) return true;

    const searchable = [
      projection.unitNumber,
      `Unit ${projection.unitNumber}`,
      projection.locationLabel,
      projection.paint.crewLabel,
      ...projection.paint.crewNames,
      projection.clean.crewLabel,
      ...projection.clean.crewNames,
    ].join(' ').toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  });
};

const action = (
  id: BoardFirstSectionAction['id'],
  label: string,
  description: string,
  extras: Pick<BoardFirstSectionAction, 'captureKind' | 'opensAssignment'> = {},
): BoardFirstSectionAction => ({ id, label, description, ...extras });

const noteAction = action(
  'add-note-photo',
  'Add Note or Photo',
  'Request the existing Capture owner with this section context. No handoff or save is assumed.',
  { captureKind: 'note' },
);

const blockerAction = action(
  'add-blocker',
  'Add Blocker',
  'Request a blocker draft from the existing Capture owner. No handoff or state change is assumed.',
  { captureKind: 'blocker' },
);

export const selectBoardFirstSectionActions = (
  record: Jul28SectionTradeRecord,
  sourceCoverageComplete = true,
): BoardFirstSectionAction[] => {
  if (!sourceCoverageComplete) {
    return [
      action('review-source', 'Review Source Coverage', 'Compare this read-only projection with the locked source adapter before acting.'),
      noteAction,
    ];
  }
  if (record.applicability === 'not-applicable') return [noteAction];

  const assignments = activeAssignments(record);
  if (record.authorization === 'assignment-conflict' || record.authorization === 'uncertain' || assignments.length > 1) {
    return [
      action(
        'review-assignment-conflict',
        'Review Assignment Conflict',
        'Clarify the accountable source without choosing a crew claim automatically.',
      ),
      noteAction,
    ];
  }
  if (record.access !== 'accessible') {
    return [
      action('request-access', 'Request Access Clarification', 'Record a personal follow-up without claiming access was restored.'),
      ...(record.authorization === 'not-released'
        ? [action('clarify-release', 'Clarify Release', 'Record a follow-up request; this prototype cannot release scope.')]
        : []),
      blockerAction,
      noteAction,
    ];
  }
  if (record.authorization === 'not-released') {
    return [
      action('clarify-release', 'Clarify Release', 'Record a follow-up request; this prototype cannot release scope.'),
      noteAction,
    ];
  }
  if (record.inspection === 'callback-required') {
    return [
      action('review-callback', 'Review Callback', 'Open the recorded callback context without closing it.'),
      noteAction,
    ];
  }
  if (record.inspection === 'reinspection-pending') {
    return [
      action('pass-reinspection', 'Pass My Reinspection', 'Create a read-only prototype proposal for Los review.'),
      action('create-callback', 'Create Callback', 'Create a callback proposal; the original record remains unchanged.'),
      action(
        'inspection-blocked',
        'Inspection Blocked',
        'Request a blocker draft from the existing Capture owner. No handoff or save is assumed.',
        { captureKind: 'blocker' },
      ),
      noteAction,
    ];
  }
  if (PASSED_INSPECTIONS.has(record.inspection)) {
    return record.paperReview === 'needs-paper-review'
      ? [
          action('review-paper', 'Review Against Paper', 'Open a personal reminder. Paper remains authoritative.'),
          noteAction,
        ]
      : [noteAction];
  }
  if (assignments.length === 0) {
    return [
      action(
        'propose-assignment',
        'Assign Crew (proposal)',
        'Select a synthetic crew and sections. No official or persisted assignment will be created.',
        { opensAssignment: true },
      ),
      blockerAction,
      noteAction,
    ];
  }
  if (record.crewExecution === 'crew-reported-complete' && record.inspection === 'inspection-pending') {
    return [
      action('pass-inspection', 'Pass My Inspection', 'Create a read-only prototype proposal for Los review.'),
      action('create-callback', 'Create Callback', 'Create a callback proposal; the source record remains unchanged.'),
      action(
        'inspection-blocked',
        'Inspection Blocked',
        'Request a blocker draft from the existing Capture owner. No handoff or save is assumed.',
        { captureKind: 'blocker' },
      ),
      noteAction,
    ];
  }
  return [blockerAction, noteAction];
};

export const createBoardFirstActionProposal = (
  unitId: string,
  trade: Jul28Trade,
  section: Jul28Section,
  selectedAction: BoardFirstSectionAction,
): BoardFirstActionProposal => ({
  action: selectedAction,
  disclaimer: `${selectedAction.label} is a read-only prototype proposal. No official, persisted, or paper state changed.`,
  officialStateChanged: false,
  paperStateChanged: false,
  section,
  trade,
  unitId,
});

export const listBoardFirstCrewOptions = (
  repository: Jul28TurnBoardRepository,
  trade: Jul28Trade,
): string[] => [
  ...new Set(repository.listUnits().flatMap((unit) =>
    recordsForTrade(unit, trade)
      .flatMap((record) => activeAssignments(record).map((episode) => episode.crewName)),
  )),
].sort();

export const eligibleAssignmentSections = (
  unit: Jul28UnitRecord,
  trade: Jul28Trade,
): Jul28Section[] => recordsForTrade(unit, trade)
  .filter((record) => (
    record.applicability === 'applicable'
    && record.authorization === 'released'
    // In this model, passed inspections are the records that may still await
    // paper reconciliation. Neither passed nor awaiting-paper work is assignable.
    && !PASSED_INSPECTIONS.has(record.inspection)
  ))
  .map((record) => record.section);

export const createBoardFirstAssignmentProposal = (
  unit: Jul28UnitRecord,
  trade: Jul28Trade,
  crewName: string,
  requestedSections: readonly Jul28Section[],
): BoardFirstAssignmentProposal => {
  const eligible = new Set(eligibleAssignmentSections(unit, trade));
  const sections = SECTION_ORDER.filter((section) => eligible.has(section) && requestedSections.includes(section));
  const conflicts = recordsForTrade(unit, trade)
    .filter((record) => sections.includes(record.section))
    .flatMap((record) => {
      const existingCrewNames = [
        ...new Set(activeAssignments(record).map((episode) => episode.crewName).filter((name) => name !== crewName)),
      ];
      return existingCrewNames.length > 0 ? [{ section: record.section, existingCrewNames }] : [];
    });

  return {
    unitId: unit.id,
    trade,
    crewName,
    sections,
    conflicts,
    persisted: false,
    officialAssignmentCreated: false,
    paperStateChanged: false,
    disclaimer: 'Synthetic assignment proposal only. No official or persisted assignment was created; paper remains unchanged.',
  };
};

export const projectBoardFirstActivity = (
  repository: Jul28TurnBoardRepository,
  supplementalItems: readonly BoardFirstActivityItem[] = [],
): BoardFirstActivityItem[] => {
  const byId = new Map<string, BoardFirstActivityItem>();
  for (const unit of repository.listUnits()) {
    for (const record of unit.records) {
      for (const event of record.history) {
        if (byId.has(event.id)) continue;
        byId.set(event.id, {
          id: event.id,
          kind: event.kind,
          recordedAt: event.recordedAt,
          sourceLabel: event.sourceLabel,
          synthetic: true,
          title: event.title,
          wording: event.wording,
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          trade: record.trade,
          section: record.section,
        });
      }
    }
  }
  for (const item of supplementalItems) {
    byId.set(item.id, { ...item });
  }
  return [...byId.values()].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
};

export const projectBoardFirstUnitActivity = (
  activity: readonly BoardFirstActivityItem[],
  unitId: string,
) => activity.filter((item) => item.unitId === unitId);

export const createBoardFirstActionActivityItem = (
  proposal: BoardFirstActionProposal,
  unitNumber: string,
  receiptId: string,
  recordedAt: string,
): BoardFirstActivityItem => ({
  id: `wave1r-action-receipt:${receiptId}`,
  kind: 'action-proposal',
  nonpersisted: true,
  receiptId,
  recordedAt,
  section: proposal.section,
  sourceLabel: 'Local synthetic receipt · nonpersisted',
  synthetic: true,
  title: `${proposal.action.label} proposed`,
  trade: proposal.trade,
  unitId: proposal.unitId,
  unitNumber,
  wording: proposal.disclaimer,
});

export const createBoardFirstAssignmentActivityItem = (
  proposal: BoardFirstAssignmentProposal,
  unitNumber: string,
  receiptId: string,
  recordedAt: string,
): BoardFirstActivityItem => ({
  id: `wave1r-assignment-receipt:${receiptId}`,
  kind: 'assignment-proposal',
  nonpersisted: true,
  receiptId,
  recordedAt,
  sourceLabel: 'Local synthetic receipt · nonpersisted',
  synthetic: true,
  title: 'Assignment proposal confirmed',
  trade: proposal.trade,
  unitId: proposal.unitId,
  unitNumber,
  wording: `${proposal.crewName} was proposed for ${tradeLabel(proposal.trade)} ${proposal.sections.map(sectionLabel).join(', ')}. ${proposal.disclaimer}`,
});

export const projectBoardFirstCaptureReceiptActivity = (
  request: BoardFirstCaptureRequest,
  receipt: BoardFirstCaptureReceipt,
  recordedAt: string,
): BoardFirstActivityItem | null => {
  if (!receipt.accepted) return null;
  if (receipt.activityItem) {
    return {
      ...receipt.activityItem,
      receiptId: receipt.receiptId,
      section: receipt.activityItem.section ?? request.section,
      trade: receipt.activityItem.trade ?? request.trade,
      unitId: receipt.activityItem.unitId ?? request.unitId,
      unitNumber: receipt.activityItem.unitNumber ?? request.unitNumber,
    };
  }
  return {
    id: `wave1r-capture-receipt:${receipt.receiptId}`,
    kind: 'capture-receipt',
    nonpersisted: true,
    receiptId: receipt.receiptId,
    recordedAt,
    section: request.section,
    sourceLabel: 'Accepted Capture handoff receipt · local only',
    synthetic: true,
    title: 'Capture handoff accepted',
    trade: request.trade,
    unitId: request.unitId,
    unitNumber: request.unitNumber,
    wording: 'The host accepted this handoff request. This local receipt does not claim that content was permanently saved.',
  };
};

export const initialBoardFirstAssistantState: BoardFirstAssistantState = {
  draft: '',
  expanded: false,
  message: '',
};

export const reduceBoardFirstAssistant = (
  state: BoardFirstAssistantState,
  actionValue: BoardFirstAssistantAction,
): BoardFirstAssistantState => {
  if (actionValue.type === 'toggle') return { ...state, expanded: !state.expanded };
  if (actionValue.type === 'expand') return { ...state, expanded: true };
  if (actionValue.type === 'collapse') return { ...state, expanded: false };
  if (actionValue.type === 'draft-changed') return { ...state, draft: actionValue.draft };
  return { ...state, message: actionValue.message };
};
