import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { todayISO } from '../src/lib/constants.ts';
import { buildReviewProjection } from '../src/lib/reviewProjection.ts';

test('Review projection keeps unresolved sources separate and project scoped', () => {
  const data = structuredClone(seedData);
  const timestamp = `${todayISO()}T12:00:00.000Z`;
  data.draftActions.push(
    {
      id: 'draft_review_pending',
      type: 'ADD_UNIT_NOTE',
      title: 'Add Unit note',
      summary: 'Draft summary',
      targetEntityType: 'unit',
      targetEntityId: 'unit_101',
      payload: {},
      confidence: 0.9,
      why: 'Synthetic review test',
      sourceText: 'Synthetic wording',
      status: 'pending',
      createdAt: timestamp,
    },
    {
      id: 'draft_review_terminal',
      type: 'ADD_UNIT_NOTE',
      title: 'Already applied',
      summary: 'Terminal draft',
      targetEntityType: 'unit',
      targetEntityId: 'unit_101',
      payload: {},
      confidence: 0.9,
      why: 'Synthetic review test',
      sourceText: 'Synthetic wording',
      status: 'applied',
      createdAt: timestamp,
      appliedAt: timestamp,
    },
  );
  data.followUpTasks.push(
    {
      id: 'followup_review_current',
      title: 'Return to Unit 101',
      description: 'Personal follow-up',
      priority: 'High',
      dueAt: '',
      owner: 'Los',
      relatedEntityType: 'unit',
      relatedEntityId: 'unit_101',
      status: 'open',
      createdAt: timestamp,
    },
    {
      id: 'followup_review_unknown_project',
      title: 'Unknown legacy task',
      description: 'No resolvable project',
      priority: 'Low',
      dueAt: '',
      owner: 'Los',
      status: 'open',
      createdAt: timestamp,
    },
  );
  data.agentRuns.push({
    id: 'run_review_failed',
    projectId: data.activeProjectId,
    mode: 'quick_capture',
    input: 'Synthetic capture',
    output: {},
    status: 'failed',
    createdAt: timestamp,
    error: 'Synthetic parse failure',
  });

  const items = buildReviewProjection(
    data,
    { state: 'failed', canRetry: true },
    { status: 'error', message: 'Synthetic sync failure' },
  );
  const categories = new Set(items.map((item) => item.category));

  assert.deepEqual(categories, new Set([
    'draft_action',
    'issue',
    'follow_up',
    'local_save',
    'sync',
    'capture_diagnostic',
  ]));
  assert.ok(items.some((item) => item.sourceId === 'draft_review_pending'));
  assert.ok(!items.some((item) => item.sourceId === 'draft_review_terminal'));
  assert.ok(items.some((item) => item.sourceId === 'followup_review_current'));
  assert.ok(!items.some((item) => item.sourceId === 'followup_review_unknown_project'));
});

test('Review projection does not advertise inactive sync or terminal work as unresolved', () => {
  const data = structuredClone(seedData);
  data.issues = data.issues.map((issue) => ({ ...issue, status: 'Resolved' as const }));

  const items = buildReviewProjection(
    data,
    { state: 'saved', canRetry: false },
    { status: 'disabled', message: 'Local only' },
  );

  assert.equal(items.length, 0);
});
