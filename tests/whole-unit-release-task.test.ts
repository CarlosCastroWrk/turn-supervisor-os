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
