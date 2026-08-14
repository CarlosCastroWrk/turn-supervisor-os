import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  projectTrackCState,
  setTradeReleaseState,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import type { AppData } from '../src/types.ts';

// Field bug (Aug 8, Moon Tower): when Los released a whole unit from the board,
// every room recorded with NO task, so the board and the pay packet silently
// showed "full paint" even for touch-ups and cut-ins — corrupting the cut-in
// count Tony pays off. The whole-unit release now carries the task Los picked,
// and it must land on every released room. When no task is given, the release
// must still behave exactly as before (no task stamped).

const NOW = '2026-08-08T14:00:00.000Z';

const buildData = (): { data: AppData; unitId: string } => {
  const data = structuredClone(seedData) as AppData;
  data.projects = data.projects.map((project) =>
    project.id === data.activeProjectId ? { ...project, mode: 'real' as const } : project);
  const unit = data.units.find((candidate) => candidate.projectId === data.activeProjectId);
  assert.ok(unit);
  data.dailyReleaseBatches = [];
  data.daySessions = [{
    id: 's1', projectId: data.activeProjectId, date: '2026-08-08',
    startedAt: NOW, startedBy: 'Los', propertyContact: 'Joseph', keyStatus: 'yes',
    releaseBatchIds: [], activePaintCrewIds: [], activeCleanCrewIds: [],
    morningNote: '', status: 'active', createdAt: NOW, updatedAt: NOW,
  }];
  return { data, unitId: unit.id };
};

let seq = 0;
const idFactory = (prefix: string) => `${prefix}-${(seq += 1)}`;

const paintTypes = (data: AppData, unitId: string) => {
  const state = projectTrackCState(data);
  const unit = state.units.find((candidate) => candidate.id === unitId);
  assert.ok(unit);
  return unit.workFacts
    .filter((fact) => fact.trade === 'paint' && fact.release === 'released')
    .map((fact) => fact.workType);
};

test('whole-unit release stamps the chosen task on every released paint room', () => {
  const { data, unitId } = buildData();
  const released = setTradeReleaseState(data, {
    idFactory, nowIso: NOW, released: true, trade: 'paint', unitId, workType: 'cut-in',
  });
  const types = paintTypes(released, unitId);
  assert.ok(types.length > 0, 'the unit should have released paint rooms');
  assert.ok(types.every((type) => type === 'cut-in'),
    'every released room carries the picked task — none silently default to full');
});

test('whole-unit release with no task stamps nothing (prior behavior preserved)', () => {
  const { data, unitId } = buildData();
  const released = setTradeReleaseState(data, {
    idFactory, nowIso: NOW, released: true, trade: 'paint', unitId,
  });
  const types = paintTypes(released, unitId);
  assert.ok(types.length > 0);
  assert.ok(types.every((type) => type === undefined),
    'without a picked task the release records no workType, exactly as before');
});

// Aug 14 field bug: "sometimes I am unable to add rooms to a unit" — with no
// ACTIVE day session (evening after End Day, morning before Start Day) the
// release writers silently did nothing while the toast said released. They
// now fall back to the most recent Day Session. And the already-released
// check must look across ALL sessions' batches, or a whole-unit release
// duplicates rooms released on an earlier day (the unit-1001 week split).

test('adding a room works with the day CLOSED — attaches to the latest session', async () => {
  const { setSectionReleaseState } = await import('../src/features/wave2a2-core/appDataAdapters.ts');
  const { data, unitId } = buildData();
  data.daySessions = data.daySessions.map((session) => ({ ...session, status: 'closed' as const }));
  const released = setSectionReleaseState(data, {
    idFactory, nowIso: NOW, released: true, section: 'A', trade: 'paint', unitId,
  });
  const state = projectTrackCState(released);
  const fact = state.units.find((candidate) => candidate.id === unitId)
    ?.workFacts.find((candidate) => candidate.trade === 'paint' && candidate.section === 'A');
  assert.equal(fact?.release, 'released', 'the room releases even after End Day');
  assert.ok(
    released.daySessions.some((session) => session.releaseBatchIds.length > 0),
    'the adjustment batch attached to the fallback session',
  );
});

test('whole-unit release never duplicates rooms released under an EARLIER session', () => {
  const { data, unitId } = buildData();
  // Day one released room A; day two is a separate active session.
  const dayOne = setTradeReleaseState(data, {
    idFactory, nowIso: NOW, released: true, trade: 'paint', unitId, workType: 'cut-in',
  });
  const originalCount = dayOne.dailyReleaseBatches
    .flatMap((batch) => batch.items)
    .filter((item) => item.unitId === unitId && item.trade === 'paint').length;
  const dayTwo: AppData = {
    ...dayOne,
    daySessions: [
      { ...dayOne.daySessions[0], status: 'closed' as const },
      {
        ...dayOne.daySessions[0], id: 's2', date: '2026-08-09',
        releaseBatchIds: [], status: 'active' as const,
      },
    ],
  };
  const again = setTradeReleaseState(dayTwo, {
    idFactory, nowIso: '2026-08-09T14:00:00.000Z', released: true, trade: 'paint', unitId,
  });
  const items = again.dailyReleaseBatches
    .flatMap((batch) => batch.items)
    .filter((item) => item.unitId === unitId && item.trade === 'paint');
  assert.equal(
    items.length,
    originalCount,
    'day-two whole-unit release adds NO duplicate rows for already-released rooms',
  );
});
