import {
  projectDaySessions,
  projectTodayTask,
  projectTrackCState,
} from '../wave2a2-core/appDataAdapters';
import {
  calculateTodayTaskProgress,
  getTodayTaskQueueCounts,
} from '../wave2a2-track-b/model';
import {
  projectTrackCUnitWork,
} from '../wave2a2-track-c/projections';
import { trackCWorkKey } from '../wave2a2-track-c/model';
import { compareUnitTopFloorFirst } from '../../lib/unitOrder';
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
  // Property-accepted work is DONE — it belongs to no to-do queue. Without this
  // an approved room whose crew attribution was lost (e.g. a duplicated
  // release) fell through to Needs Crew, telling Los finished units needed a
  // crew. A re-released room never reads accepted: the fresh round drops the
  // old acceptance, so it still queues normally.
  if (projection.property === 'property-accepted') return undefined;
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
    && projection.access === 'clear'
    && projection.sourceConfidence === 'confirmed'
    && !projection.assignmentConflict
    && !projection.responsibleCrewId
    // A room Los already passed is awaiting the walk, not a crew — even when
    // crew attribution is missing it must never read as unassigned work.
    && projection.inspection !== 'los-passed'
  ) {
    return 'needs-crew';
  }
  if (
    projection.release === 'released'
    && projection.responsibleCrewId
    && (
      projection.execution === 'crew-reported-complete'
      || projection.inspection === 'needs-los-inspection'
    )
    && projection.inspection !== 'los-passed'
  ) {
    return 'needs-inspection';
  }
  if (
    projection.release === 'released'
    && projection.responsibleCrewId
    && (
      projection.execution === 'assigned'
      || projection.execution === 'working'
    )
  ) {
    return 'working';
  }
  return undefined;
};

const waitingReasonsForWork = (
  projection: CanonicalWorkRecord['projection'],
) => {
  const reasons: string[] = [];
  if (projection.sourceConfidence !== 'confirmed') {
    reasons.push('Assignment-source evidence needs review');
  }
  if (projection.access !== 'clear') {
    reasons.push(projection.restrictionLabel?.trim() || 'Access is restricted');
  }
  if (projection.assignmentConflict) {
    reasons.push('Assignment responsibility conflicts');
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
    compareUnitTopFloorFirst(left.unitNumber, right.unitNumber)
    || left.trade.localeCompare(right.trade)
    || left.target.section.localeCompare(right.target.section));

// Ready-to-walk is a UNIT+TRADE package, never a lone room. A room only stays
// in ready-to-walk when EVERY released room of its unit+trade is Los-passed and
// pending the walk. If a sibling room has an open callback, the whole unit
// belongs in Callbacks (Los's rule: one bad room pulls the unit until every
// room is confirmed again); if a sibling just isn't inspected yet, the passed
// room simply waits with no queue — the unit surfaces through the sibling's own
// queue. Without this, a unit with one callback room showed in Callbacks AND
// Ready to walk at the same time.
const enforceWalkPackageGrain = (
  records: readonly CanonicalWorkRecord[],
): CanonicalWorkRecord[] => {
  const packageReady = new Map<string, boolean>();
  const packageCallback = new Map<string, boolean>();
  for (const record of records) {
    if (record.projection.release !== 'released') continue;
    const key = `${record.target.unitId}:${record.trade}`;
    const ready = record.projection.inspection === 'los-passed'
      && record.projection.property === 'pending-property-walk';
    packageReady.set(key, (packageReady.get(key) ?? true) && ready);
    packageCallback.set(
      key,
      (packageCallback.get(key) ?? false) || record.projection.callbackOpen,
    );
  }
  return records.map((record) => {
    if (record.queue !== 'ready-to-walk') return record;
    const key = `${record.target.unitId}:${record.trade}`;
    if (packageReady.get(key)) return record;
    return {
      ...record,
      queue: packageCallback.get(key) ? 'callbacks' as const : undefined,
    };
  });
};

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
  const workRecords = enforceWalkPackageGrain(canonicalWorkRecords(input));
  const queues = {
    'needs-crew': workRecords.filter((record) => record.queue === 'needs-crew'),
    'needs-inspection': workRecords.filter((record) => record.queue === 'needs-inspection'),
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
    'needs-crew': queues['needs-crew'].length,
    'needs-inspection': queues['needs-inspection'].length,
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
      queueCounts: getTodayTaskQueueCounts(input.todayTask),
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
