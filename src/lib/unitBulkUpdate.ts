import type { ActivityLog, AppData, EntityId, Unit, UnitWorkflowStatus, WorkStatus } from '../types';
import { createId, nowISO } from './constants';
import { isBlockedUnit } from './metrics';
import {
  cleanCompletionPatch,
  maintenanceNeededPatch,
  paintCompletionPatch,
  unitTradesComplete,
  type ReversibleUnitPatch,
} from './actions';

export const BULK_UNIT_UPDATE_LIMIT = 500;

export const bulkUnitUpdateActions = [
  {
    id: 'paint_in_progress',
    label: 'Painting started',
    description: 'Mark paint in progress without moving blocked or later-stage Units backward.',
  },
  {
    id: 'paint_complete',
    label: 'Paint complete',
    description: 'Use the same blocker-preserving transition as the Unit card Paint action.',
  },
  {
    id: 'clean_in_progress',
    label: 'Cleaning started',
    description: 'Start cleaning only after paint is complete or not applicable.',
  },
  {
    id: 'clean_complete',
    label: 'Cleaning complete',
    description: 'Mark cleaning complete while preserving harder blockers and later stages.',
  },
  {
    id: 'repair_needed',
    label: 'Repair needed',
    description: 'Flag maintenance work without clearing access, hold, or rework blockers.',
  },
  {
    id: 'repair_in_progress',
    label: 'Repair started',
    description: 'Mark repair in progress on Units that are not currently blocked.',
  },
  {
    id: 'repair_complete',
    label: 'Repair complete',
    description: 'Complete repair and advance only when the remaining trade state supports it.',
  },
  {
    id: 'inspection_ready',
    label: 'Send to inspection',
    description: 'Only Units with paint, cleaning, and repair complete or not applicable qualify.',
  },
] as const;

export type BulkUnitUpdateActionId = (typeof bulkUnitUpdateActions)[number]['id'];

export interface BulkUnitUpdateCandidate {
  unitId: EntityId;
  unitNumber: string;
  expectedUpdatedAt: string;
  patch: ReversibleUnitPatch;
}

export interface BulkUnitUpdateSkip {
  unitId: EntityId;
  unitNumber: string;
  kind: 'missing' | 'protected' | 'unchanged';
  reason: string;
}

export interface BulkUnitUpdatePreview {
  status: 'ready' | 'empty' | 'too-many';
  projectId: EntityId;
  actionId: BulkUnitUpdateActionId;
  selectedCount: number;
  ready: BulkUnitUpdateCandidate[];
  skipped: BulkUnitUpdateSkip[];
  error?: string;
}

export interface BulkUnitUpdateApplyResult {
  data: AppData;
  status: 'applied' | 'stale-project' | 'invalid-preview' | 'nothing-to-update';
  updatedCount: number;
  skippedFromPreview: number;
  staleCount: number;
  protectedCount: number;
  unchangedCount: number;
  missingCount: number;
  skippedUnitNumbers: string[];
}

interface PatchResult {
  patch?: ReversibleUnitPatch;
  reason?: string;
}

const workDone = (status: WorkStatus) => status === 'Complete' || status === 'Not Applicable';

const laterThanPainting = new Set<UnitWorkflowStatus>([
  'Cleaning Ready',
  'Cleaning',
  'Cleaning Complete',
  'Maintenance Needed',
  'Maintenance In Progress',
  'Maintenance Complete',
  'Punch List',
  'Inspection Needed',
  'Ready',
  'Rework Needed',
]);

const laterThanCleaning = new Set<UnitWorkflowStatus>([
  'Maintenance Needed',
  'Maintenance In Progress',
  'Maintenance Complete',
  'Punch List',
  'Inspection Needed',
  'Ready',
  'Rework Needed',
]);

const repairCompletionProtected = new Set<UnitWorkflowStatus>([
  'Access Blocked',
  'Trash Out Needed',
  'Punch List',
  'Inspection Needed',
  'Ready',
  'Rework Needed',
  'Hold / Blocked',
]);

const inspectionProtected = new Set<UnitWorkflowStatus>([
  'Access Blocked',
  'Trash Out Needed',
  'Maintenance Needed',
  'Maintenance In Progress',
  'Punch List',
  'Rework Needed',
  'Hold / Blocked',
]);

const hasActiveTradeBlocker = (status: WorkStatus) =>
  status === 'Needed' || status === 'Blocked' || status === 'Rework Needed';

const repairCompletionPatch = (unit: Unit): ReversibleUnitPatch => {
  const patch: ReversibleUnitPatch = { repairStatus: 'Complete' };
  if (repairCompletionProtected.has(unit.overallStatus)) return patch;

  const next = { ...unit, repairStatus: 'Complete' as const };
  if (unitTradesComplete(next)) {
    return { ...patch, overallStatus: 'Inspection Needed', inspectionStatus: 'Ready' };
  }
  if (
    hasActiveTradeBlocker(unit.paintStatus) ||
    hasActiveTradeBlocker(unit.cleanStatus) ||
    hasActiveTradeBlocker(unit.trashStatus)
  ) {
    return patch;
  }
  if (!workDone(unit.paintStatus)) {
    return { ...patch, overallStatus: unit.paintStatus === 'In Progress' ? 'Painting' : 'Paint Ready' };
  }
  if (!workDone(unit.cleanStatus)) {
    return { ...patch, overallStatus: unit.cleanStatus === 'In Progress' ? 'Cleaning' : 'Cleaning Ready' };
  }
  return patch;
};

const patchForAction = (unit: Unit, actionId: BulkUnitUpdateActionId): PatchResult => {
  if (actionId === 'paint_in_progress') {
    if (workDone(unit.paintStatus)) return { reason: 'Paint is already complete or not applicable.' };
    if (isBlockedUnit(unit)) return { reason: 'Blocked Units must be handled individually before painting starts.' };
    if (laterThanPainting.has(unit.overallStatus)) return { reason: 'Unit is already beyond the painting stage.' };
    return { patch: { paintStatus: 'In Progress', overallStatus: 'Painting' } };
  }

  if (actionId === 'paint_complete') return { patch: paintCompletionPatch(unit) };

  if (actionId === 'clean_in_progress') {
    if (workDone(unit.cleanStatus)) return { reason: 'Cleaning is already complete or not applicable.' };
    if (isBlockedUnit(unit)) return { reason: 'Blocked Units must be handled individually before cleaning starts.' };
    if (!workDone(unit.paintStatus)) return { reason: 'Paint must be complete or not applicable before cleaning starts.' };
    if (laterThanCleaning.has(unit.overallStatus)) return { reason: 'Unit is already beyond the cleaning stage.' };
    return { patch: { cleanStatus: 'In Progress', overallStatus: 'Cleaning' } };
  }

  if (actionId === 'clean_complete') return { patch: cleanCompletionPatch(unit) };
  if (actionId === 'repair_needed') return { patch: maintenanceNeededPatch(unit) };

  if (actionId === 'repair_in_progress') {
    if (workDone(unit.repairStatus)) return { reason: 'Repair is already complete or not applicable.' };
    if (isBlockedUnit(unit)) return { reason: 'Blocked Units must be handled individually before repair starts.' };
    return { patch: { repairStatus: 'In Progress', overallStatus: 'Maintenance In Progress' } };
  }

  if (actionId === 'repair_complete') return { patch: repairCompletionPatch(unit) };

  if (unit.overallStatus === 'Ready' || unit.inspectionStatus === 'Complete') {
    return { reason: 'Inspection is already complete or the Unit is Ready.' };
  }
  if (inspectionProtected.has(unit.overallStatus)) {
    return { reason: `Resolve ${unit.overallStatus} before sending this Unit to inspection.` };
  }
  if (isBlockedUnit(unit)) return { reason: 'Blocked Units cannot be sent to inspection.' };
  if (!unitTradesComplete(unit)) return { reason: 'Paint, cleaning, and repair must be complete or not applicable.' };
  return { patch: { inspectionStatus: 'Ready', overallStatus: 'Inspection Needed' } };
};

const patchChangesUnit = (unit: Unit, patch: ReversibleUnitPatch) =>
  (Object.keys(patch) as (keyof ReversibleUnitPatch)[]).some((key) => !Object.is(unit[key], patch[key]));

const uniqueIds = (unitIds: readonly EntityId[]) => [...new Set(unitIds)];

export const createBulkUnitUpdatePreview = (
  data: AppData,
  unitIds: readonly EntityId[],
  actionId: BulkUnitUpdateActionId,
): BulkUnitUpdatePreview => {
  const ids = uniqueIds(unitIds);
  const base = {
    projectId: data.activeProjectId,
    actionId,
    selectedCount: ids.length,
    ready: [] as BulkUnitUpdateCandidate[],
    skipped: [] as BulkUnitUpdateSkip[],
  };

  if (ids.length === 0) return { ...base, status: 'empty', error: 'Select at least one Unit.' };
  if (ids.length > BULK_UNIT_UPDATE_LIMIT) {
    return {
      ...base,
      status: 'too-many',
      error: `Bulk updates are limited to ${BULK_UNIT_UPDATE_LIMIT.toLocaleString()} Units. Narrow the filters and review a smaller group.`,
    };
  }

  const unitById = new Map(data.units.map((unit) => [unit.id, unit]));
  ids.forEach((unitId) => {
    const unit = unitById.get(unitId);
    if (!unit || unit.projectId !== data.activeProjectId) {
      base.skipped.push({
        unitId,
        unitNumber: unit?.unitNumber ?? 'Unknown',
        kind: 'missing',
        reason: unit ? 'Unit belongs to another Turn.' : 'Unit is no longer available.',
      });
      return;
    }

    const result = patchForAction(unit, actionId);
    if (!result.patch) {
      base.skipped.push({
        unitId,
        unitNumber: unit.unitNumber,
        kind: 'protected',
        reason: result.reason ?? 'Unit is protected from this bulk update.',
      });
      return;
    }
    if (!patchChangesUnit(unit, result.patch)) {
      base.skipped.push({
        unitId,
        unitNumber: unit.unitNumber,
        kind: 'unchanged',
        reason: 'Unit already has this result.',
      });
      return;
    }

    base.ready.push({
      unitId,
      unitNumber: unit.unitNumber,
      expectedUpdatedAt: unit.updatedAt,
      patch: result.patch,
    });
  });

  return { ...base, status: 'ready' };
};

const nextEntityTimestamp = (previousUpdatedAt: string) => {
  const now = Date.now();
  const previous = Date.parse(previousUpdatedAt);
  return new Date(Number.isFinite(previous) ? Math.max(now, previous + 1) : now).toISOString();
};

const bulkActivity = (projectId: EntityId, unit: Unit, label: string): ActivityLog => ({
  id: createId('activity'),
  projectId,
  entityType: 'Unit',
  entityId: unit.id,
  action: 'Bulk updated unit',
  note: `Unit ${unit.unitNumber}: ${label}.`,
  createdAt: nowISO(),
});

const emptyApplyResult = (
  data: AppData,
  status: BulkUnitUpdateApplyResult['status'],
  skippedFromPreview = 0,
): BulkUnitUpdateApplyResult => ({
  data,
  status,
  updatedCount: 0,
  skippedFromPreview,
  staleCount: 0,
  protectedCount: 0,
  unchangedCount: 0,
  missingCount: 0,
  skippedUnitNumbers: [],
});

export const applyBulkUnitUpdate = (data: AppData, preview: BulkUnitUpdatePreview): BulkUnitUpdateApplyResult => {
  if (preview.status !== 'ready' || preview.ready.length === 0) {
    return emptyApplyResult(data, 'invalid-preview', preview.skipped.length);
  }
  if (preview.projectId !== data.activeProjectId) {
    return emptyApplyResult(data, 'stale-project', preview.skipped.length);
  }

  const action = bulkUnitUpdateActions.find((item) => item.id === preview.actionId);
  if (!action) return emptyApplyResult(data, 'invalid-preview', preview.skipped.length);

  const candidates = new Map(preview.ready.map((candidate) => [candidate.unitId, candidate]));
  const seen = new Set<EntityId>();
  const activityLogs: ActivityLog[] = [];
  let staleCount = 0;
  let protectedCount = 0;
  let unchangedCount = 0;
  let updatedCount = 0;
  const runtimeSkippedUnitNumbers: string[] = [];

  const units = data.units.map((unit) => {
    const candidate = candidates.get(unit.id);
    if (!candidate) return unit;
    seen.add(unit.id);

    if (unit.projectId !== data.activeProjectId || unit.updatedAt !== candidate.expectedUpdatedAt) {
      staleCount += 1;
      runtimeSkippedUnitNumbers.push(candidate.unitNumber);
      return unit;
    }

    const currentPatch = patchForAction(unit, preview.actionId);
    if (!currentPatch.patch) {
      protectedCount += 1;
      runtimeSkippedUnitNumbers.push(candidate.unitNumber);
      return unit;
    }
    if (!patchChangesUnit(unit, currentPatch.patch)) {
      unchangedCount += 1;
      runtimeSkippedUnitNumbers.push(candidate.unitNumber);
      return unit;
    }

    const updatedUnit = { ...unit, ...currentPatch.patch, updatedAt: nextEntityTimestamp(unit.updatedAt) };
    activityLogs.push(bulkActivity(unit.projectId, unit, action.label));
    updatedCount += 1;
    return updatedUnit;
  });

  const missingCount = preview.ready.length - seen.size;
  const missingUnitNumbers = preview.ready
    .filter((candidate) => !seen.has(candidate.unitId))
    .map((candidate) => candidate.unitNumber);
  const skippedUnitNumbers = [
    ...preview.skipped.map((item) => item.unitNumber),
    ...runtimeSkippedUnitNumbers,
    ...missingUnitNumbers,
  ];
  if (updatedCount === 0) {
    return {
      ...emptyApplyResult(data, 'nothing-to-update', preview.skipped.length),
      staleCount,
      protectedCount,
      unchangedCount,
      missingCount,
      skippedUnitNumbers,
    };
  }

  return {
    data: { ...data, units, activityLogs: [...activityLogs, ...data.activityLogs] },
    status: 'applied',
    updatedCount,
    skippedFromPreview: preview.skipped.length,
    staleCount,
    protectedCount,
    unchangedCount,
    missingCount,
    skippedUnitNumbers,
  };
};

export const bulkUnitUpdateSkippedCount = (result: BulkUnitUpdateApplyResult) =>
  result.skippedFromPreview + result.staleCount + result.protectedCount + result.unchangedCount + result.missingCount;
