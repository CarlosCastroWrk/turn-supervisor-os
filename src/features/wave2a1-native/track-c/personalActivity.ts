import type { ActivityLog, AppData, EntityId } from '../../../types';
import { createId, nowISO } from '../../../lib/constants';
import type { PersonalActivityViewModel } from './types';

// A note's KIND is carried in the free-form ActivityLog.action string — no new
// event type or stored-shape change (schema freeze safe). 'note' keeps the
// original action so every note ever saved still reads back as a plain note.
export type PersonalNoteKind = 'note' | 'change-order' | 'reminder' | 'texture';

export const PERSONAL_NOTE_ACTIONS: Record<PersonalNoteKind, string> = {
  note: 'Added personal note',
  'change-order': 'Added change order',
  reminder: 'Added reminder',
  texture: 'Added texture order',
};

// Back-compat alias — existing imports and saved data use this exact string.
export const PERSONAL_NOTE_ACTIVITY_ACTION = PERSONAL_NOTE_ACTIONS.note;

export const PERSONAL_NOTE_ACTION_SET: ReadonlySet<string> = new Set(
  Object.values(PERSONAL_NOTE_ACTIONS),
);

export const isPersonalNoteAction = (action: string): boolean =>
  PERSONAL_NOTE_ACTION_SET.has(action);

export const noteKindForAction = (action: string): PersonalNoteKind => {
  const match = (Object.entries(PERSONAL_NOTE_ACTIONS) as [PersonalNoteKind, string][])
    .find(([, value]) => value === action);
  return match ? match[0] : 'note';
};

export interface PersonalNoteInput {
  kind?: PersonalNoteKind;
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
    action: PERSONAL_NOTE_ACTIONS[input.kind ?? 'note'],
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

export type EditPersonalNoteResult =
  | { data: AppData; ok: true }
  | { data: AppData; error: 'empty-note' | 'missing-note'; ok: false };

// Edit only ever touches a personal note (any kind) by id — it can never
// rewrite a payroll/field event, which live in other collections entirely.
export const editPersonalNoteActivity = (
  data: AppData,
  id: EntityId,
  wording: string,
): EditPersonalNoteResult => {
  if (!wording.trim()) {
    return { data, error: 'empty-note', ok: false };
  }
  const target = data.activityLogs.find(
    (activity) => activity.id === id && isPersonalNoteAction(activity.action),
  );
  if (!target) {
    return { data, error: 'missing-note', ok: false };
  }
  return {
    data: {
      ...data,
      activityLogs: data.activityLogs.map((activity) =>
        activity.id === id ? { ...activity, note: wording } : activity),
    },
    ok: true,
  };
};

export type DeletePersonalNoteResult =
  | { data: AppData; ok: true }
  | { data: AppData; error: 'missing-note'; ok: false };

// Delete is guarded to note-kind actions so this path can only ever remove a
// note Los wrote — never a release, walk, or any other activity record.
export const deletePersonalNoteActivity = (
  data: AppData,
  id: EntityId,
): DeletePersonalNoteResult => {
  const target = data.activityLogs.find(
    (activity) => activity.id === id && isPersonalNoteAction(activity.action),
  );
  if (!target) {
    return { data, error: 'missing-note', ok: false };
  }
  return {
    data: {
      ...data,
      activityLogs: data.activityLogs.filter((activity) => activity.id !== id),
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
      isPersonalNoteAction(activity.action),
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
