import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { projectLaunchAppData } from '../src/features/launch-command-center/appDataProjection.ts';
import type { AppData, FollowUpTask, Issue } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;
const NOW = new Date('2026-08-03T16:00:00.000Z');

const followUp = (
  id: string,
  title: string,
  description: string,
  unitId: string,
): FollowUpTask => ({
  id,
  title,
  description,
  priority: 'High',
  dueAt: '2026-08-03T17:00:00.000Z',
  owner: 'Los',
  relatedEntityType: 'unit',
  relatedEntityId: unitId,
  status: 'open',
  createdAt: '2026-08-03T15:00:00.000Z',
});

const issue = (
  data: AppData,
  id: string,
  title: string,
  notes: string,
  unitId: string,
): Issue => ({
  id,
  projectId: data.activeProjectId,
  unitId,
  title,
  category: 'Crew',
  priority: 'High',
  owner: 'Los',
  status: 'Open',
  dueAt: '2026-08-03',
  notes,
  resolutionNotes: '',
  createdAt: '2026-08-03T15:00:00.000Z',
  updatedAt: '2026-08-03T15:30:00.000Z',
});

test('launch Home uses explicit personal records and never infers ready-to-walk from Complete or Ready', () => {
  const data = cloneSeed();
  const [firstUnit, secondUnit] = data.units.filter(
    (unit) => unit.projectId === data.activeProjectId,
  );
  assert.ok(firstUnit);
  assert.ok(secondUnit);

  data.followUpTasks = [
    followUp(
      'follow-up-ready',
      'Ready to walk',
      'Explicit personal reminder for the management walk.',
      firstUnit.id,
    ),
    followUp(
      'follow-up-generic',
      'Check completed room',
      'This wording only records completed work.',
      secondUnit.id,
    ),
  ];
  data.issues = [];

  const projection = projectLaunchAppData(data, NOW);

  assert.equal(projection.counts.readyToWalk, 1);
  assert.equal(
    projection.notifications.some((item) => item.reason === 'Check completed room'),
    false,
  );
  assert.equal(projection.propertyName, 'West Campus Student Housing');
});

test('launch notifications are limited to explicit callbacks, inspections, and conflicts', () => {
  const data = cloneSeed();
  const [firstUnit, secondUnit] = data.units.filter(
    (unit) => unit.projectId === data.activeProjectId,
  );
  assert.ok(firstUnit);
  assert.ok(secondUnit);

  data.followUpTasks = [
    followUp('follow-up-callback', 'Callback needed', 'Return with original crew.', firstUnit.id),
    followUp('follow-up-inspection', 'Inspection needed', 'Los needs to inspect.', secondUnit.id),
    followUp('follow-up-note', 'Bring sparkle bucket', 'Ordinary reminder only.', firstUnit.id),
  ];
  data.issues = [
    issue(data, 'issue-conflict', 'Crew assignment conflict', 'Duplicate assignment.', firstUnit.id),
    issue(data, 'issue-ordinary', 'Paint touch-up', 'Ordinary open issue.', secondUnit.id),
  ];

  const projection = projectLaunchAppData(data, NOW);
  const notificationIds = projection.notifications.map((item) => item.id).sort();

  assert.deepEqual(notificationIds, [
    'follow-up:follow-up-callback',
    'follow-up:follow-up-inspection',
    'issue-conflict:issue-conflict',
  ]);
  assert.equal(projection.counts.callbacks, 1);
  assert.equal(
    projection.notifications.some((item) => item.reason === 'Bring sparkle bucket'),
    false,
  );
});

test('launch projection stays scoped to the active project and marks notification reads locally', () => {
  const data = cloneSeed();
  const activeUnit = data.units.find((unit) => unit.projectId === data.activeProjectId);
  assert.ok(activeUnit);

  data.followUpTasks = [
    followUp('follow-up-active', 'Callback needed', 'Active project callback.', activeUnit.id),
  ];
  data.issues = [];
  const readIds = new Set(['follow-up:follow-up-active']);

  const projection = projectLaunchAppData(data, NOW, readIds);

  assert.equal(projection.notifications[0]?.read, true);
  assert.ok(projection.commandUnits.length > 0);
  assert.ok(
    projection.commandUnits.every((unit) =>
      typeof unit.buildingName === 'string' && typeof unit.floorName === 'string'
    ),
  );
  assert.ok(
    projection.searchGroups
      .find((group) => group.id === 'units')
      ?.results.every((result) => result.title.startsWith('Unit ')),
  );
});

test('inactive-project follow-ups cannot leak into active Home, Search, or Notifications', () => {
  const data = cloneSeed();
  const activeProject = data.projects.find((project) => project.id === data.activeProjectId);
  const activeUnit = data.units.find((unit) => unit.projectId === data.activeProjectId);
  assert.ok(activeProject);
  assert.ok(activeUnit);

  const inactiveProjectId = 'project-inactive-regression';
  const inactiveUnitId = 'unit-inactive-regression';
  data.projects.push({
    ...activeProject,
    id: inactiveProjectId,
    name: 'Inactive regression project',
    propertyName: 'Inactive property',
  });
  data.units.push({
    ...activeUnit,
    id: inactiveUnitId,
    projectId: inactiveProjectId,
    unitNumber: '9999',
  });
  data.followUpTasks = [
    followUp('follow-up-active', 'Callback needed', 'Active project callback.', activeUnit.id),
    followUp(
      'follow-up-inactive',
      'Callback needed',
      'Inactive project callback must stay out.',
      inactiveUnitId,
    ),
  ];
  data.issues = [];

  const projection = projectLaunchAppData(data, NOW);
  const serialized = JSON.stringify({
    counts: projection.counts,
    notifications: projection.notifications,
    searchGroups: projection.searchGroups,
  });

  assert.equal(projection.counts.callbacks, 1);
  assert.equal(serialized.includes('follow-up-inactive'), false);
  assert.equal(serialized.includes('Inactive project callback must stay out.'), false);
  assert.equal(serialized.includes('Unit 9999'), false);
});
