import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { createRealTurnProject } from '../src/lib/actions.ts';
import { getUnitsForProject } from '../src/lib/metrics.ts';
import {
  applyBulkUnitUpdate,
  BULK_UNIT_UPDATE_LIMIT,
  bulkUnitUpdateActions,
  bulkUnitUpdateSkippedCount,
  createBulkUnitUpdatePreview,
} from '../src/lib/unitBulkUpdate.ts';
import type { AppData, Unit } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const createTurn = (floorsPerBuilding = 1, unitsPerFloor = 6) =>
  createRealTurnProject(cloneSeed(), {
    projectName: 'Bulk Update QA Turn',
    propertyName: 'Bulk Update QA Property',
    location: 'Austin, TX',
    startDate: '2026-07-09',
    endDate: '2026-07-23',
    supervisorName: 'Los',
    projectManagerName: 'Tony',
    buildingNames: ['Building A'],
    buildingCount: 1,
    floorsPerBuilding,
    unitsPerFloor,
    firstUnitNumber: 101,
    bedCount: 2,
    bathroomCount: 1,
    hasCommonArea: false,
    notes: 'Disposable bulk-update test data.',
  });

const patchUnits = (data: AppData, patches: Record<string, Partial<Unit>>): AppData => ({
  ...data,
  units: data.units.map((unit) => (patches[unit.unitNumber] ? { ...unit, ...patches[unit.unitNumber] } : unit)),
});

test('bulk preview stays inside the active project and never exposes a Ready action', () => {
  const data = createTurn();
  const realUnit = getUnitsForProject(data, data.activeProjectId)[0];
  const demoUnit = data.units.find((unit) => unit.projectId !== data.activeProjectId);
  assert.ok(realUnit);
  assert.ok(demoUnit);
  assert.equal(bulkUnitUpdateActions.some((action) => /ready/i.test(action.label)), false);

  const preview = createBulkUnitUpdatePreview(data, [realUnit.id, demoUnit.id], 'paint_complete');
  assert.equal(preview.status, 'ready');
  assert.equal(preview.selectedCount, 2);
  assert.deepEqual(preview.ready.map((candidate) => candidate.unitId), [realUnit.id]);
  assert.equal(preview.skipped.length, 1);
  assert.match(preview.skipped[0].reason, /another Turn/);

  const applied = applyBulkUnitUpdate(data, preview);
  assert.equal(applied.status, 'applied');
  assert.equal(applied.updatedCount, 1);
  assert.equal(applied.data.units.find((unit) => unit.id === realUnit.id)?.paintStatus, 'Complete');
  assert.deepEqual(applied.data.units.find((unit) => unit.id === demoUnit.id), demoUnit);
});

test('bulk preview rejects more than 500 unique Units before evaluating any patch', () => {
  const data = createTurn(11, 50);
  const units = getUnitsForProject(data, data.activeProjectId);
  assert.equal(units.length, 550);

  const preview = createBulkUnitUpdatePreview(
    data,
    units.slice(0, BULK_UNIT_UPDATE_LIMIT + 1).map((unit) => unit.id),
    'paint_complete',
  );

  assert.equal(preview.status, 'too-many');
  assert.equal(preview.ready.length, 0);
  assert.match(preview.error ?? '', /limited to 500 Units/);
  assert.equal(applyBulkUnitUpdate(data, preview).status, 'invalid-preview');
});

test('start actions skip blocked, completed, and out-of-sequence Units', () => {
  let data = createTurn();
  const units = getUnitsForProject(data, data.activeProjectId);
  data = patchUnits(data, {
    [units[1].unitNumber]: { overallStatus: 'Access Blocked', paintStatus: 'Blocked' },
    [units[2].unitNumber]: { overallStatus: 'Paint Complete', paintStatus: 'Complete' },
    [units[3].unitNumber]: { overallStatus: 'Paint Ready', paintStatus: 'Not Started' },
    [units[4].unitNumber]: { overallStatus: 'Cleaning Ready', paintStatus: 'Complete', cleanStatus: 'Not Started' },
  });
  const current = getUnitsForProject(data, data.activeProjectId);

  const paintPreview = createBulkUnitUpdatePreview(
    data,
    current.slice(0, 3).map((unit) => unit.id),
    'paint_in_progress',
  );
  assert.equal(paintPreview.ready.length, 1);
  assert.equal(paintPreview.skipped.length, 2);
  assert.deepEqual(paintPreview.ready[0].patch, { paintStatus: 'In Progress', overallStatus: 'Painting' });

  const cleanPreview = createBulkUnitUpdatePreview(
    data,
    [current[3].id, current[4].id],
    'clean_in_progress',
  );
  assert.equal(cleanPreview.ready.length, 1);
  assert.equal(cleanPreview.ready[0].unitId, current[4].id);
  assert.match(cleanPreview.skipped[0].reason, /Paint must be complete/);
});

test('send to inspection skips unfinished work and never marks a Unit Ready', () => {
  let data = createTurn();
  const units = getUnitsForProject(data, data.activeProjectId);
  data = patchUnits(data, {
    [units[0].unitNumber]: {
      overallStatus: 'Maintenance Complete',
      paintStatus: 'Complete',
      cleanStatus: 'Complete',
      repairStatus: 'Complete',
    },
    [units[1].unitNumber]: {
      overallStatus: 'Cleaning',
      paintStatus: 'Complete',
      cleanStatus: 'In Progress',
      repairStatus: 'Complete',
    },
    [units[2].unitNumber]: {
      overallStatus: 'Rework Needed',
      paintStatus: 'Complete',
      cleanStatus: 'Complete',
      repairStatus: 'Complete',
    },
  });
  const current = getUnitsForProject(data, data.activeProjectId);
  const preview = createBulkUnitUpdatePreview(data, [current[0].id, current[1].id, current[2].id], 'inspection_ready');

  assert.equal(preview.ready.length, 1);
  assert.equal(preview.skipped.length, 2);
  assert.match(preview.skipped.find((item) => item.unitId === current[2].id)?.reason ?? '', /Resolve Rework Needed/);
  const result = applyBulkUnitUpdate(data, preview);
  const updated = result.data.units.find((unit) => unit.id === current[0].id);
  assert.equal(updated?.overallStatus, 'Inspection Needed');
  assert.equal(updated?.inspectionStatus, 'Ready');
  assert.notEqual(updated?.overallStatus, 'Ready');
});

test('apply skips a Unit changed after preview instead of overwriting newer work', () => {
  const data = createTurn();
  const units = getUnitsForProject(data, data.activeProjectId);
  const preview = createBulkUnitUpdatePreview(data, [units[0].id, units[1].id], 'paint_complete');
  const newerTimestamp = new Date(Date.parse(units[1].updatedAt) + 60_000).toISOString();
  const changed = {
    ...data,
    units: data.units.map((unit) =>
      unit.id === units[1].id ? { ...unit, notes: 'Newer device note.', updatedAt: newerTimestamp } : unit,
    ),
  };

  const result = applyBulkUnitUpdate(changed, preview);
  assert.equal(result.status, 'applied');
  assert.equal(result.updatedCount, 1);
  assert.equal(result.staleCount, 1);
  assert.equal(bulkUnitUpdateSkippedCount(result), 1);
  assert.deepEqual(result.skippedUnitNumbers, [units[1].unitNumber]);
  assert.equal(result.data.units.find((unit) => unit.id === units[0].id)?.paintStatus, 'Complete');
  assert.equal(result.data.units.find((unit) => unit.id === units[1].id)?.paintStatus, 'Not Started');
  assert.equal(result.data.units.find((unit) => unit.id === units[1].id)?.notes, 'Newer device note.');
  assert.equal(result.data.activityLogs.filter((log) => log.action === 'Bulk updated unit').length, 1);
});

test('project changes fail the whole reviewed batch closed', () => {
  const data = createTurn();
  const unit = getUnitsForProject(data, data.activeProjectId)[0];
  const preview = createBulkUnitUpdatePreview(data, [unit.id], 'repair_needed');
  const demoProject = data.projects.find((project) => project.id !== data.activeProjectId);
  assert.ok(demoProject);

  const switched = { ...data, activeProjectId: demoProject.id };
  const result = applyBulkUnitUpdate(switched, preview);
  assert.equal(result.status, 'stale-project');
  assert.equal(result.data, switched);
  assert.equal(result.updatedCount, 0);
});

test('500 selected Units update in one transaction with one factual Activity entry each', () => {
  const data = createTurn(10, 50);
  const units = getUnitsForProject(data, data.activeProjectId);
  const startedAt = performance.now();
  const preview = createBulkUnitUpdatePreview(
    data,
    units.map((unit) => unit.id),
    'paint_complete',
  );
  const result = applyBulkUnitUpdate(data, preview);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(preview.ready.length, 500);
  assert.equal(result.status, 'applied');
  assert.equal(result.updatedCount, 500);
  assert.equal(result.data.units.filter((unit) => unit.projectId === data.activeProjectId && unit.paintStatus === 'Complete').length, 500);
  assert.equal(result.data.units.filter((unit) => unit.projectId === data.activeProjectId && unit.overallStatus === 'Ready').length, 0);
  assert.equal(result.data.activityLogs.filter((log) => log.action === 'Bulk updated unit').length, 500);
  assert.ok(elapsedMs < 1_000, `Expected a 500-Unit transaction under 1s; received ${elapsedMs.toFixed(1)}ms.`);
});
