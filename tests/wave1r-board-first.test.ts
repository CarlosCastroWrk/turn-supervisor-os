import assert from 'node:assert/strict';
import test from 'node:test';
import type { Jul28SectionTradeRecord } from '../src/features/jul28-turnboard/model.ts';
import { recordsForTrade } from '../src/features/jul28-turnboard/projections.ts';
import { jul28SyntheticTurnBoardRepository } from '../src/features/jul28-turnboard/syntheticRepository.ts';
import { WAVE1R_SYNTHETIC_ACTIVITY } from '../src/features/wave1r-board-first/fixtures.ts';
import {
  createBoardFirstActionActivityItem,
  createBoardFirstActionProposal,
  createBoardFirstAssignmentActivityItem,
  createBoardFirstAssignmentProposal,
  eligibleAssignmentSections,
  initialBoardFirstAssistantState,
  listBoardFirstCrewOptions,
  projectBoardFirstActivity,
  projectBoardFirstBoard,
  projectBoardFirstCaptureReceiptActivity,
  projectBoardFirstUnitActivity,
  reduceBoardFirstAssistant,
  selectBoardFirstSectionActions,
} from '../src/features/wave1r-board-first/projections.ts';
import {
  BOARD_FIRST_HOST_DESTINATIONS,
  BOARD_FIRST_NAVIGATION,
  DEFAULT_BOARD_FIRST_VIEW,
} from '../src/features/wave1r-board-first/types.ts';

const getUnit = (unitNumber: string) => {
  const unit = jul28SyntheticTurnBoardRepository.listUnits()
    .find((candidate) => candidate.unitNumber === unitNumber);
  assert.ok(unit, `Expected synthetic Unit ${unitNumber}`);
  return unit;
};

const getRecord = (
  unitNumber: string,
  trade: 'paint' | 'clean',
  section: 'common' | 'A' | 'B' | 'C' | 'D' | 'E',
) => {
  const record = recordsForTrade(getUnit(unitNumber), trade)
    .find((candidate) => candidate.section === section);
  assert.ok(record, `Expected ${trade} ${section} for Unit ${unitNumber}`);
  return record;
};

test('TurnBoard is the default and primary navigation is exactly TurnBoard, Activity, More', () => {
  assert.equal(DEFAULT_BOARD_FIRST_VIEW, 'turnboard');
  assert.deepEqual(BOARD_FIRST_NAVIGATION, [
    { id: 'turnboard', label: 'TurnBoard' },
    { id: 'activity', label: 'Activity' },
    { id: 'more', label: 'More' },
  ]);
  assert.deepEqual(BOARD_FIRST_HOST_DESTINATIONS, [
    { id: 'crews', label: 'Crews' },
    { id: 'reports', label: 'Reports' },
    { id: 'setup', label: 'Setup' },
    { id: 'backup', label: 'Backup' },
    { id: 'sync', label: 'Sync' },
  ]);
  assert.equal(
    BOARD_FIRST_NAVIGATION.some(({ label }) =>
      ['Training', 'Daily', 'Issues', 'Assignments'].includes(label)),
    false,
  );
});

test('dense board rows preserve identity, both trades, crew visibility, sections, and one immediate attention', () => {
  const rows = projectBoardFirstBoard(jul28SyntheticTurnBoardRepository);
  const row602 = rows.find((row) => row.unitNumber === '602');
  assert.ok(row602);

  assert.equal(rows.length, 4);
  assert.equal(row602.unitTypeLabel, '4-bedroom');
  assert.match(row602.locationLabel, /Level 06/);
  assert.deepEqual(row602.applicableSections, ['common', 'A', 'B', 'C', 'D']);
  assert.equal(row602.paint.trade, 'paint');
  assert.equal(row602.clean.trade, 'clean');
  assert.deepEqual(row602.paint.crewNames, ['Bluebird Paint']);
  assert.deepEqual(row602.clean.crewNames, ['Cedar Clean']);
  assert.equal(row602.paint.sections.length, 6);
  assert.equal(row602.clean.sections.length, 6);
  assert.ok(row602.highestAttention);
  assert.match(row602.highestAttention.label, /Occupied \/ restricted/);
  assert.equal(typeof row602.highestAttention.nextAction, 'string');
  assert.equal(Array.isArray(row602.highestAttention), false);
  assert.equal(row602.needsMe, true);
});

test('state-aware section actions expose only valid next actions', () => {
  const readyForInspection = getRecord('603', 'paint', 'common');
  const readyActions = selectBoardFirstSectionActions(readyForInspection);
  assert.deepEqual(readyActions.map((action) => action.label), [
    'Pass My Inspection',
    'Create Callback',
    'Inspection Blocked',
    'Add Note or Photo',
  ]);

  const releasedUnassigned: Jul28SectionTradeRecord = {
    ...getRecord('602', 'clean', 'D'),
    authorization: 'released',
  };
  const assignmentActions = selectBoardFirstSectionActions(releasedUnassigned);
  assert.deepEqual(assignmentActions.map((action) => action.label), [
    'Assign Crew (proposal)',
    'Add Blocker',
    'Add Note or Photo',
  ]);
  assert.equal(assignmentActions[0]?.opensAssignment, true);

  const conflictActions = selectBoardFirstSectionActions(getRecord('604', 'paint', 'C'));
  assert.deepEqual(conflictActions.map((action) => action.label), [
    'Review Assignment Conflict',
    'Add Note or Photo',
  ]);
  assert.equal(conflictActions.some((action) => action.id === 'pass-inspection'), false);

  const accessAndReleaseBlocked: Jul28SectionTradeRecord = {
    ...getRecord('602', 'paint', 'B'),
    authorization: 'not-released',
    access: 'occupied-or-restricted',
  };
  assert.deepEqual(
    selectBoardFirstSectionActions(accessAndReleaseBlocked).map((action) => action.label),
    [
      'Request Access Clarification',
      'Clarify Release',
      'Add Blocker',
      'Add Note or Photo',
    ],
  );

  const passedAwaitingPaper: Jul28SectionTradeRecord = {
    ...getRecord('602', 'clean', 'D'),
    authorization: 'released',
    inspection: 'los-passed',
    paperReview: 'needs-paper-review',
    assignmentEpisodes: [],
  };
  assert.deepEqual(
    selectBoardFirstSectionActions(passedAwaitingPaper).map((action) => action.label),
    ['Review Against Paper', 'Add Note or Photo'],
  );
  assert.deepEqual(
    selectBoardFirstSectionActions({
      ...passedAwaitingPaper,
      paperReview: 'paper-reviewed',
    }).map((action) => action.label),
    ['Add Note or Photo'],
  );
});

test('assignment choices are trade-compatible and omit passed or unresolved sections', () => {
  assert.deepEqual(
    listBoardFirstCrewOptions(jul28SyntheticTurnBoardRepository, 'paint'),
    ['Atlas Paint', 'Bluebird Paint', 'Northline Paint'],
  );
  assert.deepEqual(
    listBoardFirstCrewOptions(jul28SyntheticTurnBoardRepository, 'clean'),
    ['Cedar Clean', 'Harbor Clean'],
  );
  assert.deepEqual(eligibleAssignmentSections(getUnit('604'), 'paint'), ['D']);
});

test('global Activity and Unit history share Unit-linked notes, transcripts, and events', () => {
  const activity = projectBoardFirstActivity(
    jul28SyntheticTurnBoardRepository,
    WAVE1R_SYNTHETIC_ACTIVITY,
  );
  const unit602Activity = projectBoardFirstUnitActivity(activity, getUnit('602').id);
  const unit604Activity = projectBoardFirstUnitActivity(activity, getUnit('604').id);

  assert.ok(activity.some((item) => item.kind === 'note'));
  assert.ok(activity.some((item) => item.kind === 'transcript'));
  assert.ok(activity.some((item) => item.kind === 'assignment'));
  assert.ok(unit602Activity.some((item) => item.id === 'wave1r-synthetic-note-602'));
  assert.ok(unit604Activity.some((item) => item.id === 'wave1r-synthetic-transcript-604'));
  assert.ok(unit602Activity.every((item) => item.unitId === getUnit('602').id));
});

test('synthetic assignment proposal detects responsibility and cannot claim persistence or official change', () => {
  const unit = getUnit('602');
  const before = JSON.stringify(unit);
  const proposal = createBoardFirstAssignmentProposal(
    unit,
    'paint',
    'Atlas Paint',
    ['common', 'A'],
  );

  assert.deepEqual(proposal.sections, ['common', 'A']);
  assert.deepEqual(proposal.conflicts, [
    { section: 'common', existingCrewNames: ['Bluebird Paint'] },
    { section: 'A', existingCrewNames: ['Bluebird Paint'] },
  ]);
  assert.equal(proposal.persisted, false);
  assert.equal(proposal.officialAssignmentCreated, false);
  assert.equal(proposal.paperStateChanged, false);
  assert.match(proposal.disclaimer, /Synthetic assignment proposal only/i);
  assert.match(proposal.disclaimer, /No official or persisted assignment/i);
  assert.equal(JSON.stringify(unit), before);
});

test('confirmed synthetic proposals create local nonpersisted receipts mirrored into Unit history', () => {
  const unit = getUnit('602');
  const sectionAction = selectBoardFirstSectionActions(getRecord('602', 'paint', 'common'))[0];
  assert.ok(sectionAction);
  const actionProposal = createBoardFirstActionProposal(
    unit.id,
    'paint',
    'common',
    sectionAction,
  );
  const assignmentProposal = createBoardFirstAssignmentProposal(
    unit,
    'paint',
    'Atlas Paint',
    ['common'],
  );
  const actionReceipt = createBoardFirstActionActivityItem(
    actionProposal,
    unit.unitNumber,
    'action-test-1',
    '2026-07-26T15:00:00.000Z',
  );
  const assignmentReceipt = createBoardFirstAssignmentActivityItem(
    assignmentProposal,
    unit.unitNumber,
    'assignment-test-1',
    '2026-07-26T15:01:00.000Z',
  );
  const activity = projectBoardFirstActivity(
    jul28SyntheticTurnBoardRepository,
    [actionReceipt, assignmentReceipt],
  );
  const unitHistory = projectBoardFirstUnitActivity(activity, unit.id);

  assert.equal(actionReceipt.nonpersisted, true);
  assert.equal(assignmentReceipt.nonpersisted, true);
  assert.match(actionReceipt.sourceLabel, /nonpersisted/i);
  assert.match(assignmentReceipt.sourceLabel, /nonpersisted/i);
  assert.ok(activity.some((item) => item.id === actionReceipt.id));
  assert.ok(activity.some((item) => item.id === assignmentReceipt.id));
  assert.ok(unitHistory.some((item) => item.id === actionReceipt.id));
  assert.ok(unitHistory.some((item) => item.id === assignmentReceipt.id));
});

test('Capture activity exists only for an accepted receipt and preserves returned Unit context', () => {
  const request = {
    kind: 'note' as const,
    origin: 'section-sheet' as const,
    requestId: 'capture-test-1',
    returnFocus: {
      triggerId: 'w1r-section-jul28-unit-604-paint-D',
      unitId: 'jul28-unit-604',
    },
    section: 'D' as const,
    trade: 'paint' as const,
    unitId: 'jul28-unit-604',
    unitNumber: '604',
  };
  assert.equal(
    projectBoardFirstCaptureReceiptActivity(
      request,
      { accepted: false, message: 'Rejected' },
      '2026-07-26T15:02:00.000Z',
    ),
    null,
  );

  const accepted = projectBoardFirstCaptureReceiptActivity(
    request,
    { accepted: true, receiptId: 'capture-receipt-1' },
    '2026-07-26T15:02:00.000Z',
  );
  assert.ok(accepted);
  assert.equal(accepted.kind, 'capture-receipt');
  assert.equal(accepted.unitId, request.unitId);
  assert.equal(accepted.nonpersisted, true);
  assert.match(accepted.wording, /does not claim.*permanently saved/i);

  const returnedItem = projectBoardFirstCaptureReceiptActivity(
    request,
    {
      accepted: true,
      receiptId: 'capture-receipt-2',
      activityItem: {
        id: 'host-note-1',
        kind: 'note',
        recordedAt: '2026-07-26T15:03:00.000Z',
        sourceLabel: 'Host Capture receipt',
        synthetic: true,
        title: 'Returned note',
        wording: 'Returned by the host.',
      },
    },
    '2026-07-26T15:03:00.000Z',
  );
  assert.ok(returnedItem);
  assert.equal(returnedItem.receiptId, 'capture-receipt-2');
  assert.equal(returnedItem.unitId, request.unitId);
  assert.equal(returnedItem.unitNumber, request.unitNumber);
  assert.equal(returnedItem.trade, request.trade);
  assert.equal(returnedItem.section, request.section);
});

test('assistant collapse and re-expand preserves the exact typed draft', () => {
  const expanded = reduceBoardFirstAssistant(initialBoardFirstAssistantState, { type: 'expand' });
  const typed = reduceBoardFirstAssistant(expanded, {
    type: 'draft-changed',
    draft: 'Unit 602 Paint Common needs a note',
  });
  const collapsed = reduceBoardFirstAssistant(typed, { type: 'collapse' });
  const reopened = reduceBoardFirstAssistant(collapsed, { type: 'expand' });

  assert.equal(collapsed.expanded, false);
  assert.equal(reopened.expanded, true);
  assert.equal(reopened.draft, 'Unit 602 Paint Common needs a note');
});
