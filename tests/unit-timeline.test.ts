import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { projectUnitTimeline } from '../src/lib/unitTimeline.ts';

test('Unit timeline joins only source-grounded active-project records', () => {
  const data = structuredClone(seedData);
  const unit = data.units.find((candidate) => candidate.id === 'unit_101');
  assert.ok(unit);
  unit.notes = 'First line stays part of the aggregate.\nSecond line is not a fake event.';
  unit.updatedAt = '2026-07-20T12:02:00.000Z';

  data.activityLogs.push(
    {
      id: 'activity_unit_valid',
      projectId: data.activeProjectId,
      entityType: 'Unit',
      entityId: unit.id,
      action: 'Recorded a personal Unit change',
      note: 'Exact Activity wording',
      createdAt: '2026-07-20T12:01:00.000Z',
    },
    {
      id: 'activity_unit_invalid_time',
      projectId: data.activeProjectId,
      entityType: 'Unit',
      entityId: unit.id,
      action: 'Legacy Unit activity',
      note: '',
      createdAt: 'not-a-time',
    },
    {
      id: 'activity_other_project',
      projectId: 'project_other',
      entityType: 'Unit',
      entityId: unit.id,
      action: 'Wrong project activity',
      note: 'Must stay out',
      createdAt: '2026-07-20T12:10:00.000Z',
    },
  );
  data.photoNotes.push({
    id: 'photo_timeline',
    projectId: data.activeProjectId,
    unitId: unit.id,
    category: 'Problem',
    caption: 'Synthetic work photo',
    localImageAvailable: true,
    createdAt: '2026-07-20T12:06:00.000Z',
    updatedAt: '2026-07-20T12:06:00.000Z',
  });
  data.issues.push({
    id: 'issue_timeline',
    projectId: data.activeProjectId,
    unitId: unit.id,
    title: 'Synthetic Unit issue',
    category: 'Access',
    priority: 'High',
    owner: 'Los',
    status: 'Waiting',
    dueAt: '',
    notes: 'Exact issue wording',
    resolutionNotes: '',
    createdAt: '2026-07-20T12:04:00.000Z',
    updatedAt: '2026-07-20T12:05:00.000Z',
  });
  data.activityLogs.push({
    id: 'activity_duplicate_issue',
    projectId: data.activeProjectId,
    entityType: 'Issue',
    entityId: 'issue_timeline',
    action: 'Created issue',
    note: 'Generic duplicate activity',
    createdAt: '2026-07-20T12:04:00.000Z',
  });
  data.draftActions.push(
    {
      id: 'draft_timeline_by_id',
      type: 'ADD_UNIT_NOTE',
      title: 'Pending Unit draft',
      summary: 'Exact pending Draft wording',
      targetEntityType: 'unit',
      targetEntityId: unit.id,
      payload: {},
      confidence: 0.9,
      why: 'Synthetic timeline test',
      sourceText: 'Synthetic source',
      status: 'pending',
      createdAt: '2026-07-20T12:03:00.000Z',
    },
    {
      id: 'draft_timeline_by_number',
      type: 'ADD_UNIT_NOTE',
      title: 'Applied Unit draft',
      summary: 'Resolved by existing Unit number',
      targetEntityType: 'unit',
      payload: { captureProjectId: data.activeProjectId, unitNumber: unit.unitNumber },
      confidence: 0.9,
      why: 'Synthetic timeline test',
      sourceText: 'Synthetic source',
      status: 'applied',
      createdAt: '2026-07-20T12:02:30.000Z',
      appliedAt: '2026-07-20T12:05:30.000Z',
    },
  );

  const items = projectUnitTimeline(data, unit.id);

  assert.equal(items[0].id, 'photo:photo_timeline');
  assert.equal(items.at(-1)?.id, 'unit_activity:activity_unit_invalid_time');
  assert.equal(items.filter((item) => item.source === 'unit_notes').length, 1);
  assert.ok(items.some((item) => item.id === 'draft_action:draft_timeline_by_id'));
  assert.ok(items.some((item) => item.id === 'draft_action:draft_timeline_by_number'));
  assert.ok(!items.some((item) => item.id === 'unit_activity:activity_other_project'));
  assert.ok(!items.some((item) => item.id === 'unit_activity:activity_duplicate_issue'));
  assert.equal(
    items.find((item) => item.id === 'photo:photo_timeline')?.saveLabel,
    'Photo file available on this device',
  );
  assert.deepEqual(
    items.find((item) => item.id === 'draft_action:draft_timeline_by_id')?.action,
    { kind: 'open_review', draftId: 'draft_timeline_by_id' },
  );
  assert.ok(items.every((item) => !/synced/i.test(item.saveLabel ?? '')));
});

test('Unit timeline returns no cross-project or unknown Unit history', () => {
  const data = structuredClone(seedData);
  data.activeProjectId = 'project_missing';

  assert.deepEqual(projectUnitTimeline(data, 'unit_101'), []);
  assert.deepEqual(projectUnitTimeline(data, 'unit_missing'), []);
});
