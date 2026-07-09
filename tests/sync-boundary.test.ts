import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { filterUploadableSyncItems, withLocalDemoRows } from '../src/lib/supabase/syncBoundary.ts';
import type {
  ActivityLog,
  AppData,
  Assignment,
  Building,
  CrewMember,
  DailyLog,
  Floor,
  Issue,
  PhotoNote,
  Project,
  ReportDocumentDraft,
  Unit,
} from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const stamp = '2026-07-08T12:00:00.000Z';

const realProject = (id = 'project_real_boundary'): Project => ({
  id,
  mode: 'real',
  name: 'Boundary Real Turn',
  propertyName: 'Boundary Property',
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
  createdAt: stamp,
  updatedAt: stamp,
});

const realBuilding = (projectId: string): Building => ({
  id: 'building_real_boundary',
  projectId,
  name: 'Real Building',
  notes: '',
  createdAt: stamp,
  updatedAt: stamp,
});

const realFloor = (buildingId: string): Floor => ({
  id: 'floor_real_boundary',
  buildingId,
  name: 'Real Floor',
  notes: '',
  createdAt: stamp,
  updatedAt: stamp,
});

const realUnit = (projectId: string, buildingId: string, floorId: string): Unit => ({
  id: 'unit_real_boundary',
  projectId,
  buildingId,
  floorId,
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
  createdAt: stamp,
  updatedAt: stamp,
});

const realCrew = (projectId: string): CrewMember => ({
  id: 'crew_real_boundary',
  projectId,
  name: 'Real Crew',
  trade: 'Paint',
  phone: '',
  company: '',
  language: '',
  assignedLocation: '',
  notes: '',
  active: true,
  createdAt: stamp,
  updatedAt: stamp,
});

const realAssignment = (projectId: string, unitId: string): Assignment => ({
  id: 'assignment_real_boundary',
  projectId,
  crewMemberId: 'crew_real_boundary',
  teamName: 'Real Crew',
  trade: 'Paint',
  buildingId: 'building_real_boundary',
  floorId: 'floor_real_boundary',
  unitIds: [unitId],
  scope: 'Paint real unit',
  date: '2026-07-08',
  startTime: '',
  expectedCompletion: '',
  actualCompletion: '',
  status: 'Planned',
  notes: '',
  createdAt: stamp,
  updatedAt: stamp,
});

const realIssue = (projectId: string, unitId: string): Issue => ({
  id: 'issue_real_boundary',
  projectId,
  buildingId: 'building_real_boundary',
  floorId: 'floor_real_boundary',
  unitId,
  title: 'Real issue',
  category: 'Maintenance',
  priority: 'High',
  owner: 'Los',
  status: 'Open',
  dueAt: '',
  notes: '',
  resolutionNotes: '',
  createdAt: stamp,
  updatedAt: stamp,
});

const realPhoto = (projectId: string, unitId: string): PhotoNote => ({
  id: 'photo_real_boundary',
  projectId,
  buildingId: 'building_real_boundary',
  floorId: 'floor_real_boundary',
  unitId,
  category: 'Progress',
  caption: 'Real photo metadata',
  createdAt: stamp,
  updatedAt: stamp,
});

const realDailyLog = (projectId: string): DailyLog => ({
  id: 'daily_real_boundary',
  projectId,
  date: '2026-07-08',
  morningPlan: '',
  middayUpdate: '',
  endOfDayReflection: '',
  completedSummary: '',
  blockers: '',
  lessons: '',
  tomorrowPriorities: '',
  createdAt: stamp,
  updatedAt: stamp,
});

const reportDraft = (projectId: string, id = 'report_real_boundary'): ReportDocumentDraft => ({
  id,
  projectId,
  date: '2026-07-08',
  title: 'Edited Turn Report',
  titleEdited: true,
  summary: 'Edited field summary',
  summaryEdited: true,
  sections: [
    {
      title: 'Open Issues',
      subtitle: 'Needs attention',
      body: 'Unit 203 waiting on paint',
      bodyEdited: true,
    },
  ],
  createdAt: stamp,
  updatedAt: stamp,
});

const realActivity = (projectId: string): ActivityLog => ({
  id: 'activity_real_boundary',
  projectId,
  entityType: 'Project',
  entityId: projectId,
  action: 'Real activity',
  note: '',
  createdAt: stamp,
});

const withRealTree = () => {
  const data = cloneSeed();
  const project = realProject();
  const building = realBuilding(project.id);
  const floor = realFloor(building.id);
  const unit = realUnit(project.id, building.id, floor.id);

  return {
    ...data,
    activeProjectId: project.id,
    projects: [project, ...data.projects],
    buildings: [building, ...data.buildings],
    floors: [floor, ...data.floors],
    units: [unit, ...data.units],
    crewMembers: [realCrew(project.id), ...data.crewMembers],
    assignments: [realAssignment(project.id, unit.id), ...data.assignments],
    issues: [realIssue(project.id, unit.id), ...data.issues],
    photoNotes: [realPhoto(project.id, unit.id), ...data.photoNotes],
    dailyLogs: [realDailyLog(project.id), ...data.dailyLogs],
    reportDrafts: [reportDraft(project.id), ...data.reportDrafts],
    activityLogs: [realActivity(project.id), ...data.activityLogs],
  } satisfies AppData;
};

test('filterUploadableSyncItems keeps real projects and skips demo projects', () => {
  const data = withRealTree();
  const uploadable = filterUploadableSyncItems(data, 'projects', data.projects);

  assert.equal(uploadable.some((project) => project.id === 'project_real_boundary'), true);
  assert.equal(uploadable.some((project) => project.mode === 'demo'), false);
});

test('filterUploadableSyncItems skips demo-scoped child records and keeps real child records', () => {
  const data = withRealTree();

  assert.deepEqual(filterUploadableSyncItems(data, 'buildings', data.buildings).map((item) => item.id), ['building_real_boundary']);
  assert.deepEqual(filterUploadableSyncItems(data, 'floors', data.floors).map((item) => item.id), ['floor_real_boundary']);
  assert.deepEqual(filterUploadableSyncItems(data, 'units', data.units).map((item) => item.id), ['unit_real_boundary']);
  assert.deepEqual(filterUploadableSyncItems(data, 'crewMembers', data.crewMembers).map((item) => item.id), ['crew_real_boundary']);
  assert.deepEqual(filterUploadableSyncItems(data, 'assignments', data.assignments).map((item) => item.id), ['assignment_real_boundary']);
  assert.deepEqual(filterUploadableSyncItems(data, 'issues', data.issues).map((item) => item.id), ['issue_real_boundary']);
  assert.deepEqual(filterUploadableSyncItems(data, 'photoNotes', data.photoNotes).map((item) => item.id), ['photo_real_boundary']);
  assert.deepEqual(filterUploadableSyncItems(data, 'dailyLogs', data.dailyLogs).map((item) => item.id), ['daily_real_boundary']);
  assert.deepEqual(filterUploadableSyncItems(data, 'reportDrafts', data.reportDrafts).map((item) => item.id), ['report_real_boundary']);
  assert.deepEqual(filterUploadableSyncItems(data, 'activityLogs', data.activityLogs).map((item) => item.id), ['activity_real_boundary']);
});

test('withLocalDemoRows preserves local demo rows when a fresh device pulls real cloud rows', () => {
  const local = cloneSeed();
  const demoReportDraft = reportDraft(local.projects[0].id, 'report_demo_boundary');
  local.reportDrafts = [demoReportDraft];
  const project = realProject();
  const remote = {
    projects: [project],
    units: [realUnit(project.id, 'building_real_boundary', 'floor_real_boundary')],
    reportDrafts: [reportDraft(project.id)],
  };

  const next = withLocalDemoRows(local, remote);

  assert.equal((next.projects as Project[]).some((item) => item.id === project.id), true);
  assert.equal((next.projects as Project[]).some((item) => item.mode === 'demo'), true);
  assert.equal((next.units as Unit[]).some((item) => item.projectId === local.projects[0].id), true);
  assert.equal((next.reportDrafts as ReportDocumentDraft[]).some((item) => item.id === demoReportDraft.id), true);
});

test('withLocalDemoRows does not duplicate a demo row that already exists remotely', () => {
  const local = cloneSeed();
  const remoteDemoProject = { ...local.projects[0], name: 'Cloud Demo Copy' };

  const next = withLocalDemoRows(local, { projects: [remoteDemoProject] });
  const demoProjects = (next.projects as Project[]).filter((project) => project.id === local.projects[0].id);

  assert.equal(demoProjects.length, 1);
  assert.equal(demoProjects[0].name, 'Cloud Demo Copy');
});
