import type { ActivityLog, AppData } from '../types';

export const ACTIVITY_LOG_RETENTION_LIMIT = 10_000;

const PROVENANCE_ACTIVITY_TYPES = new Set<ActivityLog['entityType']>([
  'DraftAction',
  'FollowUpTask',
  'TrainingQuestion',
]);

const activityTime = (log: ActivityLog) => {
  const time = Date.parse(log.createdAt);
  return Number.isFinite(time) ? time : 0;
};

const newestActivityFirst = (left: ActivityLog, right: ActivityLog) => {
  const timeDifference = activityTime(right) - activityTime(left);
  return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
};

const protectedActivityIds = (data: AppData) => {
  const activityIds = new Set(data.activityLogs.map((log) => log.id));
  const protectedIds = new Set(
    data.activityLogs
      .filter((log) => PROVENANCE_ACTIVITY_TYPES.has(log.entityType))
      .map((log) => log.id),
  );

  [...data.memories, ...data.memoryCandidates].forEach((item) => {
    if (item.sourceEntityId && activityIds.has(item.sourceEntityId)) {
      protectedIds.add(item.sourceEntityId);
    }
  });

  return protectedIds;
};

export const applyActivityLogRetention = (data: AppData): AppData => {
  if (data.activityLogs.length <= ACTIVITY_LOG_RETENTION_LIMIT) {
    return data;
  }

  const protectedIds = protectedActivityIds(data);
  const activeProtectedLogs: ActivityLog[] = [];
  const activeOrdinaryLogs: ActivityLog[] = [];
  const protectedLogs: ActivityLog[] = [];
  const ordinaryLogs: ActivityLog[] = [];

  data.activityLogs.forEach((log) => {
    if (log.projectId === data.activeProjectId) {
      (protectedIds.has(log.id) ? activeProtectedLogs : activeOrdinaryLogs).push(log);
      return;
    }
    (protectedIds.has(log.id) ? protectedLogs : ordinaryLogs).push(log);
  });

  const retained = [
    ...activeProtectedLogs.sort(newestActivityFirst),
    ...activeOrdinaryLogs.sort(newestActivityFirst),
    ...protectedLogs.sort(newestActivityFirst),
    ...ordinaryLogs.sort(newestActivityFirst),
  ]
    .slice(0, ACTIVITY_LOG_RETENTION_LIMIT)
    .sort(newestActivityFirst);

  return {
    ...data,
    activityLogs: retained,
  };
};
