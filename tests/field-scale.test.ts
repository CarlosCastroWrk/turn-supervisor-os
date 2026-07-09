import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { addDraftActions, applyAllPendingDraftActions, createRealTurnProject } from '../src/lib/actions.ts';
import { mockAgentProvider } from '../src/lib/ai/mockAgentProvider.ts';
import { parseJsonBackup } from '../src/lib/backups.ts';
import {
  buildDailyActivitySnapshot,
  buildDailyReport,
  buildDailyReportPreview,
  buildJsonBackup,
  buildUnitsCsv,
} from '../src/lib/exporters.ts';
import { getIssuesForProject, getUnitSummary, getUnitsForProject } from '../src/lib/metrics.ts';
import type { ActivityLog, AppData, Issue, Unit } from '../src/types.ts';

const reportDate = '2026-07-09';
const activityStart = Date.parse('2026-07-09T14:00:00.000Z');

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const createScaleTurn = (floorsPerBuilding: number, unitsPerFloor: number) =>
  createRealTurnProject(cloneSeed(), {
    projectName: `QA ${floorsPerBuilding * unitsPerFloor} Unit Turn`,
    propertyName: 'QA Field Scale Property',
    location: 'Austin, TX',
    startDate: reportDate,
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
    notes: 'Disposable field-scale QA data.',
  });

const unitWithScaleStatus = (unit: Unit, index: number): Unit => {
  if (index < 500) {
    return {
      ...unit,
      overallStatus: 'Ready',
      paintStatus: 'Complete',
      cleanStatus: 'Complete',
      repairStatus: 'Complete',
      trashStatus: 'Complete',
      inspectionStatus: 'Complete',
    };
  }

  if (index < 600) {
    return { ...unit, overallStatus: 'Access Blocked', paintStatus: 'Blocked' };
  }

  if (index < 800) {
    return { ...unit, overallStatus: 'Painting', paintStatus: 'In Progress' };
  }

  if (index < 900) {
    return {
      ...unit,
      overallStatus: 'Inspection Needed',
      paintStatus: 'Complete',
      cleanStatus: 'Complete',
      repairStatus: 'Complete',
      trashStatus: 'Complete',
      inspectionStatus: 'Ready',
    };
  }

  return unit;
};

const addOperationalScale = (input: AppData) => {
  const projectId = input.activeProjectId;
  const realUnits = getUnitsForProject(input, projectId);
  const unitIndexes = new Map(realUnits.map((unit, index) => [unit.id, index]));
  const units = input.units.map((unit) => {
    const index = unitIndexes.get(unit.id);
    return index === undefined ? unit : unitWithScaleStatus(unit, index);
  });
  const blockedUnits = realUnits.slice(500, 600);
  const issues: Issue[] = blockedUnits.map((unit, index) => ({
    id: `issue_scale_${index}`,
    projectId,
    buildingId: unit.buildingId,
    floorId: unit.floorId,
    unitId: unit.id,
    title: `QA blocker for Unit ${unit.unitNumber}`,
    category: 'Access',
    priority: index < 10 ? 'Critical' : 'High',
    owner: index % 2 === 0 ? 'Los' : 'Tony',
    status: 'Open',
    dueAt: reportDate,
    notes: 'Field-scale stress record.',
    resolutionNotes: '',
    createdAt: new Date(activityStart + index * 1_000).toISOString(),
    updatedAt: new Date(activityStart + index * 1_000).toISOString(),
  }));
  const activityLogs: ActivityLog[] = Array.from({ length: 10_000 }, (_, index) => {
    const unit = realUnits[index % realUnits.length];
    return {
      id: `activity_scale_${String(index).padStart(5, '0')}`,
      projectId,
      entityType: 'Unit',
      entityId: unit.id,
      action: index % 4 === 0 ? 'Updated unit' : 'Field checkpoint',
      note: `Unit ${unit.unitNumber} operational event ${index + 1}`,
      createdAt: new Date(activityStart + index * 1_000).toISOString(),
    };
  });

  return {
    ...input,
    units,
    issues: [...issues, ...input.issues],
    activityLogs: [...activityLogs, ...input.activityLogs.filter((log) => log.projectId !== projectId)],
  } satisfies AppData;
};

test('Start Real Turn generation creates 300 unique, project-scoped units without losing Demo data', () => {
  const data = createScaleTurn(10, 30);
  const projectId = data.activeProjectId;
  const project = data.projects.find((item) => item.id === projectId);
  const units = getUnitsForProject(data, projectId);
  const buildings = data.buildings.filter((item) => item.projectId === projectId);
  const buildingIds = new Set(buildings.map((item) => item.id));
  const floors = data.floors.filter((item) => buildingIds.has(item.buildingId));

  assert.equal(project?.mode, 'real');
  assert.equal(project?.estimatedUnits, 300);
  assert.equal(buildings.length, 1);
  assert.equal(floors.length, 10);
  assert.equal(units.length, 300);
  assert.equal(new Set(units.map((unit) => unit.id)).size, 300);
  assert.equal(new Set(units.map((unit) => unit.unitNumber)).size, 300);
  assert.equal(data.projects.some((item) => item.mode === 'demo'), true);
  assert.equal(data.units.some((unit) => unit.projectId !== projectId), true);
});

test('1,000 units, 100 blockers, 500 ready units, and 10,000 events remain reportable and recoverable', () => {
  const data = addOperationalScale(createScaleTurn(20, 50));
  const projectId = data.activeProjectId;
  const project = data.projects.find((item) => item.id === projectId);
  assert.ok(project);

  const startedAt = performance.now();
  const units = getUnitsForProject(data, projectId);
  const summary = getUnitSummary(units);
  const activity = buildDailyActivitySnapshot(data, project, reportDate);
  const preview = buildDailyReportPreview(data, project, reportDate);
  const report = buildDailyReport(data, project, reportDate);
  const unitsCsv = buildUnitsCsv(units);
  const backup = buildJsonBackup(data);
  const restored = parseJsonBackup(backup);
  const elapsedMs = performance.now() - startedAt;

  assert.deepEqual(
    {
      blocked: summary.blocked,
      inProgress: summary.inProgress,
      inspection: summary.inspection,
      notStarted: summary.notStarted,
      ready: summary.ready,
      totalUnits: summary.totalUnits,
    },
    { blocked: 100, inProgress: 200, inspection: 100, notStarted: 100, ready: 500, totalUnits: 1_000 },
  );
  assert.equal(getIssuesForProject(data, projectId).length, 100);
  assert.equal(activity.total, 10_000);
  assert.match(activity.items.at(-1) ?? '', /9992 more recorded update/);
  assert.equal(preview.metrics.find((metric) => metric.label === 'Total units')?.value, '1000');
  assert.match(report, /Total units: 1000/);
  assert.match(report, /Units ready: 500/);
  assert.doesNotMatch(report, /Bathroom sink leak/);
  assert.equal(unitsCsv.split('\n').length, 1_001);
  assert.equal(restored.activeProjectId, projectId);
  assert.equal(getUnitsForProject(restored, projectId).length, 1_000);
  assert.equal(restored.activityLogs.filter((log) => log.projectId === projectId).length, 10_000);
  assert.ok(backup.length < 4_500_000, `Expected a safety margin below localStorage pressure; received ${backup.length} characters.`);
  assert.ok(elapsedMs < 5_000, `Expected scale operations under 5s; received ${elapsedMs.toFixed(1)}ms.`);
});

test('Capture still targets the correct units on a 1,000-unit Turn', async () => {
  const input = '1501 in progress 1602 sink leak 1703 paint done';
  const data = createScaleTurn(20, 50);
  const projectId = data.activeProjectId;
  const parsed = await mockAgentProvider.parseQuickCapture(input, data);

  assert.deepEqual(parsed.detectedEntities.units, ['1501', '1602', '1703']);
  assert.equal(parsed.draftActions.length, 3);

  const withDrafts = addDraftActions(data, parsed.draftActions, input, 'capture_batch_field_scale');
  const applied = applyAllPendingDraftActions(
    withDrafts,
    parsed.draftActions.map((draft) => draft.id),
  );
  const unit1501 = getUnitsForProject(applied, projectId).find((unit) => unit.unitNumber === '1501');
  const unit1703 = getUnitsForProject(applied, projectId).find((unit) => unit.unitNumber === '1703');
  const issue1602 = getIssuesForProject(applied, projectId).find((issue) =>
    issue.title.toLowerCase().includes('1602'),
  );

  assert.equal(unit1501?.overallStatus, 'Painting');
  assert.equal(unit1703?.paintStatus, 'Complete');
  assert.ok(issue1602);
  assert.equal(
    applied.draftActions
      .filter((draft) => parsed.draftActions.some((parsedDraft) => parsedDraft.id === draft.id))
      .every((draft) => draft.status === 'applied' && draft.payload.captureProjectId === projectId),
    true,
  );
});
