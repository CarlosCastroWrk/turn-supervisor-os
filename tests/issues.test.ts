import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { addIssueWithOptionalUnitBlock, closeIssueFromBoard, resolveIssue, updateIssue } from '../src/lib/actions.ts';
import type { AppData, Issue } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const issueForUnit = (unitId: string, patch: Partial<Issue> = {}): Issue => ({
  id: `issue_test_${patch.category ?? 'maintenance'}`,
  projectId: 'project_west_campus_turn',
  buildingId: 'building_a',
  floorId: 'floor_a_1',
  unitId,
  title: 'Test issue',
  category: 'Maintenance',
  priority: 'High',
  owner: '',
  status: 'Open',
  dueAt: '',
  notes: 'Test issue notes.',
  resolutionNotes: '',
  createdAt: '2026-07-08T12:00:00.000Z',
  updatedAt: '2026-07-08T12:00:00.000Z',
  ...patch,
});

test('non-blocking issue creation does not change the linked unit overall status', () => {
  const data = cloneSeed();
  const readyUnit = data.units.find((unit) => unit.id === 'unit_102');
  assert.ok(readyUnit);

  const next = addIssueWithOptionalUnitBlock(data, issueForUnit(readyUnit.id), false);
  const updatedUnit = next.units.find((unit) => unit.id === readyUnit.id);

  assert.equal(updatedUnit?.overallStatus, 'Ready');
  assert.equal(next.issues.length, data.issues.length + 1);
});

test('blocking issue creation requires explicit intent and changes the linked unit status', () => {
  const data = cloneSeed();
  const readyUnit = data.units.find((unit) => unit.id === 'unit_102');
  assert.ok(readyUnit);

  const next = addIssueWithOptionalUnitBlock(data, issueForUnit(readyUnit.id, { category: 'Access' }), true);
  const updatedUnit = next.units.find((unit) => unit.id === readyUnit.id);

  assert.equal(updatedUnit?.overallStatus, 'Access Blocked');
  assert.equal(next.issues.length, data.issues.length + 1);
});

test('resolving an issue does not silently guess or overwrite the linked unit status', () => {
  const data = cloneSeed();
  const readyUnit = data.units.find((unit) => unit.id === 'unit_102');
  assert.ok(readyUnit);

  const withIssue = addIssueWithOptionalUnitBlock(data, issueForUnit(readyUnit.id), false);
  const issue = withIssue.issues[0];
  const next = updateIssue(withIssue, issue.id, { status: 'Resolved' });
  const updatedUnit = next.units.find((unit) => unit.id === readyUnit.id);

  assert.equal(updatedUnit?.overallStatus, 'Ready');
  assert.equal(next.issues[0].status, 'Resolved');
});

test('resolveIssue keeps the issue row and leaves the linked unit status unchanged', () => {
  const data = cloneSeed();
  const readyUnit = data.units.find((unit) => unit.id === 'unit_102');
  assert.ok(readyUnit);

  const withIssue = addIssueWithOptionalUnitBlock(data, issueForUnit(readyUnit.id), false);
  const issue = withIssue.issues[0];
  const next = resolveIssue(withIssue, issue.id);
  const updatedUnit = next.units.find((unit) => unit.id === readyUnit.id);
  const resolvedIssue = next.issues.find((item) => item.id === issue.id);

  assert.equal(next.issues.length, withIssue.issues.length);
  assert.equal(resolvedIssue?.status, 'Resolved');
  assert.equal(resolvedIssue?.resolutionNotes, 'Resolved from issue board.');
  assert.equal(updatedUnit?.overallStatus, 'Ready');
});

test('closeIssueFromBoard soft closes without deleting the issue or changing the linked unit', () => {
  const data = cloneSeed();
  const readyUnit = data.units.find((unit) => unit.id === 'unit_102');
  assert.ok(readyUnit);

  const withIssue = addIssueWithOptionalUnitBlock(data, issueForUnit(readyUnit.id), false);
  const issue = withIssue.issues[0];
  const next = closeIssueFromBoard(withIssue, issue.id);
  const updatedUnit = next.units.find((unit) => unit.id === readyUnit.id);
  const closedIssue = next.issues.find((item) => item.id === issue.id);

  assert.equal(next.issues.length, withIssue.issues.length);
  assert.equal(closedIssue?.status, 'Closed');
  assert.equal(closedIssue?.resolutionNotes, 'Removed from normal issue board.');
  assert.equal(updatedUnit?.overallStatus, 'Ready');
});
