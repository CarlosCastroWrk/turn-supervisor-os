import type { AppData, DraftAction } from '../types';
import { getProjectDraftActions } from './projectScope';

export type UnitTimelineSource =
  | 'unit_activity'
  | 'unit_notes'
  | 'photo'
  | 'issue'
  | 'draft_action';

export type UnitTimelineAction =
  | { kind: 'none' }
  | { kind: 'photo'; photoId: string }
  | { kind: 'open_issue'; issueId: string }
  | { kind: 'open_review'; draftId: string };

export interface UnitTimelineItem {
  id: string;
  source: UnitTimelineSource;
  timestamp: string;
  label: string;
  wording: string;
  sourceStatus?: string;
  saveLabel?: string;
  currentStateUpdatedAt?: string;
  action: UnitTimelineAction;
}

const sourcePriority: Record<UnitTimelineSource, number> = {
  photo: 0,
  issue: 1,
  draft_action: 2,
  unit_activity: 3,
  unit_notes: 4,
};

const payloadString = (draft: DraftAction, key: string) => {
  const value = draft.payload[key];
  return typeof value === 'string' ? value : '';
};

const timestampValue = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

export const projectUnitTimeline = (data: AppData, unitId: string): UnitTimelineItem[] => {
  const unit = data.units.find(
    (candidate) => candidate.id === unitId && candidate.projectId === data.activeProjectId,
  );
  if (!unit) return [];

  const activityItems: UnitTimelineItem[] = data.activityLogs
    .filter(
      (activity) =>
        activity.projectId === unit.projectId &&
        activity.entityType === 'Unit' &&
        activity.entityId === unit.id,
    )
    .map((activity) => ({
      id: `unit_activity:${activity.id}`,
      source: 'unit_activity',
      timestamp: activity.createdAt,
      label: activity.action || 'Unit activity',
      wording: activity.note || 'No additional wording was recorded.',
      saveLabel: 'Personal app record',
      action: { kind: 'none' },
    }));

  const noteItems: UnitTimelineItem[] = unit.notes.trim()
    ? [{
        id: `unit_notes:${unit.id}`,
        source: 'unit_notes',
        timestamp: unit.updatedAt,
        label: 'Current Unit notes',
        wording: unit.notes,
        sourceStatus: 'Individual note timestamps unavailable',
        saveLabel: 'Personal app record',
        action: { kind: 'none' },
      }]
    : [];

  const photoItems: UnitTimelineItem[] = data.photoNotes
    .filter((photo) => photo.projectId === unit.projectId && photo.unitId === unit.id)
    .map((photo) => ({
      id: `photo:${photo.id}`,
      source: 'photo',
      timestamp: photo.createdAt,
      label: `Photo · ${photo.category}`,
      wording: photo.caption || 'No photo caption was recorded.',
      sourceStatus: photo.category,
      saveLabel: photo.localImageAvailable === true
        ? 'Photo file available on this device'
        : 'Photo record in personal app',
      action: { kind: 'photo', photoId: photo.id },
    }));

  const issueItems: UnitTimelineItem[] = data.issues
    .filter((issue) => issue.projectId === unit.projectId && issue.unitId === unit.id)
    .map((issue) => ({
      id: `issue:${issue.id}`,
      source: 'issue',
      timestamp: issue.createdAt,
      label: issue.title,
      wording: issue.notes || issue.resolutionNotes || 'No issue wording was recorded.',
      sourceStatus: issue.status,
      saveLabel: 'Personal app record',
      currentStateUpdatedAt: issue.updatedAt,
      action: { kind: 'open_issue', issueId: issue.id },
    }));

  const draftItems: UnitTimelineItem[] = getProjectDraftActions(data, unit.projectId)
    .filter((draft) => {
      if (draft.targetEntityType === 'unit' && draft.targetEntityId === unit.id) return true;
      const unitNumber = payloadString(draft, 'unitNumber');
      return Boolean(unitNumber && unitNumber === unit.unitNumber);
    })
    .map((draft) => ({
      id: `draft_action:${draft.id}`,
      source: 'draft_action',
      timestamp: draft.status === 'applied' && draft.appliedAt ? draft.appliedAt : draft.createdAt,
      label: draft.title,
      wording: draft.summary || draft.sourceText || 'No Draft Action wording was recorded.',
      sourceStatus: draft.status,
      saveLabel: 'Personal app record',
      action: draft.status === 'pending' || draft.status === 'failed'
        ? { kind: 'open_review', draftId: draft.id }
        : { kind: 'none' },
    }));

  return [...activityItems, ...noteItems, ...photoItems, ...issueItems, ...draftItems].sort((a, b) => {
    const aTimestamp = timestampValue(a.timestamp);
    const bTimestamp = timestampValue(b.timestamp);
    if (aTimestamp !== bTimestamp) {
      if (aTimestamp === Number.NEGATIVE_INFINITY) return 1;
      if (bTimestamp === Number.NEGATIVE_INFINITY) return -1;
      return bTimestamp - aTimestamp;
    }
    const sourceDelta = sourcePriority[a.source] - sourcePriority[b.source];
    return sourceDelta === 0 ? a.id.localeCompare(b.id) : sourceDelta;
  });
};
