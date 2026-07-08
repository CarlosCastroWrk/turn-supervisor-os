import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { archiveProject, restoreProject, switchActiveProject } from '../src/lib/actions.ts';
import { normalizeAppData } from '../src/lib/dataMigrations.ts';
import type { AppData, Project, Unit } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const realProject = (id: string, patch: Partial<Project> = {}): Project => ({
  id,
  mode: 'real',
  name: `QA ${id}`,
  propertyName: 'QA Property',
  location: 'Austin, TX',
  startDate: '2026-07-08',
  endDate: '2026-07-22',
  supervisorName: 'Los',
  projectManagerName: 'Tony',
  notes: '',
  estimatedBuildings: 1,
  estimatedUnits: 1,
  estimatedBeds: 2,
  estimatedCommonAreas: 0,
  createdAt: '2026-07-08T12:00:00.000Z',
  updatedAt: '2026-07-08T12:00:00.000Z',
  ...patch,
});

const realUnit = (projectId: string): Unit => ({
  id: `unit_${projectId}`,
  projectId,
  buildingId: `building_${projectId}`,
  floorId: `floor_${projectId}`,
  unitNumber: '101',
  bedCount: 2,
  bathroomCount: 1,
  hasCommonArea: false,
  overallStatus: 'Not Started',
  paintStatus: 'Not Started',
  cleanStatus: 'Not Started',
  repairStatus: 'Not Started',
  flooringStatus: 'Not Applicable',
  trashStatus: 'Not Started',
  inspectionStatus: 'Not Started',
  assignedCrewIds: [],
  notes: '',
  createdAt: '2026-07-08T12:00:00.000Z',
  updatedAt: '2026-07-08T12:00:00.000Z',
});

const withRealProjects = () => {
  const data = cloneSeed();
  return {
    ...data,
    activeProjectId: 'project_real_a',
    projects: [realProject('project_real_a'), realProject('project_real_b'), ...data.projects],
    units: [realUnit('project_real_a'), realUnit('project_real_b'), ...data.units],
    activityLogs: [],
  } satisfies AppData;
};

test('archiveProject hides a non-active real project without deleting its records', () => {
  const data = withRealProjects();
  const next = archiveProject(data, 'project_real_b');
  const archivedProject = next.projects.find((project) => project.id === 'project_real_b');

  assert.equal(next.activeProjectId, 'project_real_a');
  assert.ok(archivedProject?.archivedAt);
  assert.equal(next.projects.length, data.projects.length);
  assert.equal(next.units.filter((unit) => unit.projectId === 'project_real_b').length, 1);
});

test('archiveProject switches away when the active real project is archived', () => {
  const data = withRealProjects();
  const next = archiveProject(data, 'project_real_a');

  assert.equal(next.activeProjectId, 'project_real_b');
  assert.ok(next.projects.find((project) => project.id === 'project_real_a')?.archivedAt);
});

test('archiveProject falls back to Demo Mode when no visible real project remains', () => {
  const data = {
    ...withRealProjects(),
    projects: [realProject('project_real_a'), ...cloneSeed().projects],
    units: [realUnit('project_real_a'), ...cloneSeed().units],
  } satisfies AppData;
  const next = archiveProject(data, 'project_real_a');

  assert.equal(next.activeProjectId, 'project_west_campus_turn');
});

test('switchActiveProject ignores archived projects until they are restored', () => {
  const data = archiveProject(withRealProjects(), 'project_real_b');
  const ignored = switchActiveProject(data, 'project_real_b');
  const restored = restoreProject(data, 'project_real_b');
  const switched = switchActiveProject(restored, 'project_real_b');

  assert.equal(ignored.activeProjectId, 'project_real_a');
  assert.equal(restored.projects.find((project) => project.id === 'project_real_b')?.archivedAt, undefined);
  assert.equal(switched.activeProjectId, 'project_real_b');
});

test('normalizeAppData does not keep an archived project active after sync or reload', () => {
  const data = withRealProjects();
  const normalized = normalizeAppData({
    ...data,
    activeProjectId: 'project_real_a',
    projects: [
      realProject('project_real_a', { archivedAt: '2026-07-08T13:00:00.000Z', updatedAt: '2026-07-08T13:00:00.000Z' }),
      realProject('project_real_b'),
      ...cloneSeed().projects,
    ],
  });

  assert.equal(normalized.activeProjectId, 'project_real_b');
});
