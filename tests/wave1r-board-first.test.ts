import assert from 'node:assert/strict';
import test from 'node:test';
import type { Jul28SectionTradeRecord } from '../src/features/jul28-turnboard/model.ts';
import { recordsForTrade } from '../src/features/jul28-turnboard/projections.ts';
import { jul28SyntheticTurnBoardRepository } from '../src/features/jul28-turnboard/syntheticRepository.ts';
import { WAVE1R_SYNTHETIC_ACTIVITY } from '../src/features/wave1r-board-first/fixtures.ts';
import {
  createBoardFirstAssignmentProposal,
  initialBoardFirstAssistantState,
  projectBoardFirstActivity,
  projectBoardFirstBoard,
  projectBoardFirstUnitActivity,
  reduceBoardFirstAssistant,
  selectBoardFirstSectionActions,
} from '../src/features/wave1r-board-first/projections.ts';
import {
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
