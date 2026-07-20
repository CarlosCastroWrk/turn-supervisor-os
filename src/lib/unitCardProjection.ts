import { getProjectDraftActions, getProjectFollowUpTasks } from './projectScope';
import type { AppData, Issue, Unit } from '../types';

export interface UnitCardProjection {
  unitId: string;
  unitNumber: string;
  personalState: string;
  attentionCount: number;
  noteCount: 0 | 1;
  photoCount: number;
  criticalWarning?: string;
  updatedAt: string;
}

const openIssueStatuses = new Set<Issue['status']>(['Open', 'In Progress', 'Waiting']);
const issuePriorityWeight: Record<Issue['priority'], number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const draftTargetsUnit = (draft: AppData['draftActions'][number], unit: Unit) => {
  if (draft.targetEntityType === 'unit' && draft.targetEntityId === unit.id) return true;
  const unitNumber = draft.payload.unitNumber;
  return typeof unitNumber === 'string' && unitNumber === unit.unitNumber;
};

const latestTimestamp = (timestamps: string[], fallback: string) =>
  timestamps.filter(Boolean).sort().slice(-1)[0] ?? fallback;

export function projectUnitCards(data: AppData, units: Unit[]): UnitCardProjection[] {
  const projectId = data.activeProjectId;
  const projectDrafts = getProjectDraftActions(data, projectId);
  const projectFollowUps = getProjectFollowUpTasks(data, projectId);

  return units.map((unit) => {
    const issues = data.issues
      .filter((issue) => issue.projectId === projectId && issue.unitId === unit.id && openIssueStatuses.has(issue.status))
      .sort((a, b) => {
        const priorityDelta = issuePriorityWeight[b.priority] - issuePriorityWeight[a.priority];
        return priorityDelta || b.updatedAt.localeCompare(a.updatedAt);
      });
    const drafts = projectDrafts.filter(
      (draft) => (draft.status === 'pending' || draft.status === 'failed') && draftTargetsUnit(draft, unit),
    );
    const followUps = projectFollowUps.filter(
      (task) =>
        (task.status === 'open' || task.status === 'in_progress') &&
        task.relatedEntityType === 'unit' &&
        task.relatedEntityId === unit.id,
    );
    const photos = data.photoNotes.filter((photo) => photo.projectId === projectId && photo.unitId === unit.id);
    const blockedState = unit.overallStatus.includes('Blocked') ? unit.overallStatus : undefined;

    return {
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      personalState: unit.overallStatus,
      attentionCount: issues.length + drafts.length + followUps.length,
      noteCount: unit.notes.trim() ? 1 : 0,
      photoCount: photos.length,
      criticalWarning: issues[0]?.title ?? blockedState,
      updatedAt: latestTimestamp(
        [unit.updatedAt, ...issues.map((issue) => issue.updatedAt), ...drafts.map((draft) => draft.createdAt), ...photos.map((photo) => photo.updatedAt), ...followUps.map((task) => task.createdAt)],
        unit.updatedAt,
      ),
    };
  });
}
