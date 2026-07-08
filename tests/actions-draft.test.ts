import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDraftAction } from '../src/lib/actions.ts';
import { seedData } from '../src/data/seed.ts';
import type { AppData, DraftAction, Unit } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const baseDraft = (patch: Partial<DraftAction> = {}): DraftAction => ({
  id: 'draft_test',
  type: 'UPDATE_UNIT_STATUS',
  title: 'Test draft',
  summary: 'Test draft summary',
  targetEntityType: 'unit',
  payload: {},
  confidence: 0.9,
  why: 'Test',
  sourceText: 'Test source',
  status: 'pending',
  createdAt: '2026-07-07T12:00:00.000Z',
  ...patch,
});

const realUnit203 = (): Unit => ({
  id: 'unit_real_203',
  projectId: 'project_real',
  buildingId: 'building_real',
  floorId: 'floor_real_2',
  unitNumber: '203',
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
  createdAt: '2026-07-07T12:00:00.000Z',
  updatedAt: '2026-07-07T12:00:00.000Z',
});

const withRealProject = () => {
  const data = cloneSeed();
  return {
    ...data,
    activeProjectId: 'project_real',
    projects: [
      {
        id: 'project_real',
        mode: 'real' as const,
        name: 'QA Real Turn',
        propertyName: 'QA Property',
        location: 'Austin, TX',
        startDate: '2026-07-07',
        endDate: '2026-07-21',
        supervisorName: 'Los',
        projectManagerName: 'Tony',
        notes: '',
        estimatedBuildings: 1,
        estimatedUnits: 1,
        estimatedBeds: 2,
        estimatedCommonAreas: 0,
        createdAt: '2026-07-07T12:00:00.000Z',
        updatedAt: '2026-07-07T12:00:00.000Z',
      },
      ...data.projects,
    ],
    units: [...data.units, realUnit203()],
    draftActions: [],
  } satisfies AppData;
};

test('applyDraftAction scopes unit-number lookup to the active project', () => {
  const data = withRealProject();
  const draft = baseDraft({
    payload: { unitNumber: '203', paintStatus: 'Blocked' },
  });
  const next = applyDraftAction({ ...data, draftActions: [draft] }, draft.id);

  const demoUnit = next.units.find((unit) => unit.id === 'unit_203');
  const realUnit = next.units.find((unit) => unit.id === 'unit_real_203');

  assert.equal(demoUnit?.paintStatus, 'Complete');
  assert.equal(demoUnit?.projectId, 'project_west_campus_turn');
  assert.equal(realUnit?.paintStatus, 'Blocked');
  assert.equal(next.draftActions[0].status, 'applied');
});

test('applyDraftAction fails invalid unit status payloads without mutating the unit', () => {
  const data = withRealProject();
  const draft = baseDraft({
    payload: { unitNumber: '203', paintStatus: 'Done' },
  });
  const next = applyDraftAction({ ...data, draftActions: [draft] }, draft.id);
  const realUnit = next.units.find((unit) => unit.id === 'unit_real_203');

  assert.equal(realUnit?.paintStatus, 'Not Started');
  assert.equal(next.draftActions[0].status, 'failed');
  assert.match(next.draftActions[0].error ?? '', /Invalid paintStatus/);
});

test('applyDraftAction fails invalid issue payload enums without creating an issue', () => {
  const data = withRealProject();
  const draft = baseDraft({
    type: 'CREATE_ISSUE',
    targetEntityType: 'unit',
    payload: {
      unitNumber: '203',
      title: 'Unit 203 has a sink leak',
      category: 'Plumbing',
      priority: 'High',
      status: 'Open',
      notes: 'Sink leak under vanity.',
    },
  });
  const next = applyDraftAction({ ...data, draftActions: [draft] }, draft.id);

  assert.equal(next.issues.length, data.issues.length);
  assert.equal(next.draftActions[0].status, 'failed');
  assert.match(next.draftActions[0].error ?? '', /Invalid category/);
});
