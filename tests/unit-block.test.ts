import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  projectTrackCState,
  setUnitReleaseRestriction,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import type { AppData } from '../src/types.ts';

// Blocking a unit stamps a restriction on its release items; unblocking must
// clear it — per trade or whole unit. Pinned after a field report that
// unblock "did nothing": the data layer is proven here end to end.

const NOW = '2026-08-02T18:00:00.000Z';

const buildData = (): { data: AppData; unitId: string } => {
  const data = structuredClone(seedData) as AppData;
  data.projects = data.projects.map((p) =>
    p.id === data.activeProjectId ? { ...p, mode: 'real' as const } : p);
  const unit = data.units.find((u) => u.projectId === data.activeProjectId);
  assert.ok(unit);
  data.dailyReleaseBatches = [{
    id: 'b1', projectId: data.activeProjectId, date: '2026-08-02',
    propertyContact: 'Joseph', sourceType: 'manual', sourceLabel: 'test',
    status: 'confirmed',
    items: [
      { id: 'i1', unitId: unit.id, trade: 'paint', section: 'common', sourceExcerpt: 't' },
      { id: 'i2', unitId: unit.id, trade: 'clean', section: 'common', sourceExcerpt: 't' },
    ],
    uncertainties: [], confirmedBy: 'Los', confirmedAt: NOW, createdAt: NOW, updatedAt: NOW,
  }];
  data.daySessions = [{
    id: 's1', projectId: data.activeProjectId, date: '2026-08-02',
    startedAt: NOW, startedBy: 'Los', propertyContact: 'Joseph', keyStatus: 'yes',
    releaseBatchIds: ['b1'], activePaintCrewIds: [], activeCleanCrewIds: [],
    morningNote: '', status: 'active', createdAt: NOW, updatedAt: NOW,
  }];
  return { data, unitId: unit.id };
};

const accessByTrade = (data: AppData, unitId: string) => {
  const state = projectTrackCState(data);
  const unit = state.units.find((c) => c.id === unitId);
  assert.ok(unit);
  return Object.fromEntries(unit.workFacts
    .filter((f) => f.release === 'released')
    .map((f) => [f.trade, f.access]));
};

test('block both trades, then unblock both, returns every section to clear', () => {
  const { data, unitId } = buildData();
  const blocked = setUnitReleaseRestriction(data, unitId, 'Occupied — do not enter');
  assert.deepEqual(accessByTrade(blocked, unitId), {
    clean: 'occupied-restricted', paint: 'occupied-restricted',
  });
  const unblocked = setUnitReleaseRestriction(blocked, unitId, undefined);
  assert.deepEqual(accessByTrade(unblocked, unitId), { clean: 'clear', paint: 'clear' });
});

test('paint-only block leaves clean clear; paint-only unblock clears it', () => {
  const { data, unitId } = buildData();
  const blocked = setUnitReleaseRestriction(data, unitId, 'Paint after Turn', 'paint');
  assert.deepEqual(accessByTrade(blocked, unitId), {
    clean: 'clear', paint: 'access-blocked',
  });
  const unblocked = setUnitReleaseRestriction(blocked, unitId, undefined, 'paint');
  assert.deepEqual(accessByTrade(unblocked, unitId), { clean: 'clear', paint: 'clear' });
});

test('trade-scoped unblock leaves the other trade blocked', () => {
  const { data, unitId } = buildData();
  const blocked = setUnitReleaseRestriction(data, unitId, 'Occupied — do not enter');
  const partial = setUnitReleaseRestriction(blocked, unitId, undefined, 'paint');
  assert.deepEqual(accessByTrade(partial, unitId), {
    clean: 'occupied-restricted', paint: 'clear',
  });
});
