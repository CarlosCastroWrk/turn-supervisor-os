import type { SyncController } from './supabase/sync';
import type { AppDataSaveStatus } from './storage';
import type { AppData, AppView } from '../types';
import { getPriorityIssues, isBlockedUnit } from './metrics';
import { getProjectDraftActions, getProjectFollowUpTasks } from './projectScope';

export type TodayActionCategory =
  | 'local_save'
  | 'sync'
  | 'draft_action'
  | 'issue'
  | 'follow_up'
  | 'blocked_unit';

export interface TodayActionItem {
  id: string;
  category: TodayActionCategory;
  sourceStatus: string;
  title: string;
  detail: string;
  target: { view: AppView; recordId?: string };
}

export interface TodayProjection {
  items: TodayActionItem[];
  draftCount: number;
  issueCount: number;
  followUpCount: number;
  reliabilityCount: number;
}

type TodaySyncSnapshot = Pick<SyncController, 'message' | 'status'>;

const syncAttentionStatuses = new Set(['error', 'pending_upload', 'offline', 'cache_transition_required']);

export const buildTodayProjection = (
  data: AppData,
  saveStatus: AppDataSaveStatus,
  sync: TodaySyncSnapshot,
): TodayProjection => {
  const projectId = data.activeProjectId;
  const units = data.units.filter((unit) => unit.projectId === projectId);
  const drafts = getProjectDraftActions(data, projectId).filter(
    (draft) => draft.status === 'pending' || draft.status === 'failed',
  );
  const issues = getPriorityIssues(
    data.issues.filter(
      (issue) => issue.projectId === projectId && ['Open', 'In Progress', 'Waiting'].includes(issue.status),
    ),
  );
  const followUps = getProjectFollowUpTasks(data, projectId)
    .filter((task) => task.status === 'open' || task.status === 'in_progress')
    .sort((a, b) => {
      const weight = { Critical: 4, High: 3, Medium: 2, Low: 1 };
      const priorityDelta = weight[b.priority] - weight[a.priority];
      return priorityDelta === 0 ? b.createdAt.localeCompare(a.createdAt) : priorityDelta;
    });

  const reliabilityItems: TodayActionItem[] = [];
  if (saveStatus.state === 'failed') {
    reliabilityItems.push({
      id: 'today:local_save',
      category: 'local_save',
      sourceStatus: 'failed',
      title: 'Local save needs attention',
      detail: 'Keep the app open and review the unsaved-state recovery options.',
      target: { view: 'review' },
    });
  }
  if (syncAttentionStatuses.has(sync.status)) {
    reliabilityItems.push({
      id: `today:sync:${sync.status}`,
      category: 'sync',
      sourceStatus: sync.status,
      title: sync.status === 'offline' ? 'Working offline' : 'Sync needs attention',
      detail: sync.message,
      target: { view: 'sync' },
    });
  }

  const draftItems: TodayActionItem[] = drafts.length
    ? [{
        id: 'today:drafts',
        category: 'draft_action',
        sourceStatus: `${drafts.length} unresolved`,
        title: `${drafts.length} Draft Action${drafts.length === 1 ? '' : 's'} need review`,
        detail: 'Nothing should update your personal records until you apply an accurate draft.',
        target: { view: 'review' },
      }]
    : [];

  const issueItems: TodayActionItem[] = issues.slice(0, 4).map((issue) => {
    const unit = issue.unitId ? units.find((item) => item.id === issue.unitId) : undefined;
    return {
      id: `today:issue:${issue.id}`,
      category: 'issue',
      sourceStatus: issue.status,
      title: issue.title,
      detail: [unit ? `Unit ${unit.unitNumber}` : issue.category, issue.owner || 'No owner'].join(' · '),
      target: { view: 'issues', recordId: issue.id },
    };
  });

  const followUpItems: TodayActionItem[] = followUps.slice(0, 3).map((task) => {
    const relatedUnit = task.relatedEntityType === 'unit'
      ? units.find((unit) => unit.id === task.relatedEntityId)
      : undefined;
    const target = relatedUnit
      ? { view: 'unitDetail' as const, recordId: relatedUnit.id }
      : { view: 'review' as const };
    return {
      id: `today:follow_up:${task.id}`,
      category: 'follow_up',
      sourceStatus: task.status,
      title: task.title,
      detail: task.description || task.owner || 'Personal follow-up',
      target,
    };
  });

  const issueUnitIds = new Set(issues.map((issue) => issue.unitId).filter(Boolean));
  const blockedItems: TodayActionItem[] = units
    .filter((unit) => isBlockedUnit(unit) && !issueUnitIds.has(unit.id))
    .slice(0, 3)
    .map((unit) => ({
      id: `today:blocked_unit:${unit.id}`,
      category: 'blocked_unit',
      sourceStatus: unit.overallStatus,
      title: `Unit ${unit.unitNumber} needs a personal check`,
      detail: unit.notes || 'A blocked personal Unit state is recorded.',
      target: { view: 'unitDetail', recordId: unit.id },
    }));

  return {
    items: [...reliabilityItems, ...draftItems, ...issueItems, ...followUpItems, ...blockedItems],
    draftCount: drafts.length,
    issueCount: issues.length,
    followUpCount: followUps.length,
    reliabilityCount: reliabilityItems.length,
  };
};
