import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { setReleaseWorkType } from '../src/features/wave2a2-core/appDataAdapters.ts';
import {
  appendPersonalNoteActivity,
  noteKindForAction,
} from '../src/features/wave2a1-native/track-c/personalActivity.ts';
import type { AppData } from '../src/types.ts';

// Field rule (Los, Aug 8): a cut-in that becomes a full paint always pays the
// crew for the work (task → full+cut-in), but only Joseph's change order is
// CHARGEABLE to the property — "our catch" and "crew redo" are logged with no
// charge. This pins that split (the host handler composes exactly these two
// adapters), so the pay-packet charge column can never silently include a
// no-charge upgrade.

const NOW = '2026-08-08T15:00:00.000Z';

const buildData = (): { data: AppData; unitId: string } => {
  const data = structuredClone(seedData) as AppData;
  data.projects = data.projects.map((project) =>
    project.id === data.activeProjectId ? { ...project, mode: 'real' as const } : project);
  const unit = data.units.find((candidate) => candidate.projectId === data.activeProjectId);
  assert.ok(unit);
  data.dailyReleaseBatches = [{
    id: 'b1', projectId: data.activeProjectId, date: '2026-08-08',
    propertyContact: 'Joseph', sourceType: 'manual', sourceLabel: 'test',
    status: 'confirmed',
    items: [{ id: 'i1', unitId: unit.id, trade: 'paint', section: 'A', sourceExcerpt: 't', workType: 'cut-in' }],
    uncertainties: [], confirmedBy: 'Los', confirmedAt: NOW, createdAt: NOW, updatedAt: NOW,
  }];
  data.daySessions = [{
    id: 's1', projectId: data.activeProjectId, date: '2026-08-08',
    startedAt: NOW, startedBy: 'Los', propertyContact: 'Joseph', keyStatus: 'yes',
    releaseBatchIds: ['b1'], activePaintCrewIds: [], activeCleanCrewIds: [],
    morningNote: '', status: 'active', createdAt: NOW, updatedAt: NOW,
  }];
  return { data, unitId: unit.id };
};

const upgrade = (data: AppData, unitId: string, charge: boolean): AppData => {
  let next = setReleaseWorkType(data, { section: 'A', trade: 'paint', unitId, workType: 'full-cut-in' });
  const note = appendPersonalNoteActivity(next, {
    kind: charge ? 'change-order' : 'note',
    unitId,
    wording: `A: cut-in → full paint — ${charge ? 'Joseph change order — charge' : 'our catch — no charge'}`,
  });
  if (note.ok) next = note.data;
  return next;
};

const roomWorkType = (data: AppData, unitId: string) =>
  data.dailyReleaseBatches[0].items.find((item) => item.unitId === unitId && item.section === 'A')?.workType;

test('Joseph upgrade → task full+cut-in AND a chargeable change-order note', () => {
  const { data, unitId } = buildData();
  const next = upgrade(data, unitId, true);
  assert.equal(roomWorkType(next, unitId), 'full-cut-in', 'crew paid for full + cut-in');
  const kinds = next.activityLogs.map((log) => noteKindForAction(log.action));
  assert.ok(kinds.includes('change-order'), 'Joseph change order is chargeable');
});

test('our-catch upgrade → task full+cut-in but a PLAIN note (no charge)', () => {
  const { data, unitId } = buildData();
  const next = upgrade(data, unitId, false);
  assert.equal(roomWorkType(next, unitId), 'full-cut-in', 'crew still paid for the work');
  const kinds = next.activityLogs.map((log) => noteKindForAction(log.action));
  assert.ok(!kinds.includes('change-order'), 'a no-charge upgrade never logs a chargeable change order');
  assert.ok(kinds.includes('note'), 'it is still recorded as a plain note');
});
