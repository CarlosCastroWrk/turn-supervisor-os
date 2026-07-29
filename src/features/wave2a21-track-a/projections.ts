import {
  projectDaySessions,
  projectTodayTask,
  projectTrackCState,
} from '../wave2a2-core/appDataAdapters';
import {
  calculateTodayTaskProgress,
  getTodayTaskQueueCounts,
} from '../wave2a2-track-b/model';
import { projectTrackCCrewSummaries } from '../wave2a2-track-c/projections';
import { adaptDurableFieldEventsToActivity } from './activity';
import type {
  AppData,
} from '../../types';
import type {
  CanonicalFieldProjection,
  CanonicalFieldProjectionInput,
} from './contracts';

export function buildCanonicalFieldProjection(
  input: CanonicalFieldProjectionInput,
): CanonicalFieldProjection {
  if (input.trackCState.propertyId !== input.projectId) {
    throw new Error('Field Operations state does not match the requested project.');
  }
  if (input.todayTask && input.todayTask.propertyId !== input.projectId) {
    throw new Error('Today’s Task does not match the requested project.');
  }
  if (
    input.todayTask?.daySessionId
    && input.activeDaySessionId
    && input.todayTask.daySessionId !== input.activeDaySessionId
  ) {
    throw new Error('Today’s Task does not match the active Day Session.');
  }

  const queueCounts = getTodayTaskQueueCounts(input.todayTask);
  const currentDayEvents = input.activeDaySessionId
    ? input.fieldEvents.filter((event) =>
      event.projectId === input.projectId
      && event.daySessionId === input.activeDaySessionId)
    : [];
  const unitsTouched = new Set(
    currentDayEvents
      .map((event) => event.unitId)
      .filter((unitId): unitId is string => Boolean(unitId)),
  ).size;
  const crewSummaries = projectTrackCCrewSummaries(input.trackCState);

  return {
    activity: adaptDurableFieldEventsToActivity({
      accountId: input.accountId,
      fieldEvents: input.fieldEvents,
      projectId: input.projectId,
    }),
    boundaries: {
      officialApprovalMutated: false,
      paperTurnBoardAuthoritative: true,
      payrollCalculated: false,
    },
    counts: {
      callbacks: queueCounts.callbacks,
      ready: queueCounts['ready-to-walk'],
      unitsTouched,
      waiting: queueCounts.waiting,
      working: queueCounts.working,
    },
    grains: {
      activity: 'events',
      crewCurrentWork: 'section-trades',
      queues: 'sections',
      todayTaskProgress: 'sections',
      unitsTouched: 'units',
    },
    crewCurrentWork: crewSummaries
      .filter((summary) => summary.stats.currentAssignments > 0)
      .map((summary) => ({
        callbacks: summary.stats.openCallbacks,
        crewId: summary.crew.id,
        crewName: summary.crew.name,
        currentAssignments: summary.stats.currentAssignments,
        trade: summary.crew.trade,
        waiting: summary.stats.waiting,
      }))
      .sort((left, right) =>
        left.trade.localeCompare(right.trade)
        || left.crewName.localeCompare(right.crewName)),
    daySessionId: input.activeDaySessionId,
    projectId: input.projectId,
    todayTask: {
      progress: calculateTodayTaskProgress(input.todayTask),
      queueCounts,
      task: input.todayTask,
    },
  };
}

const ACTIVE_DAY_STATUSES = new Set(['active', 'ending', 'reopened']);

export function buildCanonicalFieldProjectionFromAppData(
  data: Readonly<AppData>,
  accountId: string,
): CanonicalFieldProjection {
  const compatibleData = data as AppData;
  const activeSessions = projectDaySessions(compatibleData, accountId)
    .filter((session) => ACTIVE_DAY_STATUSES.has(session.status));
  if (activeSessions.length > 1) {
    throw new Error('Canonical field projection requires at most one active Day Session.');
  }
  const activeSession = activeSessions[0];
  return buildCanonicalFieldProjection({
    accountId,
    activeDaySessionId: activeSession?.daySessionId,
    fieldEvents: data.fieldEvents,
    projectId: data.activeProjectId,
    todayTask: projectTodayTask(compatibleData, activeSession),
    trackCState: projectTrackCState(compatibleData),
  });
}
