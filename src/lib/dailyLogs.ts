import type { DailyLog } from '../types';
import { nowISO } from './constants';
import { compareSyncRows } from './supabase/syncCore';

const DAILY_LOG_KEY_SEPARATOR = '\u001f';

export const dailyLogKey = (projectId: string, date: string) => `${projectId}${DAILY_LOG_KEY_SEPARATOR}${date}`;

export const buildDailyLogId = (projectId: string, date: string) => `daily:${projectId}:${date}`;

export const createEmptyDailyLog = (projectId: string, date: string, stamp = nowISO()): DailyLog => ({
  id: buildDailyLogId(projectId, date),
  projectId,
  date,
  morningPlan: '',
  middayUpdate: '',
  endOfDayReflection: '',
  completedSummary: '',
  blockers: '',
  lessons: '',
  tomorrowPriorities: '',
  createdAt: stamp,
  updatedAt: stamp,
});

const comparableDailyLog = (log: DailyLog): DailyLog => ({
  ...log,
  id: buildDailyLogId(log.projectId, log.date),
});

export const compareDailyLogVersions = (left: DailyLog, right: DailyLog) =>
  compareSyncRows(comparableDailyLog(left), comparableDailyLog(right));

const newestDailyLog = (logs: DailyLog[]) =>
  logs.reduce<DailyLog | undefined>((winner, candidate) => {
    if (!winner) {
      return candidate;
    }
    const comparison = compareDailyLogVersions(candidate, winner);
    if (comparison > 0 || (comparison === 0 && candidate.id < winner.id)) {
      return candidate;
    }
    return winner;
  }, undefined);

const groupDailyLogs = (logs: DailyLog[]) => {
  const groups = new Map<string, DailyLog[]>();
  logs.forEach((log) => {
    const key = dailyLogKey(log.projectId, log.date);
    const group = groups.get(key);
    if (group) {
      group.push(log);
    } else {
      groups.set(key, [log]);
    }
  });
  return groups;
};

export const findDailyLog = (logs: DailyLog[], projectId: string, date: string) =>
  newestDailyLog(logs.filter((log) => log.projectId === projectId && log.date === date));

export const reconcileDailyLogs = (localLogs: DailyLog[], remoteLogs: DailyLog[]) => {
  const localGroups = groupDailyLogs(localLogs);
  const remoteGroups = groupDailyLogs(remoteLogs);
  const keys = new Set([...localGroups.keys(), ...remoteGroups.keys()]);
  const reconciled: DailyLog[] = [];

  keys.forEach((key) => {
    const local = localGroups.get(key) ?? [];
    const remote = remoteGroups.get(key) ?? [];
    const winner = newestDailyLog([...local, ...remote]);
    if (!winner) {
      return;
    }

    const remoteIdentity = newestDailyLog(remote);
    reconciled.push(
      remoteIdentity
        ? {
            ...winner,
            id: remoteIdentity.id,
            createdAt: remoteIdentity.createdAt,
          }
        : winner,
    );
  });

  return reconciled.sort((left, right) => {
    const versionDifference = compareDailyLogVersions(right, left);
    return versionDifference === 0 ? left.id.localeCompare(right.id) : versionDifference;
  });
};
