import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { projectUnitTimeline } from '../src/lib/unitTimeline.ts';
import type { AppData } from '../src/types.ts';
import {
  appendPersonalNoteActivity,
  projectPersonalNoteActivity,
  projectUnitPersonalNoteHistory,
} from '../src/features/wave2a1-native/track-c/personalActivity.ts';
import {
  createBlankPersonalNoteSession,
  createMemoryNoteDraftStorage,
  createPersonalNoteDraftStore,
  resumePersonalNoteSession,
} from '../src/features/wave2a1-native/track-c/noteDraft.ts';

const assertOnlyActivityLogsChanged = (
  before: AppData,
  after: AppData,
) => {
  for (const key of Object.keys(before) as Array<keyof AppData>) {
    if (key === 'activityLogs') continue;
    assert.strictEqual(
      after[key],
      before[key],
      `${key} must retain its original reference`,
    );
  }
};

test('New Note is always blank and never auto-opens an existing session draft', () => {
  const data = structuredClone(seedData);
  const storage = createMemoryNoteDraftStorage();
  const store = createPersonalNoteDraftStore(storage, data.activeProjectId);
  const exactDraft = '  Keep both spaces.\nSecond line stays exact.  ';

  store.save(
    {
      source: 'new',
      unitId: 'unit_101',
      wording: exactDraft,
    },
    '2026-07-28T15:00:00.000Z',
  );

  assert.equal(store.hasDraft(), true);
  assert.deepEqual(createBlankPersonalNoteSession('unit_102'), {
    source: 'new',
    unitId: 'unit_102',
    wording: '',
  });
  assert.equal(
    createBlankPersonalNoteSession('unit_102').wording,
    '',
    'New Note must ignore the stored session draft',
  );
});

test('Resume Draft is explicit and preserves exact wording and Unit context', () => {
  const data = structuredClone(seedData);
  const storage = createMemoryNoteDraftStorage();
  const store = createPersonalNoteDraftStore(storage, data.activeProjectId);
  const exactDraft = 'Room A — check behind door.\n\nCall José after walk.';

  assert.equal(resumePersonalNoteSession(store), null);

  store.save(
    {
      source: 'new',
      unitId: 'unit_101',
      wording: exactDraft,
    },
    '2026-07-28T15:01:00.000Z',
  );

  assert.deepEqual(resumePersonalNoteSession(store), {
    source: 'resumed',
    unitId: 'unit_101',
    wording: exactDraft,
  });
});

test('Save appends one project Activity with exact wording and no other mutation', () => {
  const data = structuredClone(seedData);
  const originalSnapshot = structuredClone(data);
  const exactWording = '  Management walk moved to 2:15.\nBring sparkle bucket.  ';

  const result = appendPersonalNoteActivity(
    data,
    { wording: exactWording },
    {
      createActivityId: () => 'activity_track_c_project',
      now: () => '2026-07-28T15:02:00.000Z',
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(data, originalSnapshot, 'the source AppData must remain untouched');
  assertOnlyActivityLogsChanged(data, result.data);
  assert.equal(result.data.activityLogs.length, data.activityLogs.length + 1);
  assert.deepEqual(result.activity, {
    id: 'activity_track_c_project',
    projectId: data.activeProjectId,
    entityType: 'Project',
    entityId: data.activeProjectId,
    action: 'Added personal note',
    note: exactWording,
    createdAt: '2026-07-28T15:02:00.000Z',
  });
  assert.equal(projectPersonalNoteActivity(result.data)[0], result.activity);
  assert.strictEqual(result.data.units, data.units);
  assert.strictEqual(result.data.draftActions, data.draftActions);
  assert.strictEqual(result.data.dailyLogs, data.dailyLogs);
});

test('Unit-linked note appears in Unit history without changing Unit or official state', () => {
  const data = structuredClone(seedData);
  const unit = data.units.find((candidate) => candidate.id === 'unit_101');
  assert.ok(unit);
  const originalUnit = structuredClone(unit);
  const exactWording = 'Paint touch-up behind the entry door.';

  const result = appendPersonalNoteActivity(
    data,
    {
      unitId: unit.id,
      wording: exactWording,
    },
    {
      createActivityId: () => 'activity_track_c_unit',
      now: () => '2026-07-28T15:03:00.000Z',
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assertOnlyActivityLogsChanged(data, result.data);
  assert.deepEqual(result.data.units.find((candidate) => candidate.id === unit.id), originalUnit);
  assert.equal(result.activity.entityType, 'Unit');
  assert.equal(result.activity.entityId, unit.id);
  assert.equal(result.activity.note, exactWording);
  assert.deepEqual(projectUnitPersonalNoteHistory(result.data, unit.id), [result.activity]);

  const timelineItem = projectUnitTimeline(result.data, unit.id).find(
    (item) => item.id === `unit_activity:${result.activity.id}`,
  );
  assert.ok(timelineItem);
  assert.equal(timelineItem.wording, exactWording);
  assert.equal(timelineItem.saveLabel, 'Personal app record');
});

test('Blank or unavailable Unit saves fail with the original AppData unchanged', () => {
  const data = structuredClone(seedData);

  const blank = appendPersonalNoteActivity(data, { wording: '   \n ' });
  assert.deepEqual(blank, { data, error: 'empty-note', ok: false });

  const missingUnit = appendPersonalNoteActivity(data, {
    unitId: 'unit_missing',
    wording: 'Do not save this.',
  });
  assert.deepEqual(missingUnit, { data, error: 'missing-unit', ok: false });

  assert.strictEqual(blank.data, data);
  assert.strictEqual(missingUnit.data, data);
});
