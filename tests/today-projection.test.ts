import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { buildTodayProjection } from '../src/lib/todayProjection.ts';

test('Today projection prioritizes reliability and review without inventing a task model', () => {
  const data = structuredClone(seedData);
  data.draftActions.push({
    id: 'draft_today',
    type: 'ADD_UNIT_NOTE',
    title: 'Draft Unit note',
    summary: 'Personal Draft Action',
    targetEntityType: 'unit',
    targetEntityId: 'unit_101',
    payload: {},
    confidence: 0.9,
    why: 'Synthetic today test',
    sourceText: 'Synthetic wording',
    status: 'pending',
    createdAt: '2026-07-20T12:00:00.000Z',
  });
  data.followUpTasks.push({
    id: 'followup_today',
    title: 'Check access again',
    description: 'Personal follow-up',
    priority: 'High',
    dueAt: '',
    owner: 'Los',
    relatedEntityType: 'unit',
    relatedEntityId: 'unit_103',
    status: 'in_progress',
    createdAt: '2026-07-20T12:00:00.000Z',
  });

  const projection = buildTodayProjection(
    data,
    { state: 'failed', canRetry: true },
    { status: 'offline', message: 'Synthetic offline state' },
  );

  assert.equal(projection.items[0].category, 'local_save');
  assert.equal(projection.items[1].category, 'sync');
  assert.equal(projection.items[2].category, 'draft_action');
  assert.equal(projection.draftCount, 1);
  assert.equal(projection.followUpCount, 1);
  assert.equal(projection.reliabilityCount, 2);
  assert.ok(projection.items.every((item) => !/current task|next task|backup task|official assignment/i.test(item.title)));
});

test('Today projection excludes records from another project', () => {
  const data = structuredClone(seedData);
  data.issues.push({
    ...data.issues[0],
    id: 'issue_other_project',
    projectId: 'project_other',
    title: 'Other project issue',
  });

  const projection = buildTodayProjection(
    data,
    { state: 'saved', canRetry: false },
    { status: 'disabled', message: 'Local only' },
  );

  assert.ok(!projection.items.some((item) => item.title === 'Other project issue'));
});
