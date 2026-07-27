import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JUL28_APP_DATA_EXPECTED_RECORD_KEYS,
  JUL28_APP_DATA_INTENTIONALLY_UNMAPPED_SOURCES,
  JUL28_APP_DATA_REPOSITORY_SOURCE,
  createJul28AppDataTurnBoardRepository,
  type Jul28AppDataTurnBoardRepository,
} from '../src/features/jul28-turnboard/adapters/appDataRepository.ts';
import { JUL28_SECTIONS } from '../src/features/jul28-turnboard/model.ts';
import {
  projectJul28UnitCard,
  validateJul28SourceCoverage,
} from '../src/features/jul28-turnboard/projections.ts';
import type {
  AppData,
  Assignment,
  Building,
  CrewMember,
  Floor,
  Issue,
  Project,
  Unit,
} from '../src/types.ts';

const syntheticProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-synthetic-adapter',
  mode: 'demo',
  name: 'Synthetic adapter project',
  propertyName: 'Synthetic Test Property',
  location: 'Test-only location',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  supervisorName: 'Synthetic Supervisor',
  projectManagerName: 'Synthetic Manager',
  notes: '',
  estimatedBuildings: 1,
  estimatedUnits: 1,
  estimatedBeds: 2,
  estimatedCommonAreas: 1,
  aiBudgetUsd: 0,
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
  ...overrides,
});

const syntheticBuilding = (overrides: Partial<Building> = {}): Building => ({
  id: 'building-synthetic-adapter',
  projectId: 'project-synthetic-adapter',
  name: 'Synthetic Building',
  notes: '',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
  ...overrides,
});

const syntheticFloor = (overrides: Partial<Floor> = {}): Floor => ({
  id: 'floor-synthetic-adapter',
  buildingId: 'building-synthetic-adapter',
  name: 'Synthetic Floor',
  notes: '',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
  ...overrides,
});

const syntheticUnit = (overrides: Partial<Unit> = {}): Unit => ({
  id: 'unit-synthetic-adapter',
  projectId: 'project-synthetic-adapter',
  buildingId: 'building-synthetic-adapter',
  floorId: 'floor-synthetic-adapter',
  unitNumber: 'TEST-101',
  bedCount: 2,
  bathroomCount: 2,
  hasCommonArea: true,
  overallStatus: 'Not Started',
  paintStatus: 'Not Started',
  cleanStatus: 'Not Started',
  repairStatus: 'Not Applicable',
  flooringStatus: 'Not Applicable',
  trashStatus: 'Not Applicable',
  inspectionStatus: 'Not Started',
  assignedCrewIds: [],
  notes: '',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T09:00:00.000Z',
  ...overrides,
});

const syntheticAppData = (overrides: Partial<AppData> = {}): AppData => ({
  activeProjectId: 'project-synthetic-adapter',
  projects: [syntheticProject()],
  buildings: [syntheticBuilding()],
  floors: [syntheticFloor()],
  units: [syntheticUnit()],
  crewMembers: [],
  assignments: [],
  issues: [],
  photoNotes: [],
  dailyLogs: [],
  reportDrafts: [],
  trainingQuestions: [],
  activityLogs: [],
  draftActions: [],
  memories: [],
  memoryCandidates: [],
  agentRuns: [],
  aiUsageEvents: [],
  copilotConversations: [],
  followUpTasks: [],
  smartSuggestions: [],
  configurableStatuses: [],
  ...overrides,
});

const repositoryFrom = (data: AppData): Jul28AppDataTurnBoardRepository => {
  const result = createJul28AppDataTurnBoardRepository(data);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.error.message);
  return result.repository;
};

test('maps only active-project identity and location into a deeply read-only personal-record snapshot', () => {
  const otherProject = syntheticProject({
    id: 'project-other-synthetic',
    name: 'Other synthetic project',
  });
  const otherUnit = syntheticUnit({
    id: 'unit-other-synthetic',
    projectId: otherProject.id,
    unitNumber: 'TEST-999',
  });
  const data = syntheticAppData({
    projects: [syntheticProject(), otherProject],
    units: [syntheticUnit(), otherUnit],
  });
  const before = structuredClone(data);
  const repository = repositoryFrom(data);
  const units = repository.listUnits();
  const unit = repository.getUnit('unit-synthetic-adapter');

  assert.equal(repository.source, JUL28_APP_DATA_REPOSITORY_SOURCE);
  assert.equal(repository.sourceKind, 'personal-record');
  assert.equal(repository.sourceLabel, 'Personal Turn OS Demo Mode AppData records');
  assert.deepEqual(repository.officialBoundary, {
    recordAuthority: 'personal-turn-os-record-only',
    officialPaperAuthority: 'unchanged',
    officialSystemWriteEffect: 'none',
    approvalEffect: 'none',
    payrollEffect: 'none',
  });
  assert.equal(units.length, 1);
  assert.ok(unit);
  assert.equal(unit.id, 'unit-synthetic-adapter');
  assert.equal(unit.unitNumber, 'TEST-101');
  assert.equal(unit.unitTypeLabel, '2 beds recorded in AppData');
  assert.equal(unit.buildingLabel, 'Synthetic Building');
  assert.equal(unit.floorLabel, 'Synthetic Floor');
  assert.deepEqual(unit.sectionOrder, JUL28_SECTIONS);
  assert.deepEqual(unit.records, []);
  assert.equal(unit.adapterSource.kind, 'personal-record');
  assert.equal(unit.adapterSource.repositorySource, JUL28_APP_DATA_REPOSITORY_SOURCE);
  assert.equal(unit.adapterCoverage.state, 'identity-only-source-coverage-incomplete');
  assert.equal(unit.adapterCoverage.sourceCoverageComplete, false);
  assert.equal(repository.getUnit('unit-other-synthetic'), undefined);
  assert.equal(Object.isFrozen(units), true);
  assert.equal(Object.isFrozen(repository), true);
  assert.equal(Object.isFrozen(unit), true);
  assert.equal(Object.isFrozen(unit.sectionOrder), true);
  assert.equal(Object.isFrozen(unit.records), true);
  assert.equal(Object.isFrozen(unit.adapterSource), true);
  assert.equal(Object.isFrozen(unit.adapterCoverage), true);
  assert.equal(Object.isFrozen(unit.adapterCoverage.mappedFields), true);
  assert.throws(() => {
    (unit as unknown as { unitNumber: string }).unitNumber = 'MUTATED';
  }, TypeError);
  assert.throws(() => {
    (unit.sectionOrder as unknown as string[]).push('A');
  }, TypeError);
  assert.throws(() => {
    (unit.records as unknown as unknown[]).push({});
  }, TypeError);
  assert.equal(unit.unitNumber, 'TEST-101');
  assert.deepEqual(unit.sectionOrder, JUL28_SECTIONS);
  assert.deepEqual(unit.records, []);
  assert.deepEqual(data, before);
});

test('does not promote whole-Unit completion, assignments, issues, notes, or activity into section truth', () => {
  const crew: CrewMember = {
    id: 'crew-synthetic-paint',
    projectId: 'project-synthetic-adapter',
    name: 'Synthetic Paint Crew',
    trade: 'Painter',
    phone: '',
    company: 'Synthetic Company',
    language: '',
    assignedLocation: '',
    notes: '',
    active: true,
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: '2026-07-01T08:00:00.000Z',
  };
  const assignment: Assignment = {
    id: 'assignment-synthetic-complete',
    projectId: 'project-synthetic-adapter',
    crewMemberId: crew.id,
    teamName: 'Synthetic Paint Crew',
    trade: 'Painter',
    buildingId: 'building-synthetic-adapter',
    floorId: 'floor-synthetic-adapter',
    unitIds: ['unit-synthetic-adapter'],
    scope: 'Synthetic whole-Unit wording with no section authority',
    date: '2026-07-02',
    startTime: '08:00',
    expectedCompletion: '12:00',
    actualCompletion: '11:30',
    status: 'Complete',
    notes: 'Synthetic assignment note',
    createdAt: '2026-07-02T08:00:00.000Z',
    updatedAt: '2026-07-02T11:30:00.000Z',
  };
  const issue: Issue = {
    id: 'issue-synthetic-resolved',
    projectId: 'project-synthetic-adapter',
    unitId: 'unit-synthetic-adapter',
    title: 'Synthetic access issue',
    category: 'Access',
    priority: 'High',
    owner: 'Synthetic Owner',
    status: 'Resolved',
    dueAt: '',
    notes: 'Synthetic issue note',
    resolutionNotes: 'Synthetic resolved wording',
    createdAt: '2026-07-02T08:00:00.000Z',
    updatedAt: '2026-07-02T09:00:00.000Z',
  };
  const data = syntheticAppData({
    units: [syntheticUnit({
      overallStatus: 'Ready',
      paintStatus: 'Complete',
      cleanStatus: 'Complete',
      inspectionStatus: 'Complete',
      assignedCrewIds: [crew.id],
      notes: 'Synthetic note says everything passed.',
    })],
    crewMembers: [crew],
    assignments: [assignment],
    issues: [issue],
    activityLogs: [{
      id: 'activity-synthetic-ready',
      projectId: 'project-synthetic-adapter',
      entityType: 'Unit',
      entityId: 'unit-synthetic-adapter',
      action: 'Synthetic ready action',
      note: 'Synthetic activity wording says approved.',
      createdAt: '2026-07-02T12:00:00.000Z',
    }],
  });
  const repository = repositoryFrom(data);
  const unit = repository.listUnits()[0];
  assert.ok(unit);

  const coverage = validateJul28SourceCoverage(unit);
  const card = projectJul28UnitCard(unit, 'paint');

  assert.deepEqual(unit.records, []);
  assert.deepEqual(unit.adapterCoverage.missingRecordKeys, JUL28_APP_DATA_EXPECTED_RECORD_KEYS);
  assert.equal(unit.adapterCoverage.intentionallyUnmappedSources.includes('unit.paintStatus'), true);
  assert.equal(unit.adapterCoverage.intentionallyUnmappedSources.includes('assignments'), true);
  assert.equal(unit.adapterCoverage.intentionallyUnmappedSources.includes('issues'), true);
  assert.deepEqual(
    unit.adapterCoverage.intentionallyUnmappedSources,
    JUL28_APP_DATA_INTENTIONALLY_UNMAPPED_SOURCES,
  );
  assert.equal(coverage.complete, false);
  assert.equal(coverage.actualRecordCount, 0);
  assert.deepEqual(coverage.missingKeys, JUL28_APP_DATA_EXPECTED_RECORD_KEYS);
  assert.equal(card.attentionKind, 'source-coverage-incomplete');
  assert.equal(card.readyForMyWalkCount, null);
  assert.equal(card.tradeSummaries.paint.losPassedSectionCount, null);
  assert.equal(card.tradeSummaries.clean.losPassedSectionCount, null);
});

test('represents missing or ambiguous location links as unknown instead of selecting a candidate', () => {
  const missingRepository = repositoryFrom(syntheticAppData({
    buildings: [],
    floors: [],
  }));
  const missingUnit = missingRepository.listUnits()[0];
  assert.ok(missingUnit);
  assert.match(missingUnit.buildingLabel, /unknown/i);
  assert.match(missingUnit.floorLabel, /unknown/i);
  assert.deepEqual(missingUnit.adapterCoverage.mappingIssues, ['building-missing', 'floor-missing']);

  const ambiguousRepository = repositoryFrom(syntheticAppData({
    buildings: [
      syntheticBuilding({ name: 'First synthetic building candidate' }),
      syntheticBuilding({ name: 'Second synthetic building candidate' }),
    ],
  }));
  const ambiguousUnit = ambiguousRepository.listUnits()[0];
  assert.ok(ambiguousUnit);
  assert.match(ambiguousUnit.buildingLabel, /unknown/i);
  assert.match(ambiguousUnit.floorLabel, /unknown/i);
  assert.equal(ambiguousUnit.adapterCoverage.mappingIssues.includes('building-ambiguous'), true);
  assert.equal(ambiguousUnit.adapterCoverage.mappingIssues.includes('floor-building-unresolved'), true);
  assert.equal(ambiguousUnit.adapterCoverage.mappedFields.includes('building.name'), false);
  assert.equal(ambiguousUnit.adapterCoverage.mappedFields.includes('floor.name'), false);
});

test('does not select a Building ID duplicated across the active and another project', () => {
  const otherProject = syntheticProject({
    id: 'project-other-synthetic',
    name: 'Other synthetic project',
  });
  const repository = repositoryFrom(syntheticAppData({
    projects: [syntheticProject(), otherProject],
    buildings: [
      syntheticBuilding(),
      syntheticBuilding({
        projectId: otherProject.id,
        name: 'Cross-project duplicate Building candidate',
      }),
    ],
  }));
  const unit = repository.listUnits()[0];
  assert.ok(unit);

  assert.match(unit.buildingLabel, /unknown/i);
  assert.match(unit.floorLabel, /unknown/i);
  assert.equal(unit.adapterCoverage.mappingIssues.includes('building-ambiguous'), true);
  assert.equal(unit.adapterCoverage.mappingIssues.includes('floor-building-unresolved'), true);
  assert.equal(unit.adapterCoverage.mappedFields.includes('building.name'), false);
  assert.equal(unit.adapterCoverage.mappedFields.includes('floor.name'), false);
});

test('does not select a Floor ID duplicated under a Building in another project', () => {
  const otherProject = syntheticProject({
    id: 'project-other-synthetic',
    name: 'Other synthetic project',
  });
  const otherBuilding = syntheticBuilding({
    id: 'building-other-synthetic',
    projectId: otherProject.id,
    name: 'Other synthetic Building',
  });
  const repository = repositoryFrom(syntheticAppData({
    projects: [syntheticProject(), otherProject],
    buildings: [syntheticBuilding(), otherBuilding],
    floors: [
      syntheticFloor(),
      syntheticFloor({
        buildingId: otherBuilding.id,
        name: 'Cross-project duplicate Floor candidate',
      }),
    ],
  }));
  const unit = repository.listUnits()[0];
  assert.ok(unit);

  assert.equal(unit.buildingLabel, 'Synthetic Building');
  assert.match(unit.floorLabel, /unknown/i);
  assert.equal(unit.adapterCoverage.mappingIssues.includes('floor-ambiguous'), true);
  assert.equal(unit.adapterCoverage.mappedFields.includes('building.name'), true);
  assert.equal(unit.adapterCoverage.mappedFields.includes('floor.name'), false);
});

test('fails closed for missing or ambiguous repository identity and never returns a fallback', () => {
  const missingProject = createJul28AppDataTurnBoardRepository(syntheticAppData({
    activeProjectId: 'project-does-not-exist',
  }));
  assert.equal(missingProject.ok, false);
  if (missingProject.ok) assert.fail('Expected missing active project to fail closed');
  assert.equal(missingProject.error.code, 'active-project-not-found');
  assert.equal('repository' in missingProject, false);

  const ambiguousProject = createJul28AppDataTurnBoardRepository(syntheticAppData({
    projects: [syntheticProject(), syntheticProject({ name: 'Duplicate synthetic project' })],
  }));
  assert.equal(ambiguousProject.ok, false);
  if (ambiguousProject.ok) assert.fail('Expected duplicate active project to fail closed');
  assert.equal(ambiguousProject.error.code, 'active-project-ambiguous');
  assert.equal('repository' in ambiguousProject, false);

  const ambiguousUnitNumber = createJul28AppDataTurnBoardRepository(syntheticAppData({
    units: [
      syntheticUnit(),
      syntheticUnit({
        id: 'unit-synthetic-adapter-duplicate-number',
        unitNumber: ' test-101 ',
      }),
    ],
  }));
  assert.equal(ambiguousUnitNumber.ok, false);
  if (ambiguousUnitNumber.ok) assert.fail('Expected duplicate Unit number to fail closed');
  assert.equal(ambiguousUnitNumber.error.code, 'unit-number-ambiguous');
  assert.equal('repository' in ambiguousUnitNumber, false);
});

test('keeps Real Turn AppData labeled as a personal record rather than a synthetic repository', () => {
  const repository = repositoryFrom(syntheticAppData({
    projects: [syntheticProject({ mode: 'real' })],
  }));

  assert.equal(repository.source, 'personal-turn-os-app-data');
  assert.equal(repository.sourceKind, 'personal-record');
  assert.equal(repository.sourceLabel, 'Personal Turn OS Real Turn AppData records');
  assert.notEqual(repository.source, 'synthetic-jul28-pattern-candidate');
  assert.equal(repository.listUnits()[0]?.adapterSource.sourceLabel, repository.sourceLabel);
});
