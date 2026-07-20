import type { SyncController } from './supabase/sync';
import type { AppDataSaveStatus } from './storage';
import type { AppData, AppView, DraftAction } from '../types';
import { localISODateFromDateTime, todayISO } from './constants';
import { getPriorityIssues } from './metrics';
import {
  getProjectAgentRuns,
  getProjectDraftActions,
  getProjectFollowUpTasks,
} from './projectScope';

export type ReviewCategory =
  | 'draft_action'
  | 'issue'
  | 'follow_up'
  | 'local_save'
  | 'sync'
  | 'capture_diagnostic';

export interface ReviewTarget {
  view: AppView;
  recordId?: string;
}

export interface ReviewProjectionItem {
  id: string;
  sourceId?: string;
  category: ReviewCategory;
  sourceStatus: string;
  title: string;
  detail: string;
  timestamp?: string;
  target?: ReviewTarget;
  actionKind: 'review' | 'open' | 'retry_save' | 'open_sync' | 'none';
}

export type ReviewSyncSnapshot = Pick<SyncController, 'message' | 'status'>;

const activeIssueStatuses = new Set(['Open', 'In Progress', 'Waiting']);
const activeFollowUpStatuses = new Set(['open', 'in_progress']);
const reviewSyncStatuses = new Set(['error', 'pending_upload', 'offline', 'cache_transition_required']);

const payloadString = (draft: DraftAction, key: string) => {
  const value = draft.payload[key];
  return typeof value === 'string' ? value : '';
};

export const draftReviewTargetLabel = (data: AppData, draft: DraftAction) => {
  const targetUnit = data.units.find((unit) => unit.id === draft.targetEntityId);
  const unitNumber = targetUnit?.unitNumber || payloadString(draft, 'unitNumber');
  if (unitNumber) return `Unit ${unitNumber}`;
  if (draft.targetEntityType === 'issue') return 'Issues';
  if (draft.targetEntityType === 'assignment' || draft.targetEntityType === 'crew') return 'Assignments';
  if (draft.targetEntityType === 'dailyLog') return 'Daily Log';
  return draft.targetEntityType;
};

export const resolveDraftReviewTarget = (data: AppData, draft: DraftAction): ReviewTarget | undefined => {
  const unitNumber = payloadString(draft, 'unitNumber');
  const unitId =
    (draft.targetEntityType === 'unit' ? draft.targetEntityId : undefined) ??
    data.units.find(
      (unit) => unit.projectId === data.activeProjectId && unitNumber && unit.unitNumber === unitNumber,
    )?.id;

  if (unitId) return { view: 'unitDetail', recordId: unitId };
  if (draft.type === 'CREATE_ISSUE' || draft.type === 'UPDATE_ISSUE') return { view: 'issues' };
  if (draft.type === 'CREATE_ASSIGNMENT' || draft.type === 'UPDATE_ASSIGNMENT') return { view: 'assignments' };
  if (draft.type === 'ADD_DAILY_LOG_ENTRY') return { view: 'daily' };
  return undefined;
};

export const buildReviewProjection = (
  data: AppData,
  saveStatus: AppDataSaveStatus,
  sync: ReviewSyncSnapshot,
): ReviewProjectionItem[] => {
  const projectId = data.activeProjectId;
  const unitsById = new Map(
    data.units.filter((unit) => unit.projectId === projectId).map((unit) => [unit.id, unit]),
  );
  const issuesById = new Map(
    data.issues.filter((issue) => issue.projectId === projectId).map((issue) => [issue.id, issue]),
  );

  const drafts: ReviewProjectionItem[] = getProjectDraftActions(data, projectId)
    .filter((draft) => draft.status === 'pending' || draft.status === 'failed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((draft) => ({
      id: `draft_action:${draft.id}`,
      sourceId: draft.id,
      category: 'draft_action',
      sourceStatus: draft.status,
      title: draft.title,
      detail: draft.summary || draft.sourceText,
      timestamp: draft.createdAt,
      target: { view: 'review', recordId: draft.id },
      actionKind: 'review',
    }));

  const issues: ReviewProjectionItem[] = getPriorityIssues(
    data.issues.filter((issue) => issue.projectId === projectId && activeIssueStatuses.has(issue.status)),
  ).map((issue) => {
    const unit = issue.unitId ? unitsById.get(issue.unitId) : undefined;
    return {
      id: `issue:${issue.id}`,
      sourceId: issue.id,
      category: 'issue',
      sourceStatus: issue.status,
      title: issue.title,
      detail: [unit ? `Unit ${unit.unitNumber}` : '', issue.notes].filter(Boolean).join(' · '),
      timestamp: issue.updatedAt,
      target: { view: 'issues', recordId: issue.id },
      actionKind: 'open',
    };
  });

  const followUps: ReviewProjectionItem[] = getProjectFollowUpTasks(data, projectId)
    .filter((task) => activeFollowUpStatuses.has(task.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((task) => {
      let target: ReviewTarget | undefined;
      if (task.relatedEntityType === 'unit' && task.relatedEntityId && unitsById.has(task.relatedEntityId)) {
        target = { view: 'unitDetail', recordId: task.relatedEntityId };
      }
      if (task.relatedEntityType === 'issue' && task.relatedEntityId && issuesById.has(task.relatedEntityId)) {
        target = { view: 'issues', recordId: task.relatedEntityId };
      }
      return {
        id: `follow_up:${task.id}`,
        sourceId: task.id,
        category: 'follow_up',
        sourceStatus: task.status,
        title: task.title,
        detail: task.description || [task.owner, task.dueAt].filter(Boolean).join(' · '),
        timestamp: task.createdAt,
        target,
        actionKind: target ? 'open' : 'none',
      };
    });

  const localSave: ReviewProjectionItem[] = saveStatus.state === 'failed'
    ? [{
        id: 'local_save:failed',
        category: 'local_save',
        sourceStatus: 'failed',
        title: 'Changes are not saved on this device',
        detail: saveStatus.canRetry
          ? 'The latest in-memory changes are waiting for another local save attempt.'
          : 'The last local save failed. Review device storage or open Data & backup.',
        actionKind: saveStatus.canRetry ? 'retry_save' : 'none',
      }]
    : [];

  const syncItems: ReviewProjectionItem[] = reviewSyncStatuses.has(sync.status)
    ? [{
        id: `sync:${sync.status}`,
        category: 'sync',
        sourceStatus: sync.status,
        title: sync.status === 'offline' ? 'Device is offline' : 'Sync needs review',
        detail: sync.message,
        target: { view: 'sync' },
        actionKind: 'open_sync',
      }]
    : [];

  const captureDiagnostics: ReviewProjectionItem[] = getProjectAgentRuns(data, projectId)
    .filter(
      (run) =>
        run.mode === 'quick_capture' &&
        run.status === 'failed' &&
        localISODateFromDateTime(run.createdAt) === todayISO(),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((run) => ({
      id: `capture_diagnostic:${run.id}`,
      sourceId: run.id,
      category: 'capture_diagnostic',
      sourceStatus: run.status,
      title: 'Capture did not complete',
      detail: run.error || 'The failed capture is recorded for diagnostic review. No production change was applied.',
      timestamp: run.createdAt,
      actionKind: 'none',
    }));

  return [...drafts, ...issues, ...followUps, ...localSave, ...syncItems, ...captureDiagnostics];
};
