import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { projectUnitCards } from '../src/lib/unitCardProjection.ts';

test('compact Unit projection counts only source-grounded personal attention', () => {
  const data = structuredClone(seedData);
  const unit = {
    ...data.units[0],
    notes: 'Check access before entering.',
    overallStatus: 'Access Blocked' as const,
    updatedAt: '2026-07-20T12:00:00.000Z',
  };
  data.units[0] = unit;
  data.issues.push({
    id: 'issue_projection',
    projectId: data.activeProjectId,
    unitId: unit.id,
    title: 'Key does not open door',
    category: 'Access',
    priority: 'Critical',
    owner: 'Los',
    status: 'Open',
    dueAt: '',
    notes: '',
    resolutionNotes: '',
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:01:00.000Z',
  });
  data.draftActions.push({
    id: 'draft_projection',
    type: 'ADD_UNIT_NOTE',
    title: 'Add access note',
    summary: 'Draft only',
    targetEntityType: 'unit',
    targetEntityId: unit.id,
    payload: {},
    confidence: 0.9,
    why: 'Synthetic test',
    sourceText: 'Check access',
    status: 'pending',
    createdAt: '2026-07-20T12:02:00.000Z',
  });
  data.followUpTasks.push({
    id: 'followup_projection',
    title: 'Get replacement key',
    description: 'Personal follow-up',
    priority: 'High',
    dueAt: '',
    owner: 'Los',
    relatedEntityType: 'unit',
    relatedEntityId: unit.id,
    status: 'open',
    createdAt: '2026-07-20T12:03:00.000Z',
  });
  data.photoNotes.push({
    id: 'photo_projection',
    projectId: data.activeProjectId,
    unitId: unit.id,
    category: 'Problem',
    caption: 'Door lock',
    createdAt: '2026-07-20T12:04:00.000Z',
    updatedAt: '2026-07-20T12:04:00.000Z',
  });

  const projection = projectUnitCards(data, [unit])[0];
  assert.equal(projection.attentionCount, 3);
  assert.equal(projection.noteCount, 1);
  assert.equal(projection.photoCount, 1);
  assert.equal(projection.criticalWarning, 'Key does not open door');
  assert.equal(projection.personalState, 'Access Blocked');
  assert.equal(projection.updatedAt, '2026-07-20T12:04:00.000Z');
});

test('compact Unit projection does not infer occupancy or room restrictions from notes', () => {
  const data = structuredClone(seedData);
  const unit = { ...data.units[0], notes: 'Resident mentioned room B.' };
  data.units[0] = unit;

  const projection = projectUnitCards(data, [unit])[0];
  assert.equal(projection.noteCount, 1);
  assert.doesNotMatch(projection.criticalWarning ?? '', /renewal|occupied|room B/i);
});
