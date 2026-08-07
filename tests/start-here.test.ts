import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import type { AppData, DaySession } from '../src/types.ts';
import {
  appendManualReleaseBatchOnce,
  createManualReleaseBatch,
  projectPropertyRoster,
  projectTrackCState,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import { projectStartHere } from '../src/features/wave2a2-track-c/startHere.ts';
import {
  applyTrackCSectionAction,
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
} from '../src/features/wave2a2-track-c/operations.ts';

// "Start here" surfaces work released on an earlier day that still isn't done —
// the 4 clean units Los couldn't finish last night must be the first thing he
// and the crew see this morning. Releases only count once they belong to a day
// session (that's how Start Day works), so the tests wire one like the app does.
const YESTERDAY = '2026-08-05';
const TODAY = '2026-08-06';

const addSession = (data: AppData, id: string, date: string, batchId: string, status: DaySession['status']): AppData => ({
  ...data,
  daySessions: [
    ...data.daySessions,
    {
      activeCleanCrewIds: [],
      activePaintCrewIds: [],
      createdAt: `${date}T13:00:00.000Z`,
      date,
      id,
      keyStatus: 'yes',
      morningNote: '',
      projectId: data.activeProjectId,
      propertyContact: 'PM',
      releaseBatchIds: [batchId],
      startedAt: `${date}T13:00:00.000Z`,
      startedBy: 'Los',
      status,
      updatedAt: `${date}T13:00:00.000Z`,
    },
  ],
});

const release = (
  data: AppData,
  date: string,
  isoTime: string,
  selections: Array<{ section: string; trade: string; unitId: string }>,
  id: string,
  status: DaySession['status'],
): AppData => {
  const batch = createManualReleaseBatch({
    actor: 'Los',
    date,
    id,
    propertyContact: 'PM',
    recordedAt: isoTime,
    roster: projectPropertyRoster(data),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selections: selections as any,
  });
  return addSession(appendManualReleaseBatchOnce(data, batch), `session-${id}`, date, id, status);
};

test('a clean unit released yesterday with no crew shows as Start here (no-crew)', () => {
  let data = structuredClone(seedData) as AppData;
  data = release(data, YESTERDAY, '2026-08-05T18:00:00.000Z',
    [{ section: 'common', trade: 'clean', unitId: 'unit_101' }], 'r-carry', 'closed');
  const startHere = projectStartHere(projectTrackCState(data), TODAY);
  const line = startHere.find((item) => item.unitId === 'unit_101' && item.trade === 'clean');
  assert.ok(line, 'the carryover clean unit must surface');
  assert.equal(line.stage, 'no-crew');
  assert.ok(line.rooms.includes('Common'), 'shows the common room still to do');
  assert.equal(line.crewNames.length, 0);
});

test('work released TODAY is NOT carryover (only prior-day work is Start here)', () => {
  let data = structuredClone(seedData) as AppData;
  data = release(data, TODAY, `${TODAY}T15:00:00.000Z`,
    [{ section: 'common', trade: 'clean', unitId: 'unit_101' }], 'r-today', 'active');
  const startHere = projectStartHere(projectTrackCState(data), TODAY);
  assert.equal(startHere.some((item) => item.unitId === 'unit_101'), false);
});

test('assigning a carryover unit flips it to in-progress with the crew named', () => {
  let data = structuredClone(seedData) as AppData;
  data = release(data, YESTERDAY, '2026-08-05T18:00:00.000Z',
    [{ section: 'common', trade: 'clean', unitId: 'unit_101' }], 'r-assign', 'active');
  const state = projectTrackCState(data);
  const crew = state.crews.find((candidate) => candidate.trade === 'clean');
  assert.ok(crew, 'a clean crew exists to assign');

  const proposal = createTrackCBulkAssignmentProposal(state, {
    createdAt: '2026-08-06T13:00:00.000Z',
    createdBy: 'Los',
    crewId: crew.id,
    proposalId: 'p1',
    sectionMode: 'all-released',
    sections: [],
    trade: 'clean',
    unitIds: ['unit_101'],
  });
  const confirmed = confirmTrackCBulkAssignmentProposal(state, proposal, {
    confirmed: true,
    eventIdPrefix: 'a1',
    recordedAt: '2026-08-06T13:00:01.000Z',
    recordedBy: 'Los',
  });
  assert.ok(confirmed.ok, 'assignment confirms');
  let track = confirmed.value.state;
  for (const target of confirmed.value.receipt.assignedTargets) {
    const started = applyTrackCSectionAction(track, {
      action: 'start-work',
      eventId: `s-${target.section}`,
      recordedAt: '2026-08-06T13:00:02.000Z',
      recordedBy: 'Los',
      target,
    });
    if (started.ok) track = started.value;
  }

  const line = projectStartHere(track, TODAY).find((item) => item.unitId === 'unit_101' && item.trade === 'clean');
  assert.ok(line, 'still on Start here — assigned but not finished');
  assert.equal(line.stage, 'in-progress');
  assert.equal(line.crewNames.length, 1);
  assert.equal(line.crewNames[0], crew.name);
});

test('top-floor-first ordering when several carry over', () => {
  let data = structuredClone(seedData) as AppData;
  const units = seedData.units.slice(0, 3).map((unit) => unit.id);
  data = release(data, YESTERDAY, '2026-08-05T18:00:00.000Z',
    units.map((unitId) => ({ section: 'common', trade: 'clean', unitId })), 'r-many', 'closed');
  const startHere = projectStartHere(projectTrackCState(data), TODAY);
  assert.ok(startHere.length >= 2, 'multiple carryover lines');
  const numbers = startHere.map((item) => item.unitNumber);
  const sorted = [...numbers].sort((a, b) => {
    const fa = Number(a.slice(0, -2)) || 0;
    const fb = Number(b.slice(0, -2)) || 0;
    return fb - fa || a.localeCompare(b, undefined, { numeric: true });
  });
  assert.deepEqual(numbers, sorted, 'higher floor first');
});
