import {
  projectDaySessions,
  projectTodayTask,
  projectTrackCState,
} from '../wave2a2-core/appDataAdapters';
import {
  calculateTodayTaskProgress,
} from '../wave2a2-track-b/model';
import {
  projectTrackCUnitWork,
} from '../wave2a2-track-c/projections';
import { trackCWorkKey } from '../wave2a2-track-c/model';
import {
  adaptDurableFieldEventsToActivity,
  adaptLegacyActivityLogsToActivity,
} from './activity';
import type {
  AppData,
} from '../../types';
import type {
  CanonicalFieldProjection,
  CanonicalFieldProjectionInput,
  CanonicalWorkQueueId,
  CanonicalWorkRecord,
} from './contracts';

const canonicalQueueForWork = (
  record: Omit<CanonicalWorkRecord, 'queue'>,
): CanonicalWorkQueueId | undefined => {
  const { projection } = record;
  if (projection.callbackOpen) return 'callbacks';
  if (
    projection.release === 'released'
    && projection.access === 'clear'
    && projection.sourceConfidence === 'confirmed'
    && !projection.assignmentConflict
    && projection.responsibleCrewId
    && projection.inspection === 'los-passed'
    && projection.property === 'pending-property-walk'
  ) {
    return 'ready-to-walk';
  }
  if (record.waitingReasons.length > 0) return 'waiting';
  if (
    projection.release === 'released'
    && projection.responsibleCrewId
    && (projection.execution === 'assigned' || projection.execution === 'working')
  ) {
    return 'working';
  }
  return undefined;
};

const waitingReasonsForWork = (
  projection: CanonicalWorkRecord['projection'],
) => {
  const reasons: string[] = [];
  if (projection.release !== 'released') {
    reasons.push(
      projection.release === 'unreleased'
        ? 'Not in the confirmed release'
        : 'Release evidence needs review',
    );
  }
  if (projection.sourceConfidence !== 'confirmed') {
    reasons.push('Assignment-source evidence needs review');
  }
  if (projection.access !== 'clear') {
    reasons.push(projection.restrictionLabel?.trim() || 'Access is restricted');
  }
  if (projection.assignmentConflict) {
    reasons.push('Assignment responsibility conflicts');
  } else if (!projection.responsibleCrewId) {
    reasons.push('No confirmed responsible crew');
  }
  if (projection.inspection === 'needs-los-inspection') {
    reasons.push('Ready for Los inspection');
  }
  if (projection.inspection === 'reinspection-pending') {
    reasons.push('Reinspection is pending');
  }
  return [...new Set(reasons)];
};

const canonicalWorkRecords = (
  input: CanonicalFieldProjectionInput,
): readonly CanonicalWorkRecord[] => input.trackCState.units.flatMap((unit) =>
  projectTrackCUnitWork(input.trackCState, unit.id)
    .filter((projection) =>
      projection.release !== 'unreleased'
      || projection.confirmedEventCount > 0)
    .map((projection) => {
      const crew = projection.responsibleCrewId
        ? input.trackCState.crews.find(
          (candidate) => candidate.id === projection.responsibleCrewId,
        )
        : undefined;
      const base: Omit<CanonicalWorkRecord, 'queue'> = {
        crewId: crew?.id,
        crewName: crew?.name,
        id: trackCWorkKey(projection),
        locationLabel: unit.locationLabel,
        projection,
        target: {
          section: projection.section,
          trade: projection.trade,
          unitId: projection.unitId,
        },
        trade: projection.trade,
        unitNumber: unit.unitNumber,
        unitType: unit.unitType,
        waitingReasons: waitingReasonsForWork(projection),
      };
      return {
        ...base,
        queue: canonicalQueueForWork(base),
      };
    }))
  .sort((left, right) =>
    left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true })
    || left.trade.localeCompare(right.trade)
    || left.target.section.localeCompare(right.target.section));

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
  const workRecords = canonicalWorkRecords(input);
  const queues = {
    callbacks: workRecords.filter((record) => record.queue === 'callbacks'),
    'ready-to-walk': workRecords.filter((record) => record.queue === 'ready-to-walk'),
    waiting: workRecords.filter((record) => record.queue === 'waiting'),
    working: workRecords.filter((record) => record.queue === 'working'),
  } satisfies CanonicalFieldProjection['queues'];
  const activity = adaptDurableFieldEventsToActivity({
    accountId: input.accountId,
    fieldEvents: input.fieldEvents,
    projectId: input.projectId,
  });
  const releasedWork = workRecords.filter(
    (record) => record.projection.release === 'released',
  );
  const assignmentConflicts = workRecords.filter(
    (record) => record.projection.assignmentConflict,
  );
  const walkCandidates = queues['ready-to-walk'];
  const queueCounts = {
    callbacks: queues.callbacks.length,
    'ready-to-walk': queues['ready-to-walk'].length,
    waiting: queues.waiting.length,
    working: queues.working.length,
  };

  return {
    activity,
    assignmentConflicts,
    boundaries: {
      officialApprovalMutated: false,
      paperTurnBoardAuthoritative: true,
      payrollCalculated: false,
    },
    counts: {
      activity: activity.length,
      callbacks: queueCounts.callbacks,
      ready: queueCounts['ready-to-walk'],
      unitsTouched,
      waiting: queueCounts.waiting,
      working: queueCounts.working,
    },
    grains: {
      activity: 'events',
      crewCurrentWork: 'section-trades',
      queues: 'section-trades',
      todayTaskProgress: 'sections',
      unitsTouched: 'units',
    },
    crewCurrentWork: input.trackCState.crews
      .map((crew) => {
        const crewWork = workRecords.filter((record) => record.crewId === crew.id);
        return {
          callbacks: crewWork.filter((record) => record.queue === 'callbacks').length,
          crewId: crew.id,
          crewName: crew.name,
          currentAssignments: crewWork.filter(
            (record) => record.projection.property !== 'property-accepted',
          ).length,
          trade: crew.trade,
          waiting: crewWork.filter((record) => record.queue === 'waiting').length,
        };
      })
      .filter((summary) => summary.currentAssignments > 0)
      .sort((left, right) =>
        left.trade.localeCompare(right.trade)
        || left.crewName.localeCompare(right.crewName)),
    daySessionId: input.activeDaySessionId,
    projectId: input.projectId,
    queues,
    releasedWork,
    todayTask: {
      progress: calculateTodayTaskProgress(input.todayTask),
      queueCounts,
      task: input.todayTask,
    },
    trackCState: input.trackCState,
    walkCandidates,
    workRecords,
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
  const projection = buildCanonicalFieldProjection({
    accountId,
    activeDaySessionId: activeSession?.daySessionId,
    fieldEvents: data.fieldEvents,
    projectId: data.activeProjectId,
    todayTask: projectTodayTask(compatibleData, activeSession),
    trackCState: projectTrackCState(compatibleData),
  });
  const activity = [
    ...projection.activity,
    ...adaptLegacyActivityLogsToActivity({
      accountId,
      activityLogs: data.activityLogs,
      projectId: data.activeProjectId,
    }),
  ].sort((left, right) =>
    right.recordedAt.localeCompare(left.recordedAt)
    || left.sourceEventId.localeCompare(right.sourceEventId));

  return {
    ...projection,
    activity,
    counts: {
      ...projection.counts,
      activity: activity.length,
    },
  };
}
