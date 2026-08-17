import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  projectTrackCState,
  setTradeReleaseState,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import {
  closeActiveTurn,
  closedTurnSummary,
  isTurnClosed,
  reopenActiveTurn,
} from '../src/features/wave2a2-core/closedTurn.ts';
import type { AppData } from '../src/types.ts';

// Close Turn seals the ACTIVE project IN PLACE: activeProjectId must not move
// (the sealed turn is the saved record Los browses), nothing is deleted, and
// reopen restores a fully live turn. These pins protect the archive semantics
// the Rey-lunch demo and the payroll evidence depend on.

const NOW = '2026-08-17T20:00:00.000Z';

const buildData = (): { data: AppData; unitId: string } => {
  const data = structuredClone(seedData) as AppData;
  data.projects = data.projects.map((project) =>
    project.id === data.activeProjectId ? { ...project, mode: 'real' as const } : project);
  const unit = data.units.find((candidate) => candidate.projectId === data.activeProjectId);
  assert.ok(unit);
  data.dailyReleaseBatches = [];
  data.daySessions = [];
  return { data, unitId: unit.id };
};

let seq = 0;
const idFactory = (prefix: string) => `${prefix}-${(seq += 1)}`;

test('closing seals in place: archivedAt set, activeProjectId unchanged, end date stamped', () => {
  const { data } = buildData();
  const before = data.activeProjectId;
  const result = closeActiveTurn(data, NOW);
  assert.ok(result.ok, 'close should succeed with no open day');
  assert.equal(result.data.activeProjectId, before, 'the sealed turn stays active for browsing');
  const project = result.data.projects.find((item) => item.id === before);
  assert.equal(project?.archivedAt, NOW);
  assert.match(project?.endDate ?? '', /^2026-08-1[67]$/, 'end date is the local close day');
  assert.ok(isTurnClosed(result.data));
  assert.equal(result.data.activityLogs[0]?.action, 'Turn sealed');
  assert.ok(result.data.activityLogs[0]?.note.includes('reopen anytime'));
});

test('closing refuses while a day is still open, and refuses twice', () => {
  const { data } = buildData();
  data.daySessions = [{
    activeCleanCrewIds: [], activePaintCrewIds: [], createdAt: NOW, date: '2026-08-17',
    id: 'open-day', keyStatus: 'yes', morningNote: '', projectId: data.activeProjectId,
    releaseBatchIds: [], startedAt: NOW, startedBy: 'Los', status: 'active', updatedAt: NOW,
  }];
  const blocked = closeActiveTurn(data, NOW);
  assert.ok(!blocked.ok, 'an open day blocks sealing');
  assert.ok(!blocked.ok && blocked.reason.includes('End the day'));

  data.daySessions = [];
  const sealed = closeActiveTurn(data, NOW);
  assert.ok(sealed.ok);
  const again = closeActiveTurn(sealed.data, NOW);
  assert.ok(!again.ok, 'sealing twice refuses instead of re-stamping');
  assert.ok(!again.ok && again.reason.includes('already sealed'));
});

test('a demo project cannot be sealed', () => {
  const { data } = buildData();
  data.projects = data.projects.map((project) =>
    project.id === data.activeProjectId ? { ...project, mode: 'demo' as const } : project);
  const result = closeActiveTurn(data, NOW);
  assert.ok(!result.ok);
  assert.ok(!result.ok && result.reason.includes('real turn'));
});

test('reopen clears the seal and the turn is live again', () => {
  const { data } = buildData();
  const sealed = closeActiveTurn(data, NOW);
  assert.ok(sealed.ok);
  const reopened = reopenActiveTurn(sealed.data, '2026-08-18T15:00:00.000Z');
  assert.ok(reopened.ok);
  const project = reopened.data.projects.find((item) => item.id === data.activeProjectId);
  assert.equal(project?.archivedAt, undefined, 'archivedAt is fully removed, not blanked');
  assert.ok(!isTurnClosed(reopened.data));
  assert.equal(reopened.data.activityLogs[0]?.action, 'Turn reopened');
});

test('the saved-turn stat line counts released rooms from the ledger', () => {
  const { data, unitId } = buildData();
  data.daySessions = [{
    activeCleanCrewIds: [], activePaintCrewIds: [], createdAt: NOW, date: '2026-08-17',
    id: 'day-1', keyStatus: 'yes', morningNote: '', projectId: data.activeProjectId,
    releaseBatchIds: [], startedAt: NOW, startedBy: 'Los', status: 'active', updatedAt: NOW,
  }];
  const released = setTradeReleaseState(data, {
    idFactory, nowIso: NOW, released: true, trade: 'paint', unitId, workType: 'cut-in',
  });
  const state = projectTrackCState(released);
  const summary = closedTurnSummary(released, state, new Map());
  assert.equal(summary.unitCount, 1, 'one unit has released rooms');
  assert.ok(summary.paintRoomsReleased > 0, 'released paint rooms are counted');
  assert.equal(summary.cleanRoomsReleased, 0);
  assert.equal(summary.paintRoomsDone, 0, 'done counts come from pay math, absent here');
  assert.equal(summary.startDate, '2026-08-17', 'range starts at the first day session');
  assert.ok(summary.name.length > 0);
});
