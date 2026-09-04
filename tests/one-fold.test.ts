import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import type { AppData, DaySession } from '../src/types.ts';
import {
  appendManualReleaseBatchOnce,
  applyTrackCStateChange,
  createManualReleaseBatch,
  projectDaySessions,
  projectPropertyRoster,
  projectTodayTask,
  projectTrackCState,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import { selectTodayTaskQueue } from '../src/features/wave2a2-track-b/model.ts';
import {
  applyTrackCSectionAction,
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
} from '../src/features/wave2a2-track-c/operations.ts';
import { projectTrackCWork } from '../src/features/wave2a2-track-c/projections.ts';
import { roomStageOf } from '../src/features/wave2a2-track-c/roomStatus.ts';

// ONE FOLD. Home's five queues used to come from a second event reducer with
// its own rules; the board came from the Track C fold. They drifted in two
// places Los would feel: a re-released room stayed "Ready to walk" on Home
// while the board correctly showed it fresh, and a property acceptance did
// not clear a callback on Home. The day-task now reads the Track C
// projection, so these scenarios pin Home and the board to one answer.

const DATE = '2026-08-07';
const target = { section: 'A' as const, trade: 'paint' as const, unitId: 'unit_101' };
let seq = 0;
const at = () => `2026-08-07T13:00:${String(seq++).padStart(2, '0')}.000Z`;

const releasedDay = (batchId: string, recordedAt = at()) => {
  let data = structuredClone(seedData) as AppData;
  const batch = createManualReleaseBatch({
    actor: 'Los', date: DATE, id: batchId, propertyContact: 'PM', recordedAt,
    roster: projectPropertyRoster(data),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selections: [target] as any,
  });
  data = appendManualReleaseBatchOnce(data, batch);
  const session: DaySession = {
    activeCleanCrewIds: [], activePaintCrewIds: [], createdAt: at(), date: DATE,
    id: 's1', keyStatus: 'yes', morningNote: '', projectId: data.activeProjectId,
    propertyContact: 'PM', releaseBatchIds: [batchId], startedAt: at(), startedBy: 'Los',
    status: 'active', updatedAt: at(),
  };
  return { ...data, daySessions: [...data.daySessions, session] };
};

const workThrough = (data: AppData, actions: readonly ('start-work' | 'record-crew-complete' | 'record-los-pass' | 'open-callback')[]) => {
  let state = projectTrackCState(data);
  const crewId = state.crews.find((crew) => crew.trade === 'paint')!.id;
  const proposal = createTrackCBulkAssignmentProposal(state, {
    createdAt: at(), createdBy: 'Los', crewId, proposalId: 'p1', sectionMode: 'specific',
    sections: ['A'], trade: 'paint', unitIds: ['unit_101'],
  });
  const confirmed = confirmTrackCBulkAssignmentProposal(state, proposal, {
    confirmed: true, eventIdPrefix: 'a', recordedAt: at(), recordedBy: 'Los',
  });
  assert.ok(confirmed.ok);
  state = confirmed.value.state;
  for (const action of actions) {
    const result = applyTrackCSectionAction(state, {
      action, eventId: `${action}-${seq}`, recordedAt: at(), recordedBy: 'Los', target,
    });
    assert.ok(result.ok, `${action} applies`);
    state = result.value;
  }
  return { data: applyTrackCStateChange(data, state), state };
};

const homeQueues = (data: AppData) => {
  const session = projectDaySessions(data, 'test-device').find((candidate) => candidate.daySessionId === 's1');
  assert.ok(session, 'day session projects');
  const task = projectTodayTask(data, session);
  assert.ok(task, 'today task projects');
  const inQueue = (queue: 'needs-crew' | 'working' | 'needs-inspection' | 'waiting' | 'callbacks' | 'ready-to-walk') =>
    selectTodayTaskQueue(task, queue).records.some((record) =>
      record.unitId === target.unitId && record.sectionId === target.section);
  return { inQueue, task };
};

test('a re-released room is fresh on Home too — not still "Ready to walk" from its old life', () => {
  let data = releasedDay('r1', '2026-08-07T13:00:00.000Z');
  ({ data } = workThrough(data, ['start-work', 'record-crew-complete', 'record-los-pass']));
  assert.equal(homeQueues(data).inQueue('ready-to-walk'), true, 'round one: passed and waiting on the walk');

  // Joseph pulls the room and releases it again later (a fresh round): the
  // old batch goes away, a new one is stamped after every round-one event.
  const fresh = createManualReleaseBatch({
    actor: 'Los', date: DATE, id: 'r2', propertyContact: 'PM', recordedAt: '2026-08-07T18:00:00.000Z',
    roster: projectPropertyRoster(data),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selections: [target] as any,
  });
  data = appendManualReleaseBatchOnce({
    ...data,
    dailyReleaseBatches: data.dailyReleaseBatches.filter((batch) => batch.id !== 'r1'),
    daySessions: data.daySessions.map((session) =>
      session.id === 's1' ? { ...session, releaseBatchIds: ['r2'] } : session),
  }, fresh);

  const board = projectTrackCWork(projectTrackCState(data), target);
  assert.ok(board);
  assert.equal(roomStageOf(board), 'needs-crew', 'the board shows the new round fresh');
  const { inQueue } = homeQueues(data);
  assert.equal(inQueue('ready-to-walk'), false, 'Home no longer resurrects the old pass');
  assert.equal(inQueue('needs-crew'), true, 'Home asks for a crew, same as the board');
});

test('the callback lifecycle reads the same on Home and the board', () => {
  let data = releasedDay('r1', '2026-08-07T13:00:00.000Z');
  let state: ReturnType<typeof projectTrackCState>;
  ({ data, state } = workThrough(data, ['start-work', 'record-crew-complete', 'record-los-pass', 'open-callback']));
  let queues = homeQueues(data);
  assert.equal(queues.inQueue('callbacks'), true, 'callback shows on Home');
  assert.equal(queues.inQueue('ready-to-walk'), false, 'and pulls the room out of the walk');
  assert.equal(roomStageOf(projectTrackCWork(projectTrackCState(data), target)!), 'callback');

  // The crew says it is fixed: still a callback until Los re-inspects.
  const fixed = applyTrackCSectionAction(state, {
    action: 'record-correction-ready', eventId: 'fix', recordedAt: at(), recordedBy: 'Los', target,
  });
  assert.ok(fixed.ok);
  state = fixed.value;
  data = applyTrackCStateChange(data, state);
  queues = homeQueues(data);
  assert.equal(queues.inQueue('callbacks'), true, 'reinspection pending is still a callback on Home');
  assert.equal(roomStageOf(projectTrackCWork(projectTrackCState(data), target)!), 'callback');

  // Los passes the reinspection: callback closes everywhere at once.
  const passed = applyTrackCSectionAction(state, {
    action: 'record-reinspection-pass', eventId: 'repass', recordedAt: at(), recordedBy: 'Los', target,
  });
  assert.ok(passed.ok);
  data = applyTrackCStateChange(data, passed.value);
  queues = homeQueues(data);
  assert.equal(queues.inQueue('callbacks'), false, 'Home closes the callback');
  assert.equal(queues.inQueue('ready-to-walk'), true, 'and the room is back in the walk');
  assert.equal(roomStageOf(projectTrackCWork(projectTrackCState(data), target)!), 'passed');
});

test('Home and the board agree on every released room of a normal day', () => {
  let data = releasedDay('r1', '2026-08-07T13:00:00.000Z');
  ({ data } = workThrough(data, ['start-work', 'record-crew-complete']));
  const { task } = homeQueues(data);
  const state = projectTrackCState(data);
  for (const section of task.sections) {
    for (const tradeState of section.tradeStates) {
      const work = projectTrackCWork(state, {
        section: section.sectionId as typeof target.section,
        trade: tradeState.trade === 'Paint' ? 'paint' : 'clean',
        unitId: section.unitId,
      });
      assert.ok(work, `${section.unitNumber} ${section.sectionId} ${tradeState.trade} exists on the board`);
      assert.equal(tradeState.execution, work.execution, 'execution is the board\'s execution');
      assert.equal(tradeState.inspection === 'callback-required' || tradeState.inspection === 'reinspection-pending', work.callbackOpen, 'callback truth matches');
      assert.equal(tradeState.propertyWalk === 'accepted', work.property === 'property-accepted', 'acceptance truth matches');
    }
  }
});

// The pin: the day-task has no reducer of its own any more.
test('the day-task reads the Track C projection instead of folding events itself', () => {
  const source = readFileSync(new URL('../src/features/wave2a2-core/appDataAdapters.ts', import.meta.url), 'utf8');
  assert.match(source, /taskExecutionState\(result\.task, projectTrackCState\(data\)/u);
  assert.doesNotMatch(source, /\.reduce\(\(state, event\) => \{\s*if \(event\.eventType === 'assignment-confirmed'\)/u,
    'the second event reducer is gone');
});
