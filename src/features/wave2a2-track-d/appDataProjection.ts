import type { AppData } from '../../types';
import {
  projectLegacyActivityRecord,
  type TrackDActivityRecord,
  type TrackDLegacyActivityContext,
} from './model';
import type { TrackDUnitOption } from './DirectNotePhoto';
import type { TrackDProfileSummary } from './OperationalTools';

export function selectTrackDUnitOptions(data: AppData): TrackDUnitOption[] {
  return data.units
    .filter((unit) => unit.projectId === data.activeProjectId)
    .map((unit) => ({
      id: unit.id,
      unitNumber: unit.unitNumber,
    }))
    .sort((left, right) =>
      left.unitNumber.localeCompare(right.unitNumber, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    );
}

export function selectTrackDProfileSummary(data: AppData): TrackDProfileSummary {
  const project = data.projects.find(
    (candidate) => candidate.id === data.activeProjectId,
  );
  return {
    name: project?.supervisorName?.trim() || 'Los',
    currentProperty:
      project?.propertyName?.trim() || project?.name?.trim() || 'Not recorded',
    role: 'Turn Supervisor',
  };
}

export function projectTrackDActivityFromAppData(
  data: AppData,
  contextByActivityId: Readonly<
    Record<string, TrackDLegacyActivityContext | undefined>
  > = {},
): TrackDActivityRecord[] {
  const units = new Map(
    data.units
      .filter((unit) => unit.projectId === data.activeProjectId)
      .map((unit) => [unit.id, unit]),
  );
  const photos = new Map(
    data.photoNotes
      .filter((photo) => photo.projectId === data.activeProjectId)
      .map((photo) => [photo.id, photo]),
  );

  return data.activityLogs
    .filter((activity) => activity.projectId === data.activeProjectId)
    .map((activity) => {
      const suppliedContext = contextByActivityId[activity.id] ?? {};
      const directUnit =
        activity.entityType === 'Unit' ? units.get(activity.entityId) : undefined;
      const photo =
        activity.entityType === 'PhotoNote'
          ? photos.get(activity.entityId)
          : undefined;
      const photoUnit = photo?.unitId ? units.get(photo.unitId) : undefined;
      const unit = directUnit ?? photoUnit;
      return projectLegacyActivityRecord(activity, {
        ...suppliedContext,
        ...(unit && !suppliedContext.unitId ? { unitId: unit.id } : {}),
        ...(unit && !suppliedContext.unitNumber
          ? { unitNumber: unit.unitNumber }
          : {}),
      });
    });
}
