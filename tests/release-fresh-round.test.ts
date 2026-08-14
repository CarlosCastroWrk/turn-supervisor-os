import assert from 'node:assert/strict';
import test from 'node:test';
import { projectTrackCWork } from '../src/features/wave2a2-track-c/projections.ts';
import { buildAllCrewPayroll } from '../src/features/wave2a2-track-c/crewPayroll.ts';
import type { TrackCState } from '../src/features/wave2a2-track-c/model.ts';

// The resurrection bug (Aug 12): a room that was passed/approved, then
// removed, then RE-released came back instantly "Passed" — its old events
// replayed into the new round, so Los's release tap looked like it did
// nothing. A re-release mints a fresh batch stamped now; events from the
// room's previous life must not replay. Pay from round one SURVIVES.

const target = { section: 'common', trade: 'paint' as const, unitId: 'u1' };

const stateWith = (releasedAt: string): TrackCState => ({
  units: [{
    id: 'u1',
    unitNumber: '803',
    workFacts: [{
      id: 'f1',
      unitId: 'u1',
      trade: 'paint',
      section: 'common',
      release: 'released',
      access: 'clear',
      sourceConfidence: 'confirmed',
      sourceLabel: 'test',
      releasedAt,
    }],
  }],
  crews: [{ id: 'rocky', name: 'Rocky', trade: 'paint', active: true }],
  events: [
    // Round one: assigned, done, passed by Los — then the room was removed.
    { confirmation: 'confirmed', crewId: 'rocky', eventType: 'assignment-confirmed', id: 'e1', recordedAt: '2026-08-10T14:00:00.000Z', target },
    { confirmation: 'confirmed', crewId: 'rocky', eventType: 'crew-reported-complete', id: 'e2', recordedAt: '2026-08-10T18:00:00.000Z', target },
    { confirmation: 'confirmed', eventType: 'los-passed', id: 'e3', recordedAt: '2026-08-10T19:00:00.000Z', target },
  ],
} as unknown as TrackCState);

test('a re-released room comes back FRESH — old passed state does not replay', () => {
  // Re-released Aug 12: the round-one events are older than the new stamp.
  const work = projectTrackCWork(stateWith('2026-08-12T15:00:00.000Z'), target);
  assert.ok(work);
  assert.equal(work.execution, 'unassigned', 'no ghost crew on the new round');
  assert.equal(work.inspection, 'not-ready', 'not pre-passed');
  assert.equal(work.property, 'not-ready');
});

test('a normal release (events after the stamp) keeps its state', () => {
  const work = projectTrackCWork(stateWith('2026-08-10T07:00:00.000Z'), target);
  assert.ok(work);
  assert.equal(work.inspection, 'los-passed', 'same-round pass stands');
});

test('round-one pay survives the re-release', () => {
  const payroll = buildAllCrewPayroll(stateWith('2026-08-12T15:00:00.000Z'), new Date('2026-08-12T18:00:00.000Z'));
  assert.equal(payroll.get('rocky')?.rooms.length, 1, 'Rocky keeps the pay for the work he did');
});

// ---------------------------------------------------------------------------
// Aug 12 field bug: 25 APPROVED units showed in "Needs Crew". Two causes, two
// pins. (1) A room re-listed in a LATER batch while its original release was
// still live re-stamped releasedAt, so the fresh-round skip threw away the
// crew and the room's history mid-flight. A duplicate listing is the SAME
// round — only a remove-then-re-add is a fresh one. (2) Even when crew
// attribution is lost, approved/passed work must never queue as Needs Crew.

test('a duplicate live release is the SAME round — crew and approval survive', async () => {
  const { seedData } = await import('../src/data/seed.ts');
  const {
    appendManualReleaseBatchOnce,
    applyTrackCStateChange,
    createManualReleaseBatch,
    projectPropertyRoster,
    projectTrackCState,
  } = await import('../src/features/wave2a2-core/appDataAdapters.ts');
  const {
    applyTrackCSectionAction,
    confirmTrackCBulkAssignmentProposal,
    createTrackCBulkAssignmentProposal,
    recordTrackCDirectPropertyAcceptance,
  } = await import('../src/features/wave2a2-track-c/operations.ts');
  type AppData = import('../src/types.ts').AppData;
  type DaySession = import('../src/types.ts').DaySession;

  const DATE = '2026-08-07';
  let seq = 0;
  const at = () => `2026-08-07T13:00:${String(seq++).padStart(2, '0')}.000Z`;
  let data = structuredClone(seedData) as AppData;
  const dupTarget = { section: 'A' as const, trade: 'paint' as const, unitId: 'unit_101' };
  const batch = createManualReleaseBatch({
    actor: 'Los', date: DATE, id: 'dup-r1', propertyContact: 'PM', recordedAt: at(),
    roster: projectPropertyRoster(data),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selections: [dupTarget] as any,
  });
  data = appendManualReleaseBatchOnce(data, batch);
  const session: DaySession = {
    activeCleanCrewIds: [], activePaintCrewIds: [], createdAt: at(), date: DATE,
    id: 'dup-s1', keyStatus: 'yes', morningNote: '', projectId: data.activeProjectId,
    propertyContact: 'PM', releaseBatchIds: ['dup-r1'], startedAt: at(), startedBy: 'Los',
    status: 'active', updatedAt: at(),
  };
  data = { ...data, daySessions: [...data.daySessions, session] };

  // Round one: assign, work, pass, property accepts.
  let state = projectTrackCState(data);
  const crewId = state.crews.find((crew) => crew.trade === 'paint')!.id;
  const proposal = createTrackCBulkAssignmentProposal(state, {
    createdAt: at(), createdBy: 'Los', crewId, proposalId: 'dup-p', sectionMode: 'specific',
    sections: ['A'], trade: 'paint', unitIds: ['unit_101'],
  });
  const confirmed = confirmTrackCBulkAssignmentProposal(state, proposal, {
    confirmed: true, eventIdPrefix: 'dup-a', recordedAt: at(), recordedBy: 'Los',
  });
  assert.ok(confirmed.ok);
  state = confirmed.value.state;
  for (const action of ['start-work', 'record-crew-complete', 'record-los-pass'] as const) {
    const result = applyTrackCSectionAction(state, {
      action, eventId: `dup-${action}`, recordedAt: at(), recordedBy: 'Los', target: dupTarget,
    });
    assert.ok(result.ok);
    state = result.value;
  }
  const accepted = recordTrackCDirectPropertyAcceptance(state, {
    idFactory: (prefix) => `${prefix}-dup-${seq++}`, recordedAt: at(), recordedBy: 'Los',
    trade: 'paint', unitId: 'unit_101',
  });
  assert.ok(accepted.ok);
  state = accepted.value;
  data = applyTrackCStateChange(data, state);

  // The same room lands in a SECOND batch later that day (list re-upload
  // overlap) while the first release is still live.
  const duplicate = createManualReleaseBatch({
    actor: 'Los', date: DATE, id: 'dup-r2', propertyContact: 'PM',
    recordedAt: '2026-08-07T18:00:00.000Z',
    roster: projectPropertyRoster(data),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selections: [dupTarget] as any,
  });
  data = appendManualReleaseBatchOnce(data, duplicate);
  data = {
    ...data,
    daySessions: data.daySessions.map((candidate) =>
      candidate.id === 'dup-s1'
        ? { ...candidate, releaseBatchIds: ['dup-r1', 'dup-r2'] }
        : candidate),
  };

  const work = projectTrackCWork(projectTrackCState(data), dupTarget);
  assert.ok(work);
  assert.equal(work.property, 'property-accepted', 'approval survives the duplicate listing');
  assert.ok(work.responsibleCrewId, 'the crew stays on the room');
});

test('approved or Los-passed work never queues as Needs Crew, even with no crew attribution', async () => {
  const { buildCanonicalFieldProjection } = await import('../src/features/wave2a21-track-a/projections.ts');
  const acceptedTarget = { section: 'common' as const, trade: 'paint' as const, unitId: 'q1' };
  const passedTarget = { section: 'A' as const, trade: 'paint' as const, unitId: 'q1' };
  const fact = (section: 'common' | 'A') => ({
    id: `qf-${section}`,
    unitId: 'q1',
    trade: 'paint',
    section,
    release: 'released',
    access: 'clear',
    sourceConfidence: 'confirmed',
    sourceLabel: 'test',
    // Re-stamped AFTER the crew was assigned: attribution is lost.
    releasedAt: '2026-08-12T15:00:00.000Z',
  });
  const queueState = {
    propertyId: 'proj',
    units: [{
      id: 'q1',
      unitNumber: '403',
      unitType: '4BR',
      locationLabel: 'Test',
      workFacts: [fact('common'), fact('A')],
    }],
    crews: [{ id: 'rocky', name: 'Rocky', trade: 'paint', active: true }],
    events: [
      // Common: history predates the stamp except the acceptance.
      { confirmation: 'confirmed', crewId: 'rocky', eventType: 'assignment-confirmed', id: 'q-e1', recordedAt: '2026-08-10T14:00:00.000Z', target: acceptedTarget },
      { confirmation: 'confirmed', eventType: 'los-passed', id: 'q-e2', recordedAt: '2026-08-10T19:00:00.000Z', target: acceptedTarget },
      { confirmation: 'confirmed', eventType: 'property-accepted', id: 'q-e3', recordedAt: '2026-08-12T16:00:00.000Z', target: acceptedTarget },
      // Room A: passed AFTER the stamp, but its assignment predates it.
      { confirmation: 'confirmed', crewId: 'rocky', eventType: 'assignment-confirmed', id: 'q-e4', recordedAt: '2026-08-10T14:00:00.000Z', target: passedTarget },
      { confirmation: 'confirmed', eventType: 'crew-reported-complete', id: 'q-e5', recordedAt: '2026-08-12T16:00:00.000Z', target: passedTarget },
      { confirmation: 'confirmed', eventType: 'los-passed', id: 'q-e6', recordedAt: '2026-08-12T17:00:00.000Z', target: passedTarget },
    ],
  } as unknown as TrackCState;

  const projection = buildCanonicalFieldProjection({
    accountId: 'acct',
    fieldEvents: [],
    projectId: 'proj',
    todayTask: null,
    trackCState: queueState,
  });
  const needsCrewKeys = projection.queues['needs-crew']
    .map((record) => `${record.target.unitId}:${record.target.section}`);
  assert.deepEqual(needsCrewKeys, [], 'finished work is not unassigned work');
});

// Payroll-eve pin (Aug 14): a NEW ROUND pays the same crew AGAIN — "round-one
// pay survives; the new work pays like new work" — while a same-round redo
// (callback re-report) still pays once.
test('same crew is paid for round one AND the new round — but a redo pays once', () => {
  const roundTwoState = (events: object[]): TrackCState => ({
    units: [{
      id: 'u1',
      unitNumber: '803',
      workFacts: [{
        id: 'f1', unitId: 'u1', trade: 'paint', section: 'common',
        release: 'released', access: 'clear', sourceConfidence: 'confirmed',
        sourceLabel: 'test',
        // Round two released Aug 12 — round-one events predate this stamp.
        releasedAt: '2026-08-12T15:00:00.000Z',
      }],
    }],
    crews: [{ id: 'rocky', name: 'Rocky', trade: 'paint', active: true }],
    events,
  } as unknown as TrackCState);

  // Round one done Aug 10, round two done Aug 12 after the re-release.
  const twoRounds = roundTwoState([
    { confirmation: 'confirmed', crewId: 'rocky', eventType: 'crew-reported-complete', id: 'p1', recordedAt: '2026-08-10T18:00:00.000Z', target },
    { confirmation: 'confirmed', crewId: 'rocky', eventType: 'crew-reported-complete', id: 'p2', recordedAt: '2026-08-12T18:00:00.000Z', target },
  ]);
  const paid = buildAllCrewPayroll(twoRounds, new Date('2026-08-12T20:00:00.000Z')).get('rocky');
  assert.equal(paid?.rooms.length, 2, 'round one and the new round BOTH pay');

  // A redo inside ONE round (two reports, both after the live stamp) pays once.
  const redo = roundTwoState([
    { confirmation: 'confirmed', crewId: 'rocky', eventType: 'crew-reported-complete', id: 'p3', recordedAt: '2026-08-12T18:00:00.000Z', target },
    { confirmation: 'confirmed', crewId: 'rocky', eventType: 'crew-reported-complete', id: 'p4', recordedAt: '2026-08-12T19:00:00.000Z', target },
  ]);
  const once = buildAllCrewPayroll(redo, new Date('2026-08-12T20:00:00.000Z')).get('rocky');
  assert.equal(once?.rooms.length, 1, 'a same-round redo still pays exactly once');
});
