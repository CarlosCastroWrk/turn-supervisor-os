import type {
  AppData,
  DailyReleaseBatch as AppDailyReleaseBatch,
  DailyReleaseItem,
  FieldEvent,
  FieldSection,
  FieldTrade,
  WalkSession as AppWalkSession,
} from '../../types';
import {
  createTodayTask,
  createTodayTaskGoal,
  projectTodayTaskForSession,
} from '../wave2a2-track-b/model';
import type {
  DailyReleaseBatch,
  DaySession,
  DaySessionEvent,
  PropertyRoster,
  TodayTask,
} from '../wave2a2-track-b/types';
import {
  DEFAULT_TRACK_C_TERMINOLOGY,
  TRACK_C_SECTIONS,
  TRACK_C_TRADES,
  trackCWorkKey,
  type TrackCConfirmedEvent,
  type TrackCSection,
  type TrackCState,
  type TrackCWalkOutcomeRecord,
  type TrackCWalkSession,
  type TrackCWorkTarget,
  type TrackCEventType,
  type TrackCWalkSelectionReview,
} from '../wave2a2-track-c/model';
import { projectTrackCWork } from '../wave2a2-track-c/projections';
import type { TrackCWalkDraft } from '../wave2a2-track-c/phase2WalkWorkflow';

const CONTEXT_EVENT_TYPES = {
  assignmentEvidence: 'day-assignment-evidence-reviewed',
  walkthroughSchedule: 'day-walkthrough-schedule-recorded',
  workingHours: 'day-working-hours-recorded',
} as const;

const TRACK_C_EVENT_TYPES = new Set<TrackCEventType>([
  'assignment-confirmed',
  'assignment-cleared',
  'work-started',
  'crew-reported-complete',
  'los-passed',
  'callback-opened',
  'callback-correction-reported',
  'callback-resolved',
  'property-accepted',
  'property-correction-requested',
  'walk-not-walked',
  'walk-deferred',
  'personal-pds-mirror-recorded',
  'paper-reviewed',
]);

const WALK_REVIEW_NOTE_PREFIX = 'turn-os-track-c-review-v1:';
const WALK_STATE_NOTE_PREFIX = 'turn-os-track-c-walk-v2:';
const hardRestrictionPattern =
  /\b(do not enter|occupied|renewal|access|key|blocked|maintenance|repair)\b/iu;
const occupiedRestrictionPattern = /\b(do not enter|occupied|renewal)\b/iu;
const maintenanceRestrictionPattern = /\b(maintenance|repair)\b/iu;

const unique = <T,>(values: readonly T[]) => [...new Set(values)];
const byRecordedAt = <T extends { recordedAt: string }>(left: T, right: T) =>
  left.recordedAt.localeCompare(right.recordedAt);
const byRecordedAtAndId = <T extends { id: string; recordedAt: string }>(
  left: T,
  right: T,
) => byRecordedAt(left, right) || left.id.localeCompare(right.id);

const sectionLabel = (section: FieldSection) =>
  section === 'common' ? 'Common' : section;

const rosterSections = (bedCount: number, hasCommonArea: boolean) => {
  const bedroomCount = Math.max(0, Math.min(5, Math.trunc(bedCount)));
  const bedroomSections = TRACK_C_SECTIONS.slice(1, bedroomCount + 1);
  return [
    ...(hasCommonArea ? ['common' as const] : []),
    ...bedroomSections,
  ];
};

const projectForData = (data: AppData) =>
  data.projects.find((project) => project.id === data.activeProjectId);

export const currentLocalDate = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export function projectPropertyRoster(data: AppData): PropertyRoster {
  const project = projectForData(data);
  const buildingById = new Map(data.buildings.map((building) => [building.id, building.name]));
  const floorById = new Map(data.floors.map((floor) => [floor.id, floor.name]));
  return {
    propertyId: data.activeProjectId,
    propertyName: project?.propertyName || project?.name || 'Current property',
    sourceReference: 'Existing personal Turn OS roster',
    units: data.units
      .filter((unit) => unit.projectId === data.activeProjectId)
      .sort((left, right) =>
        left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }))
      .map((unit) => ({
        applicableSections: rosterSections(unit.bedCount, unit.hasCommonArea).map((section) => ({
          id: section,
          label: sectionLabel(section),
          trades: ['Paint', 'Clean'] as const,
        })),
        building: buildingById.get(unit.buildingId),
        floor: floorById.get(unit.floorId),
        id: unit.id,
        propertyId: unit.projectId,
        unitNumber: unit.unitNumber,
        unitType: unit.bedCount === 0 ? 'Studio' : `${unit.bedCount}BR`,
      })),
  };
}

export function projectDailyReleases(data: AppData): readonly DailyReleaseBatch[] {
  return data.dailyReleaseBatches
    .filter((batch) => batch.projectId === data.activeProjectId)
    .map((batch) => {
      const entries = new Map<string, {
        restrictions: string[];
        sectionId: string;
        trades: Array<'Paint' | 'Clean'>;
        uncertainties: string[];
        unitId: string;
      }>();
      batch.items.forEach((item) => {
        const key = `${item.unitId}:${item.section}`;
        const current = entries.get(key) ?? {
          restrictions: [],
          sectionId: item.section,
          trades: [],
          uncertainties: [],
          unitId: item.unitId,
        };
        current.trades.push(item.trade === 'paint' ? 'Paint' : 'Clean');
        if (item.restriction?.trim()) current.restrictions.push(item.restriction.trim());
        entries.set(key, current);
      });
      const uncertainties = [...batch.uncertainties];
      return {
        confirmedAt: batch.confirmedAt,
        confirmedBy: batch.confirmedBy,
        confirmationStatus: batch.status === 'confirmed'
          ? 'confirmed'
          : batch.status === 'draft'
            ? 'draft'
            : 'rejected',
        date: batch.date,
        entries: [...entries.values()].map((entry) => ({
          ...entry,
          restrictions: unique(entry.restrictions),
          trades: unique(entry.trades),
          uncertainties,
        })),
        id: batch.id,
        originalSourceReference: batch.localSourceReference ?? batch.sourceLabel,
        propertyContact: batch.propertyContact,
        propertyId: batch.projectId,
      };
    });
}

const contextWording = (
  data: AppData,
  daySessionId: string,
  eventType: string,
  fallback: string,
) => data.fieldEvents
  .filter((event) =>
    event.daySessionId === daySessionId && event.eventType === eventType)
  .sort(byRecordedAt)
  .slice(-1)[0]?.summary ?? fallback;

export function projectDaySessions(
  data: AppData,
  accountId: string,
): readonly DaySession[] {
  const roster = projectPropertyRoster(data);
  const releases = projectDailyReleases(data);
  return data.daySessions
    .filter((session) => session.projectId === data.activeProjectId)
    .map((session): DaySession => {
      const selectedReleases = releases.filter((release) =>
        session.releaseBatchIds.includes(release.id));
      let task: TodayTask | null = null;
      try {
        task = createTodayTask(roster, selectedReleases, session.date, session.id);
      } catch {
        task = null;
      }
      return {
        accountId,
        activeCrewIds: unique([
          ...session.activePaintCrewIds,
          ...session.activeCleanCrewIds,
        ]),
        activeCrewIdsByTrade: {
          Clean: [...session.activeCleanCrewIds],
          Paint: [...session.activePaintCrewIds],
        },
        assignmentEvidenceReviewNote: contextWording(
          data,
          session.id,
          CONTEXT_EVENT_TYPES.assignmentEvidence,
          'Not recorded in this personal app.',
        ),
        closedAt: session.endedAt,
        date: session.date,
        daySessionId: session.id,
        endKeyStatus: session.endKeyStatus,
        endNote: session.endNote,
        goal: task
          ? createTodayTaskGoal(task)
          : {
              metric: 'sections',
              milestone: 'los-inspected',
              scope: 'today-confirmed-release',
              target: 0,
            },
        keyStatus: session.keyStatus,
        morningNote: session.morningNote || undefined,
        propertyCheckIn: session.propertyCheckInNote,
        propertyContact: session.propertyContact,
        propertyId: session.projectId,
        propertyReviewStatus: session.paperReviewConfirmedAt ? 'reviewed' : 'not-reviewed',
        releaseBatchIds: [...session.releaseBatchIds],
        reopenedAt: session.status === 'reopened' ? session.updatedAt : undefined,
        startedAt: session.startedAt,
        startedBy: session.startedBy,
        status: session.status,
        walkthroughScheduleWording: contextWording(
          data,
          session.id,
          CONTEXT_EVENT_TYPES.walkthroughSchedule,
          'Not recorded in this personal app.',
        ),
        workingHoursWording: contextWording(
          data,
          session.id,
          CONTEXT_EVENT_TYPES.workingHours,
          'Not recorded in this personal app.',
        ),
      };
    });
}

const daySourceType = (event: FieldEvent): DaySessionEvent['sourceType'] => {
  if (event.eventType.startsWith('day-session')) return 'day-session';
  if (event.eventType === 'crew-reported-complete') return 'crew-report';
  if (event.boundary === 'property-reported') return 'property-walk';
  return 'personal-entry';
};

export function projectDayEvents(data: AppData): readonly DaySessionEvent[] {
  return data.fieldEvents
    .filter((event) =>
      event.projectId === data.activeProjectId && Boolean(event.daySessionId))
    .map((event) => ({
      actorId: event.actorId,
      actorType: event.actorType === 'crew'
        ? 'crew'
        : event.actorType === 'property'
          ? 'property'
          : event.actorType === 'system'
            ? 'system'
            : 'los',
      daySessionId: event.daySessionId as string,
      eventId: event.id,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      personalOfficialBoundary: 'personal-record-only',
      propertyId: event.projectId,
      recordedAt: event.recordedAt,
      recordedBy: event.recordedBy,
      reportedBy: event.reportedBy,
      reversesEventId: event.reversesEventId,
      sectionId: event.section,
      sourceId: event.sourceId,
      sourceType: daySourceType(event),
      summary: event.summary,
      trade: event.trade === 'paint'
        ? 'Paint'
        : event.trade === 'clean'
          ? 'Clean'
          : undefined,
      unitId: event.unitId,
    }));
}

const taskExecutionState = (
  task: TodayTask,
  events: readonly FieldEvent[],
  keyStatus: DaySession['keyStatus'],
): TodayTask => ({
  ...task,
  sections: task.sections.map((section) => {
    const relevantEvents = events
      .filter((event) =>
        event.unitId === section.unitId
        && event.section === section.sectionId)
      .sort(byRecordedAt);
    const waitingReasons = [
      ...section.uncertainties,
      ...section.restrictions.filter((restriction) => hardRestrictionPattern.test(restriction)),
      ...(keyStatus === 'yes'
        ? []
        : [keyStatus === 'no'
            ? 'No keys or access recorded.'
            : 'Key or access issue recorded.']),
    ];
    return {
      ...section,
      tradeStates: section.tradeStates.map((initialState) => {
        const trade = initialState.trade === 'Paint' ? 'paint' : 'clean';
        return relevantEvents
          .filter((event) => event.trade === trade)
          .reduce((state, event) => {
            if (event.eventType === 'assignment-confirmed') {
              return { ...state, assignedCrewId: event.reportedBy ?? event.actorId, execution: 'assigned' };
            }
            if (event.eventType === 'assignment-cleared') {
              return { ...state, assignedCrewId: undefined, execution: 'unassigned' };
            }
            if (event.eventType === 'work-started') return { ...state, execution: 'working' };
            if (event.eventType === 'crew-reported-complete') {
              return { ...state, execution: 'crew-reported-complete' };
            }
            if (event.eventType === 'los-passed') {
              return { ...state, inspection: 'passed', propertyWalk: 'pending' };
            }
            if (event.eventType === 'callback-opened') {
              return { ...state, inspection: 'callback-required', propertyWalk: 'not-ready' };
            }
            if (event.eventType === 'callback-correction-reported') {
              return { ...state, inspection: 'reinspection-pending', propertyWalk: 'not-ready' };
            }
            if (event.eventType === 'callback-resolved') {
              return { ...state, inspection: 'passed-after-callback', propertyWalk: 'pending' };
            }
            if (event.eventType === 'property-accepted') {
              return { ...state, propertyWalk: 'accepted' };
            }
            if (event.eventType === 'property-correction-requested') {
              return { ...state, inspection: 'callback-required', propertyWalk: 'not-ready' };
            }
            return state;
          }, { ...initialState });
      }),
      waitingReasons: unique(waitingReasons),
    };
  }),
});

export function projectTodayTask(
  data: AppData,
  session: DaySession | undefined,
): TodayTask | null {
  if (!session) return null;
  const result = projectTodayTaskForSession(
    projectPropertyRoster(data),
    projectDailyReleases(data),
    session,
  );
  if (!result.task || result.errors.length > 0) return null;
  return taskExecutionState(
    result.task,
    data.fieldEvents.filter((event) => event.daySessionId === session.daySessionId),
    session.keyStatus,
  );
}

const toFoundationDayEvent = (
  projectId: string,
  event: DaySessionEvent,
): FieldEvent => ({
  actorId: event.actorId,
  actorType: event.actorType,
  boundary: event.sourceType === 'property-walk'
    ? 'property-reported'
    : 'personal-record',
  daySessionId: event.daySessionId,
  eventType: event.eventType,
  id: event.eventId,
  occurredAt: event.occurredAt,
  projectId,
  recordedAt: event.recordedAt,
  recordedBy: event.recordedBy,
  reportedBy: event.reportedBy,
  reversesEventId: event.reversesEventId,
  section: event.sectionId as FieldSection | undefined,
  sourceId: event.sourceId,
  sourceType: event.sourceType,
  summary: event.summary,
  trade: event.trade === 'Paint'
    ? 'paint'
    : event.trade === 'Clean'
      ? 'clean'
      : undefined,
  unitId: event.unitId,
});

const upsertById = <T extends { id: string }>(records: readonly T[], record: T) => {
  const index = records.findIndex((candidate) => candidate.id === record.id);
  if (index < 0) return [...records, record];
  return records.map((candidate) => candidate.id === record.id ? record : candidate);
};

const contextEvent = (
  projectId: string,
  session: DaySession,
  eventType: string,
  summary: string,
  recordedAt: string,
): FieldEvent => ({
  actorId: session.startedBy,
  actorType: 'los',
  boundary: 'personal-record',
  daySessionId: session.daySessionId,
  eventType,
  id: `${session.daySessionId}:${eventType}`,
  projectId,
  recordedAt,
  recordedBy: session.startedBy,
  sourceId: session.daySessionId,
  sourceType: 'day-session',
  summary,
});

export interface DayTaskStateChange {
  event?: DaySessionEvent;
  reason:
    | 'day-started'
    | 'day-closed'
    | 'recovery-resumed'
    | 'recovery-review'
    | 'recovery-reopened';
  recordedAt: string;
  session: DaySession;
}

export function applyDayTaskStateChange(
  data: AppData,
  change: DayTaskStateChange,
): AppData {
  const session = change.session;
  const existing = data.daySessions.find((candidate) => candidate.id === session.daySessionId);
  const persistedSession: AppData['daySessions'][number] = {
    activeCleanCrewIds: [...session.activeCrewIdsByTrade.Clean],
    activePaintCrewIds: [...session.activeCrewIdsByTrade.Paint],
    createdAt: existing?.createdAt ?? session.startedAt ?? change.recordedAt,
    date: session.date,
    endedAt: session.closedAt,
    endKeyStatus: session.endKeyStatus,
    endNote: session.endNote ?? '',
    id: session.daySessionId,
    keyStatus: session.keyStatus,
    morningNote: session.morningNote ?? '',
    paperReviewConfirmedAt:
      session.status === 'closed' && session.propertyReviewStatus === 'reviewed'
        ? change.recordedAt
        : existing?.paperReviewConfirmedAt,
    projectId: data.activeProjectId,
    propertyCheckInNote: session.propertyCheckIn,
    propertyContact: session.propertyContact,
    releaseBatchIds: [...session.releaseBatchIds],
    startedAt: session.startedAt ?? existing?.startedAt ?? change.recordedAt,
    startedBy: session.startedBy,
    status: session.status,
    updatedAt: change.recordedAt,
  };
  let fieldEvents = change.event
    ? upsertById(data.fieldEvents, toFoundationDayEvent(data.activeProjectId, change.event))
    : [...data.fieldEvents];
  if (change.reason === 'day-started') {
    [
      contextEvent(
        data.activeProjectId,
        session,
        CONTEXT_EVENT_TYPES.workingHours,
        session.workingHoursWording,
        change.recordedAt,
      ),
      contextEvent(
        data.activeProjectId,
        session,
        CONTEXT_EVENT_TYPES.walkthroughSchedule,
        session.walkthroughScheduleWording,
        change.recordedAt,
      ),
      contextEvent(
        data.activeProjectId,
        session,
        CONTEXT_EVENT_TYPES.assignmentEvidence,
        session.assignmentEvidenceReviewNote,
        change.recordedAt,
      ),
    ].forEach((event) => {
      fieldEvents = upsertById(fieldEvents, event);
    });
  }
  if (change.reason.startsWith('recovery-')) {
    fieldEvents = upsertById(fieldEvents, contextEvent(
      data.activeProjectId,
      session,
      `day-${change.reason}`,
      `Los explicitly chose ${change.reason.replace('recovery-', '').replaceAll('-', ' ')} for the personal Day Session.`,
      change.recordedAt,
    ));
  }
  return {
    ...data,
    daySessions: upsertById(data.daySessions, persistedSession),
    fieldEvents,
  };
}

export interface ManualReleaseSelection {
  section: FieldSection;
  trade: FieldTrade;
  unitId: string;
  workType?: 'full' | 'touch-up' | 'cut-in';
}

// Change the task on an already-released room (Joseph revises, or Los learns
// the real scope in the unit). Touches only the workType on matching stored
// release items — scope, ids, and batch shape stay untouched (validator-safe).
export const setReleaseWorkType = (
  data: AppData,
  input: {
    unitId: string;
    trade: FieldTrade;
    section: FieldSection;
    workType: 'full' | 'touch-up' | 'cut-in';
  },
): AppData => ({
  ...data,
  dailyReleaseBatches: data.dailyReleaseBatches.map((batch) => (
    batch.projectId !== data.activeProjectId
      ? batch
      : {
        ...batch,
        items: batch.items.map((item) =>
          item.unitId === input.unitId
          && item.trade === input.trade
          && item.section === input.section
            ? { ...item, workType: input.workType }
            : item),
      })),
});

export function createManualReleaseBatch(input: {
  actor: string;
  date: string;
  id: string;
  propertyContact: string;
  recordedAt: string;
  roster: PropertyRoster;
  selections: readonly ManualReleaseSelection[];
}): AppDailyReleaseBatch {
  const propertyContact = input.propertyContact.trim();
  if (!propertyContact) {
    throw new Error('Record the property contact who supplied or confirmed this release.');
  }
  const rosterUnits = new Map(input.roster.units.map((unit) => [unit.id, unit]));
  const uniqueSelections = new Map<string, ManualReleaseSelection>();
  input.selections.forEach((selection) => {
    const unit = rosterUnits.get(selection.unitId);
    const section = unit?.applicableSections.find((candidate) =>
      candidate.id === selection.section);
    const trackBTrade = selection.trade === 'paint' ? 'Paint' : 'Clean';
    if (!unit || !section?.trades.includes(trackBTrade)) {
      throw new Error('Manual release selection is not present in the existing roster.');
    }
    uniqueSelections.set(
      `${selection.unitId}:${selection.section}:${selection.trade}`,
      selection,
    );
  });
  if (uniqueSelections.size === 0) {
    throw new Error('Select at least one existing Unit, section, and trade.');
  }
  const items: DailyReleaseItem[] = [...uniqueSelections.values()]
    .sort((left, right) =>
      `${left.unitId}:${left.section}:${left.trade}`
        .localeCompare(`${right.unitId}:${right.section}:${right.trade}`))
    .map((selection, index) => ({
      id: `${input.id}:item:${index + 1}`,
      section: selection.section,
      sourceExcerpt: 'Explicit manual selection from the existing personal roster.',
      trade: selection.trade,
      unitId: selection.unitId,
      workType: selection.workType ?? 'full' as const,
    }));
  return {
    confirmedAt: input.recordedAt,
    confirmedBy: input.actor,
    createdAt: input.recordedAt,
    date: input.date,
    id: input.id,
    items,
    projectId: input.roster.propertyId,
    propertyContact,
    sourceLabel: 'Manual review of existing personal roster',
    sourceType: 'manual',
    status: 'confirmed',
    uncertainties: [],
    updatedAt: input.recordedAt,
  };
}

export function appendManualReleaseBatchOnce(
  data: AppData,
  batch: AppDailyReleaseBatch,
): AppData {
  if (data.dailyReleaseBatches.some((candidate) => candidate.id === batch.id)) {
    return data;
  }
  return {
    ...data,
    dailyReleaseBatches: [...data.dailyReleaseBatches, batch],
  };
}

const ACTIVE_DAY_SESSION_STATUSES = new Set(['active', 'ending', 'reopened']);

export function appendManualReleaseBatchToActiveDay(
  data: AppData,
  inputBatch: AppDailyReleaseBatch,
): AppData {
  let batch = inputBatch;
  const activeSessions = data.daySessions.filter((session) =>
    session.projectId === data.activeProjectId
    && ACTIVE_DAY_SESSION_STATUSES.has(session.status));
  if (activeSessions.length !== 1) {
    throw new Error('Start the day before confirming released work.');
  }
  const activeSession = activeSessions[0];
  if (
    batch.projectId !== data.activeProjectId
    || batch.date !== activeSession.date
    || batch.status !== 'confirmed'
    || batch.items.length === 0
  ) {
    throw new Error('Released work must match the active project and Day Session.');
  }

  // Same batch re-sent (retry after a save the UI missed) stays a clean
  // idempotent no-op — the duplicate-scope guard below is only for NEW batches.
  if (data.dailyReleaseBatches.some((candidate) => candidate.id === batch.id)
    && activeSession.releaseBatchIds.includes(batch.id)) {
    return data;
  }
  // Re-confirming an already-released scope must not create duplicate rows:
  // drop items already in this session's batches; refuse an all-duplicate save.
  const alreadyReleased = new Set(data.dailyReleaseBatches
    .filter((candidate) =>
      candidate.projectId === data.activeProjectId
      && activeSession.releaseBatchIds.includes(candidate.id))
    .flatMap((candidate) => candidate.items
      .map((item) => `${item.unitId}:${item.trade}:${item.section}`)));
  const freshItems = batch.items.filter((item) =>
    !alreadyReleased.has(`${item.unitId}:${item.trade}:${item.section}`));
  if (freshItems.length === 0) {
    throw new Error('Everything selected is already released today — nothing was added twice.');
  }
  batch = { ...batch, items: freshItems };

  const roster = projectPropertyRoster(data);
  const rosterUnits = new Map(roster.units.map((unit) => [unit.id, unit]));
  for (const item of batch.items) {
    const unit = rosterUnits.get(item.unitId);
    const section = unit?.applicableSections.find((candidate) =>
      candidate.id === item.section);
    const trade = item.trade === 'paint' ? 'Paint' : 'Clean';
    if (!unit || !section?.trades.includes(trade)) {
      throw new Error('Manual release selection is not present in the existing roster.');
    }
  }

  const existingBatch = data.dailyReleaseBatches.find((candidate) =>
    candidate.id === batch.id);
  if (existingBatch && JSON.stringify(existingBatch) !== JSON.stringify(batch)) {
    throw new Error('This release retry conflicts with an existing saved batch.');
  }

  const recordedAt = batch.confirmedAt ?? batch.updatedAt;
  const releaseBatchIds = activeSession.releaseBatchIds.includes(batch.id)
    ? activeSession.releaseBatchIds
    : [...activeSession.releaseBatchIds, batch.id];
  const event: FieldEvent = {
    actorId: batch.confirmedBy ?? activeSession.startedBy,
    actorType: 'los',
    boundary: 'personal-record',
    daySessionId: activeSession.id,
    eventType: 'daily-release-confirmed',
    id: `${batch.id}:daily-release-confirmed`,
    projectId: data.activeProjectId,
    recordedAt,
    recordedBy: batch.confirmedBy ?? activeSession.startedBy,
    sourceId: batch.id,
    sourceType: 'manual-release',
    summary: `${batch.items.length} released section-trade${batch.items.length === 1 ? '' : 's'} confirmed for the active personal Day Session.`,
  };

  return {
    ...data,
    dailyReleaseBatches: existingBatch
      ? data.dailyReleaseBatches
      : [...data.dailyReleaseBatches, batch],
    daySessions: upsertById(data.daySessions, {
      ...activeSession,
      releaseBatchIds,
      updatedAt: recordedAt,
    }),
    fieldEvents: upsertById(data.fieldEvents, event),
  };
}

const selectedReleaseBatches = (data: AppData) => {
  const projectSessions = data.daySessions.filter((session) =>
    session.projectId === data.activeProjectId);
  const activeSession = projectSessions.find((session) =>
    ACTIVE_DAY_SESSION_STATUSES.has(session.status));
  const projectSelectedIds = new Set(
    projectSessions.flatMap((session) => session.releaseBatchIds),
  );
  const projectBatches = data.dailyReleaseBatches.filter((batch) =>
    batch.projectId === data.activeProjectId
    && projectSelectedIds.has(batch.id)
    && batch.status === 'confirmed')
    .sort((left, right) =>
      (left.confirmedAt ?? left.updatedAt).localeCompare(
        right.confirmedAt ?? right.updatedAt,
      )
      || left.id.localeCompare(right.id));
  return {
    activeSession,
    projectBatches,
  };
};

const accessFromRestriction = (
  restriction: string | undefined,
  keyStatus: AppData['daySessions'][number]['keyStatus'] | undefined,
) => {
  if (restriction && occupiedRestrictionPattern.test(restriction)) {
    return 'occupied-restricted' as const;
  }
  if (restriction && maintenanceRestrictionPattern.test(restriction)) {
    return 'maintenance-blocked' as const;
  }
  if (
    (restriction && hardRestrictionPattern.test(restriction))
    || (keyStatus && keyStatus !== 'yes')
  ) {
    return 'access-blocked' as const;
  }
  return 'clear' as const;
};

const toTrackCEvent = (event: FieldEvent): TrackCConfirmedEvent | undefined => {
  if (
    !event.unitId
    || !event.trade
    || !event.section
    || !TRACK_C_EVENT_TYPES.has(event.eventType as TrackCEventType)
  ) {
    return undefined;
  }
  return {
    confirmation: 'confirmed',
    crewId: event.reportedBy ?? (event.actorType === 'crew' ? event.actorId : undefined),
    eventType: event.eventType as TrackCEventType,
    id: event.id,
    officialPaperChanged: false,
    payrollChanged: false,
    personalRecordOnly: true,
    recordedAt: event.recordedAt,
    recordedBy: event.recordedBy,
    sourceLabel: event.sourceType,
    sourceType: event.boundary === 'property-reported'
      ? 'property-walk-observation'
      : event.eventType === 'crew-reported-complete'
        ? 'crew-report'
        : 'personal-confirmation',
    summary: event.summary,
    target: {
      section: event.section,
      trade: event.trade,
      unitId: event.unitId,
    },
    walkSessionId: event.sourceId,
  };
};

interface StoredTrackCWalkState {
  readonly version: 2;
  readonly reviewedSelections: readonly TrackCWalkSelectionReview[];
  readonly outcomes: readonly TrackCWalkOutcomeRecord[];
  readonly draft?: TrackCWalkDraft;
}

const isStoredTrackCWalkDraft = (value: unknown): value is TrackCWalkDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<TrackCWalkDraft>;
  return (
    draft.version === 1
    && typeof draft.walkSessionId === 'string'
    && (draft.stage === 'active' || draft.stage === 'end-review')
    && Array.isArray(draft.outcomes)
    && typeof draft.updatedAt === 'string'
  );
};

const parseStoredTrackCWalkState = (
  note: string | undefined,
): Partial<StoredTrackCWalkState> | undefined => {
  if (!note) return undefined;
  try {
    if (note.startsWith(WALK_STATE_NOTE_PREFIX)) {
      const value = JSON.parse(
        note.slice(WALK_STATE_NOTE_PREFIX.length),
      ) as Partial<StoredTrackCWalkState>;
      if (!value || typeof value !== 'object' || value.version !== 2) {
        return undefined;
      }
      return {
        version: 2,
        ...(Array.isArray(value.reviewedSelections)
          ? { reviewedSelections: value.reviewedSelections }
          : {}),
        ...(Array.isArray(value.outcomes)
          ? { outcomes: value.outcomes }
          : {}),
        ...(isStoredTrackCWalkDraft(value.draft)
          ? { draft: value.draft }
          : {}),
      };
    }
    if (note.startsWith(WALK_REVIEW_NOTE_PREFIX)) {
      const value = JSON.parse(
        note.slice(WALK_REVIEW_NOTE_PREFIX.length),
      ) as unknown;
      return Array.isArray(value)
        ? {
            version: 2,
            reviewedSelections: value as readonly TrackCWalkSelectionReview[],
          }
        : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const serializeStoredTrackCWalkState = (input: {
  readonly reviewedSelections: readonly TrackCWalkSelectionReview[];
  readonly outcomes: readonly TrackCWalkOutcomeRecord[];
  readonly draft?: TrackCWalkDraft;
}) => `${WALK_STATE_NOTE_PREFIX}${JSON.stringify({
  version: 2,
  reviewedSelections: input.reviewedSelections,
  outcomes: input.outcomes,
  ...(input.draft ? { draft: input.draft } : {}),
})}`;

const keyedStoredWalkOutcomes = (
  outcomes: readonly TrackCWalkOutcomeRecord[] | undefined,
) => {
  const records = new Map<string, TrackCWalkOutcomeRecord>();
  for (const outcome of outcomes ?? []) {
    const target = outcome?.target;
    if (
      !target
      || typeof target.unitId !== 'string'
      || !TRACK_C_TRADES.includes(target.trade)
      || !TRACK_C_SECTIONS.includes(target.section)
    ) {
      continue;
    }
    records.set(trackCWorkKey(target), outcome);
  }
  return records;
};

export function projectTrackCWalkDraft(
  data: AppData,
): TrackCWalkDraft | undefined {
  const { activeSession } = selectedReleaseBatches(data);
  if (!activeSession) return undefined;
  const activeWalk = data.walkSessions.find((walk) =>
    walk.projectId === data.activeProjectId
    && walk.daySessionId === activeSession.id
    && walk.status === 'active');
  if (!activeWalk) return undefined;
  const draft = parseStoredTrackCWalkState(activeWalk.note)?.draft;
  return draft?.walkSessionId === activeWalk.id ? draft : undefined;
}

const releaseItemMaps = (batches: readonly AppDailyReleaseBatch[]) => {
  const byId = new Map<string, DailyReleaseItem>();
  const byTarget = new Map<string, DailyReleaseItem>();
  batches.forEach((batch) => batch.items.forEach((item) => {
    byId.set(item.id, item);
    byTarget.set(`${item.unitId}:${item.trade}:${item.section}`, item);
  }));
  return { byId, byTarget };
};

const reviewedSelectionFromState = (
  state: TrackCState,
  target: TrackCWorkTarget,
): TrackCWalkSelectionReview | undefined => {
  const projection = projectTrackCWork(state, target);
  if (!projection?.responsibleCrewId) return undefined;
  return {
    access: projection.access,
    assignmentConflict: projection.assignmentConflict,
    callbackOpen: projection.callbackOpen,
    confirmedEventCount: projection.confirmedEventCount,
    inspection: projection.inspection,
    property: projection.property,
    release: projection.release,
    responsibleCrewId: projection.responsibleCrewId,
    sourceConfidence: projection.sourceConfidence,
    target,
  };
};

export function projectTrackCState(data: AppData): TrackCState {
  const project = projectForData(data);
  const roster = projectPropertyRoster(data);
  const { activeSession, projectBatches: batches } = selectedReleaseBatches(data);
  const releaseItems = releaseItemMaps(batches);
  const projectDaySessionIds = new Set(
    data.daySessions
      .filter((session) => session.projectId === data.activeProjectId)
      .map((session) => session.id),
  );
  const events = data.fieldEvents
    .filter((event) =>
      event.projectId === data.activeProjectId
      && Boolean(event.daySessionId && projectDaySessionIds.has(event.daySessionId)))
    .map(toTrackCEvent)
    .filter((event): event is TrackCConfirmedEvent => Boolean(event))
    .sort(byRecordedAtAndId);
  const stateWithoutWalks: TrackCState = {
    completedWalks: [],
    crews: data.crewMembers
      .filter((crew) =>
        (!crew.projectId || crew.projectId === data.activeProjectId)
        && (crew.trade === 'Painter' || crew.trade === 'Cleaner'))
      .map((crew) => ({
        activeToday: crew.active,
        id: crew.id,
        name: crew.name,
        phone: crew.phone || undefined,
        trade: crew.trade === 'Painter' ? 'paint' : 'clean',
      })),
    events,
    propertyId: data.activeProjectId,
    propertyName: project?.propertyName || project?.name || 'Current property',
    terminology: DEFAULT_TRACK_C_TERMINOLOGY,
    units: roster.units.map((unit) => ({
      applicableSections: unit.applicableSections.map((section) =>
        section.id as TrackCSection),
      id: unit.id,
      locationLabel: [unit.building, unit.floor].filter(Boolean).join(' · ') || 'Roster Unit',
      unitNumber: unit.unitNumber,
      unitType: unit.unitType,
      workFacts: TRACK_C_TRADES.flatMap((trade) =>
        unit.applicableSections.map((section) => {
          const key = `${unit.id}:${trade}:${section.id}`;
          const item = releaseItems.byTarget.get(key);
          const batch = item
            ? batches.find((candidate) => candidate.items.some((entry) => entry.id === item.id))
            : undefined;
          const uncertain = Boolean(batch?.uncertainties.length);
          return {
            access: accessFromRestriction(item?.restriction, activeSession?.keyStatus),
            id: key,
            release: item ? uncertain ? 'source-uncertain' : 'released' : 'unreleased',
            restrictionLabel: item?.restriction,
            section: section.id as TrackCSection,
            sourceConfidence: item ? uncertain ? 'uncertain' : 'confirmed' : 'confirmed',
            sourceLabel: item
              ? `${batch?.sourceLabel ?? 'Confirmed release'} · personal copy`
              : 'Not included in a confirmed project Day Session release',
            trade,
            unitId: unit.id,
            workType: item?.workType,
          };
        })),
    })),
  };
  const walks = data.walkSessions
    .filter((walk) =>
      walk.projectId === data.activeProjectId)
    .sort((left, right) =>
      left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id))
    .map((walk): TrackCWalkSession | undefined => {
      const selectedTargets = walk.selectedItemIds
        .map((itemId) => releaseItems.byId.get(itemId))
        .filter((item): item is DailyReleaseItem => Boolean(item))
        .map((item) => ({
          section: item.section,
          trade: item.trade,
          unitId: item.unitId,
        }));
      if (selectedTargets.length !== walk.selectedItemIds.length) return undefined;
      const storedWalkState = parseStoredTrackCWalkState(walk.note);
      const storedOutcomes = keyedStoredWalkOutcomes(storedWalkState?.outcomes);
      const persistedOutcomes = walk.status === 'active' && storedWalkState?.outcomes
        ? storedWalkState.outcomes
        : walk.outcomes.map((outcome) => {
            const item = releaseItems.byId.get(outcome.selectedItemId);
            if (!item) return undefined;
            const target = {
              section: item.section,
              trade: item.trade,
              unitId: item.unitId,
            };
            const note = storedOutcomes.get(trackCWorkKey(target))?.note;
            return {
              outcome: outcome.outcome,
              target,
              ...(note ? { note } : {}),
            };
          }).filter((outcome): outcome is TrackCWalkOutcomeRecord => Boolean(outcome));
      const reviewedSelections = storedWalkState?.reviewedSelections
        ?? selectedTargets
          .map((target) => reviewedSelectionFromState(stateWithoutWalks, target))
          .filter((review): review is TrackCWalkSelectionReview => Boolean(review));
      if (reviewedSelections.length !== selectedTargets.length) return undefined;
      return {
        endedAt: walk.endedAt,
        id: walk.id,
        outcomes: persistedOutcomes,
        propertyContact: walk.propertyContact,
        reviewedSelections,
        selectedTargets,
        startedAt: walk.startedAt,
        startedBy: walk.startedBy,
        status: walk.status === 'closed' ? 'completed' : 'active',
      };
    })
    .filter((walk): walk is TrackCWalkSession => Boolean(walk));
  return {
    ...stateWithoutWalks,
    activeWalk: walks.find((walk) => walk.status === 'active'),
    completedWalks: walks.filter((walk) => walk.status === 'completed'),
  };
}

const toFoundationTrackCEvent = (
  projectId: string,
  daySessionId: string,
  event: TrackCConfirmedEvent,
): FieldEvent => ({
  actorId: event.eventType === 'crew-reported-complete'
    ? event.crewId ?? event.recordedBy
    : event.recordedBy,
  actorType: event.eventType === 'crew-reported-complete' ? 'crew' : 'los',
  boundary: event.eventType.startsWith('property-')
    || event.eventType === 'walk-not-walked'
    || event.eventType === 'walk-deferred'
      ? 'property-reported'
      : event.eventType === 'personal-pds-mirror-recorded'
        ? 'paper-mirror'
        : 'personal-record',
  daySessionId,
  eventType: event.eventType,
  id: event.id,
  projectId,
  recordedAt: event.recordedAt,
  recordedBy: event.recordedBy,
  reportedBy: event.crewId,
  section: event.target.section,
  sourceId: event.walkSessionId,
  sourceType: event.sourceType,
  summary: event.summary,
  trade: event.target.trade,
  unitId: event.target.unitId,
});

const persistWalk = (
  data: AppData,
  walk: TrackCWalkSession,
  activeSessionId: string,
  releases: readonly AppDailyReleaseBatch[],
): AppWalkSession => {
  const releaseItems = releaseItemMaps(releases);
  const selectedItemIds = walk.selectedTargets.map((target) => {
    const item = releaseItems.byTarget.get(trackCWorkKey(target));
    if (!item) throw new Error('Walk target is not in confirmed project Day Session work.');
    return item.id;
  });
  const outcomes = walk.status === 'active' ? [] : (walk.outcomes ?? []).map((outcome) => {
    const item = releaseItems.byTarget.get(trackCWorkKey(outcome.target));
    if (!item) throw new Error('Walk outcome is not in confirmed project Day Session work.');
    return { outcome: outcome.outcome, selectedItemId: item.id };
  });
  const existing = data.walkSessions.find((candidate) => candidate.id === walk.id);
  const existingDraft = parseStoredTrackCWalkState(existing?.note)?.draft;
  const persistedDraft = (
    walk.status === 'active'
    && existingDraft?.walkSessionId === walk.id
  )
    ? existingDraft
    : undefined;
  return {
    createdAt: existing?.createdAt ?? walk.startedAt,
    daySessionId: existing?.daySessionId ?? activeSessionId,
    endedAt: walk.endedAt,
    id: walk.id,
    note: serializeStoredTrackCWalkState({
      reviewedSelections: walk.reviewedSelections,
      outcomes: walk.outcomes ?? [],
      ...(persistedDraft ? { draft: persistedDraft } : {}),
    }),
    outcomes,
    projectId: data.activeProjectId,
    propertyContact: walk.propertyContact,
    selectedItemIds,
    startedAt: walk.startedAt,
    startedBy: walk.startedBy,
    status: walk.status === 'completed' ? 'closed' : 'active',
    updatedAt:
      walk.endedAt
      ?? persistedDraft?.updatedAt
      ?? existing?.updatedAt
      ?? walk.startedAt,
  };
};

export function applyTrackCWalkDraftChange(
  data: AppData,
  draft: TrackCWalkDraft | undefined,
): AppData {
  const { activeSession, projectBatches: batches } = selectedReleaseBatches(data);
  if (!activeSession) return data;
  const activeWalk = data.walkSessions.find((walk) =>
    walk.projectId === data.activeProjectId
    && walk.daySessionId === activeSession.id
    && walk.status === 'active');
  if (!activeWalk || (draft && draft.walkSessionId !== activeWalk.id)) {
    return data;
  }

  const storedState = parseStoredTrackCWalkState(activeWalk.note);
  const reviewedSelections = storedState?.reviewedSelections;
  if (!reviewedSelections) return data;

  const releaseItems = releaseItemMaps(batches);
  const selectedItemIds = new Set(activeWalk.selectedItemIds);
  const draftOutcomes = draft?.outcomes ?? storedState?.outcomes ?? [];
  const outcomes = draftOutcomes.map((outcome) => {
    const item = releaseItems.byTarget.get(trackCWorkKey(outcome.target));
    return item && selectedItemIds.has(item.id)
      ? { outcome: outcome.outcome, selectedItemId: item.id }
      : undefined;
  });
  if (outcomes.some((outcome) => !outcome)) {
    return data;
  }

  const nextWalk: AppWalkSession = {
    ...activeWalk,
    note: serializeStoredTrackCWalkState({
      reviewedSelections,
      outcomes: draftOutcomes,
      ...(draft ? { draft } : {}),
    }),
    outcomes: [],
    updatedAt: draft?.updatedAt ?? activeWalk.updatedAt,
  };
  if (
    nextWalk.note === activeWalk.note
    && nextWalk.updatedAt === activeWalk.updatedAt
    && activeWalk.outcomes.length === 0
  ) {
    return data;
  }
  return {
    ...data,
    walkSessions: upsertById(data.walkSessions, nextWalk),
  };
}

export function applyTrackCStateChange(
  data: AppData,
  nextState: TrackCState,
): AppData {
  const { activeSession, projectBatches: batches } = selectedReleaseBatches(data);
  if (!activeSession) {
    throw new Error('Field Operations requires one active personal Day Session.');
  }
  const currentEventIds = new Set(data.fieldEvents.map((event) => event.id));
  const newEvents = nextState.events
    .filter((event) => event.confirmation === 'confirmed' && !currentEventIds.has(event.id))
    .map((event) =>
      toFoundationTrackCEvent(data.activeProjectId, activeSession.id, event));
  const nextWalks = [
    ...nextState.completedWalks,
    ...(nextState.activeWalk ? [nextState.activeWalk] : []),
  ].reduce(
    (records, walk) => upsertById(
      records,
      persistWalk(data, walk, activeSession.id, batches),
    ),
    [...data.walkSessions] as AppWalkSession[],
  );
  return {
    ...data,
    fieldEvents: [...data.fieldEvents, ...newEvents],
    walkSessions: nextWalks,
  };
}

// Blocking a unit = stamping a restriction on its released items so the
// existing access logic routes it to Waiting. Clearing passes undefined.
// The reason is prefixed with "Blocked" so accessFromRestriction always
// recognizes it regardless of the free-text wording.
export function setUnitReleaseRestriction(
  data: AppData,
  unitId: string,
  reason: string | undefined,
  trade?: 'paint' | 'clean',
): AppData {
  const restriction = reason === undefined
    ? undefined
    : `Blocked — ${reason.trim() || 'no reason recorded'}`;
  const applies = (item: { unitId: string; trade: string }) =>
    item.unitId === unitId && (!trade || item.trade === trade);
  return {
    ...data,
    dailyReleaseBatches: data.dailyReleaseBatches.map((batch) =>
      batch.projectId !== data.activeProjectId
        || !batch.items.some(applies)
        ? batch
        : {
          ...batch,
          items: batch.items.map((item) =>
            applies(item)
              ? restriction === undefined
                ? (() => {
                  const next = { ...item };
                  delete next.restriction;
                  return next;
                })()
                : { ...item, restriction }
              : item),
        }),
  };
}

// Joseph releases at room grain ("307 — A, B, C only"). These two paths keep
// the app's release scope editable from the unit page: drop a section he
// didn't release, add it back the day he does. Re-releases ride a small
// confirmed adjustment batch attached to the ACTIVE day session so every
// projection sees them; nothing is deleted from history on un-release beyond
// the release rows themselves.

// Removing release rows can empty a batch; an empty confirmed batch is
// invalid and carries no evidence, so drop it and its session references.
const dropEmptyReleaseBatches = (data: AppData): AppData => {
  const emptyIds = new Set(data.dailyReleaseBatches
    .filter((batch) => batch.items.length === 0)
    .map((batch) => batch.id));
  if (emptyIds.size === 0) return data;
  return {
    ...data,
    dailyReleaseBatches: data.dailyReleaseBatches
      .filter((batch) => !emptyIds.has(batch.id)),
    daySessions: data.daySessions.map((session) =>
      session.releaseBatchIds.some((id) => emptyIds.has(id))
        ? {
          ...session,
          releaseBatchIds: session.releaseBatchIds
            .filter((id) => !emptyIds.has(id)),
        }
        : session),
  };
};

export function setSectionReleaseState(
  data: AppData,
  input: {
    unitId: string;
    trade: 'paint' | 'clean';
    section: DailyReleaseItem['section'];
    released: boolean;
    nowIso: string;
    idFactory: (prefix: string) => string;
  },
): AppData {
  if (!input.released) {
    return dropEmptyReleaseBatches({
      ...data,
      dailyReleaseBatches: data.dailyReleaseBatches.map((batch) =>
        batch.projectId !== data.activeProjectId
          ? batch
          : {
            ...batch,
            items: batch.items.filter((item) =>
              !(item.unitId === input.unitId
                && item.trade === input.trade
                && item.section === input.section)),
          }),
    });
  }
  const session = data.daySessions.find((candidate) =>
    candidate.projectId === data.activeProjectId
    && ['active', 'ending', 'reopened'].includes(candidate.status));
  if (!session) return data;
  const alreadyReleased = data.dailyReleaseBatches.some((batch) =>
    batch.projectId === data.activeProjectId
    && session.releaseBatchIds.includes(batch.id)
    && batch.items.some((item) =>
      item.unitId === input.unitId
      && item.trade === input.trade
      && item.section === input.section));
  if (alreadyReleased) return data;
  const batch = {
    id: input.idFactory('release'),
    projectId: data.activeProjectId,
    date: session.date,
    propertyContact: session.propertyContact || 'Property',
    sourceType: 'manual' as const,
    sourceLabel: 'Unit page adjustment',
    status: 'confirmed' as const,
    items: [{
      id: input.idFactory('release-item'),
      unitId: input.unitId,
      trade: input.trade,
      section: input.section,
      sourceExcerpt: 'Released later — added from the unit page.',
    }],
    uncertainties: [],
    confirmedBy: 'Los',
    confirmedAt: input.nowIso,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
  return {
    ...data,
    dailyReleaseBatches: [...data.dailyReleaseBatches, batch],
    daySessions: data.daySessions.map((candidate) =>
      candidate.id === session.id
        ? {
          ...candidate,
          releaseBatchIds: [...candidate.releaseBatchIds, batch.id],
          updatedAt: input.nowIso,
        }
        : candidate),
  };
}

// Whole-trade release correction from the unit page — Joseph releases in
// sentences like "1706 paint": one tap must fix a whole trade, not five
// section rows. Un-release only when every released section of the trade is
// untouched; release adds every applicable section minus ones already there.
export function setTradeReleaseState(
  data: AppData,
  input: {
    unitId: string;
    trade: 'paint' | 'clean';
    released: boolean;
    nowIso: string;
    idFactory: (prefix: string) => string;
  },
): AppData {
  if (!input.released) {
    return dropEmptyReleaseBatches({
      ...data,
      dailyReleaseBatches: data.dailyReleaseBatches.map((batch) =>
        batch.projectId !== data.activeProjectId
          ? batch
          : {
            ...batch,
            items: batch.items.filter((item) =>
              !(item.unitId === input.unitId && item.trade === input.trade)),
          }),
    });
  }
  const session = data.daySessions.find((candidate) =>
    candidate.projectId === data.activeProjectId
    && ['active', 'ending', 'reopened'].includes(candidate.status));
  if (!session) return data;
  const unit = projectPropertyRoster(data).units
    .find((candidate) => candidate.id === input.unitId);
  if (!unit) return data;
  const tradeName = input.trade === 'paint' ? 'Paint' : 'Clean';
  const existing = new Set(data.dailyReleaseBatches
    .filter((batch) =>
      batch.projectId === data.activeProjectId
      && session.releaseBatchIds.includes(batch.id))
    .flatMap((batch) => batch.items
      .filter((item) => item.unitId === input.unitId && item.trade === input.trade)
      .map((item) => item.section)));
  const sections = unit.applicableSections
    .filter((section) => section.trades.includes(tradeName as 'Paint' | 'Clean'))
    .map((section) => section.id)
    .filter((section) => !existing.has(section as FieldSection));
  if (sections.length === 0) return data;
  const batch = {
    id: input.idFactory('release'),
    projectId: data.activeProjectId,
    date: session.date,
    propertyContact: session.propertyContact || 'Property',
    sourceType: 'manual' as const,
    sourceLabel: 'Unit page adjustment',
    status: 'confirmed' as const,
    items: sections.map((section) => ({
      id: input.idFactory('release-item'),
      unitId: input.unitId,
      trade: input.trade,
      section: section as FieldSection,
      sourceExcerpt: `${tradeName} released for the whole unit — added from the unit page.`,
    })),
    uncertainties: [],
    confirmedBy: 'Los',
    confirmedAt: input.nowIso,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
  return {
    ...data,
    dailyReleaseBatches: [...data.dailyReleaseBatches, batch],
    daySessions: data.daySessions.map((candidate) =>
      candidate.id === session.id
        ? {
          ...candidate,
          releaseBatchIds: [...candidate.releaseBatchIds, batch.id],
          updatedAt: input.nowIso,
        }
        : candidate),
  };
}
