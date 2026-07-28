import type { ActivityLog, AppData, EntityId } from '../../../types';
import { createId, nowISO } from '../../../lib/constants';
import type { PersonalActivityViewModel } from './types';

export const PERSONAL_NOTE_ACTIVITY_ACTION = 'Added personal note';

export interface PersonalNoteInput {
  unitId?: EntityId;
  wording: string;
}

interface PersonalNoteDependencies {
  createActivityId?: () => EntityId;
  now?: () => string;
}

export type AppendPersonalNoteResult =
  | {
      activity: ActivityLog;
      data: AppData;
      ok: true;
    }
  | {
      data: AppData;
      error: 'empty-note' | 'missing-project' | 'missing-unit';
      ok: false;
    };

export const appendPersonalNoteActivity = (
  data: AppData,
  input: PersonalNoteInput,
  dependencies: PersonalNoteDependencies = {},
): AppendPersonalNoteResult => {
  if (!input.wording.trim()) {
    return { data, error: 'empty-note', ok: false };
  }

  const project = data.projects.find((candidate) => candidate.id === data.activeProjectId);
  if (!project) {
    return { data, error: 'missing-project', ok: false };
  }

  const unit = input.unitId
    ? data.units.find(
        (candidate) =>
          candidate.id === input.unitId &&
          candidate.projectId === project.id,
      )
    : undefined;
  if (input.unitId && !unit) {
    return { data, error: 'missing-unit', ok: false };
  }

  const activity: ActivityLog = {
    id: (dependencies.createActivityId ?? (() => createId('activity')))(),
    projectId: project.id,
    entityType: unit ? 'Unit' : 'Project',
    entityId: unit?.id ?? project.id,
    action: PERSONAL_NOTE_ACTIVITY_ACTION,
    note: input.wording,
    createdAt: (dependencies.now ?? nowISO)(),
  };

  return {
    activity,
    data: {
      ...data,
      activityLogs: [activity, ...data.activityLogs],
    },
    ok: true,
  };
};

export const projectPersonalNoteActivity = (
  data: AppData,
  projectId: EntityId = data.activeProjectId,
) =>
  data.activityLogs.filter(
    (activity) =>
      activity.projectId === projectId &&
      activity.action === PERSONAL_NOTE_ACTIVITY_ACTION,
  );

export const projectUnitPersonalNoteHistory = (
  data: AppData,
  unitId: EntityId,
) => {
  const unit = data.units.find(
    (candidate) =>
      candidate.id === unitId &&
      candidate.projectId === data.activeProjectId,
  );
  if (!unit) return [];

  return projectPersonalNoteActivity(data, unit.projectId).filter(
    (activity) =>
      activity.entityType === 'Unit' &&
      activity.entityId === unit.id,
  );
};

export const projectPersonalActivityViewModel = (
  data: AppData,
  activity: ActivityLog,
): PersonalActivityViewModel => {
  const project = data.projects.find((candidate) => candidate.id === activity.projectId);
  const unit =
    activity.entityType === 'Unit'
      ? data.units.find(
          (candidate) =>
            candidate.id === activity.entityId &&
            candidate.projectId === activity.projectId,
        )
      : undefined;

  return {
    activity,
    projectLabel: project?.propertyName || project?.name || 'Current project',
    unitId: unit?.id,
    unitNumber: unit?.unitNumber,
  };
};
