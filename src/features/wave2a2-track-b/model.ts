import type {
  DailyReleaseBatch,
  DayRecoveryDecision,
  DayRolloverChoice,
  DaySession,
  DaySessionEvent,
  EndDayReview,
  EndDaySummary,
  LosInspectionState,
  PropertyRoster,
  StartDayReview,
  TodayTask,
  TodayTaskProgress,
  TodayTaskQueue,
  TodayTaskQueueId,
  TodayTaskSection,
  TodayTaskTradeState,
} from './types';

export const START_DAY_STEPS = [
  'Confirm property',
  'Confirm date',
  'Confirm property contact',
  'Confirm keys received',
  'Confirm today’s released work',
  'Confirm active Paint crews',
  'Confirm active Clean crews',
  'Morning note',
  'Review',
  'Start Day',
] as const;

export const END_DAY_SUMMARY_LABELS: Readonly<Record<keyof Omit<EndDaySummary, 'unresolvedSectionIds'>, string>> = {
  assigned: 'Assigned',
  callbacksOpen: 'Callbacks open',
  callbacksResolved: 'Callbacks resolved',
  crewReportedComplete: 'Crew reported complete',
  inspected: 'Inspected',
  notesAndPhotos: 'Notes/photos',
  propertyAccepted: 'Property accepted',
  readyToWalk: 'Ready to walk',
  releasedToday: 'Released today',
  waiting: 'Waiting',
  working: 'Working',
};

const ACTIVE_DAY_STATUSES = new Set<DaySession['status']>(['active', 'ending', 'reopened']);

const queueMetadata: Record<TodayTaskQueueId, Pick<TodayTaskQueue, 'emptyMessage' | 'label'>> = {
  callbacks: { emptyMessage: 'No released sections have an open callback.', label: 'Callbacks' },
  'ready-to-walk': {
    emptyMessage: 'No released sections are ready for a property walk.',
    label: 'Ready to walk',
  },
  waiting: { emptyMessage: 'No released sections are waiting.', label: 'Waiting' },
  working: { emptyMessage: 'No released sections are currently working.', label: 'Working' },
};

export interface StartDayResult {
  errors: readonly string[];
  session?: DaySession;
  startEvent?: DaySessionEvent;
  warnings: readonly string[];
}

export interface CloseDayResult {
  closeEvent?: DaySessionEvent;
  errors: readonly string[];
  session?: DaySession;
  warnings: readonly string[];
}

const unique = <T,>(values: readonly T[]) => [...new Set(values)];

const stableSectionKey = (unitId: string, sectionId: string) => `${unitId}::${sectionId}`;

const wasInspected = (state: LosInspectionState) => state !== 'pending';

const passedInspection = (state: LosInspectionState) => (
  state === 'passed' || state === 'passed-after-callback'
);

const everyTrade = (
  section: TodayTaskSection,
  predicate: (state: TodayTaskTradeState) => boolean,
) => section.tradeStates.length > 0 && section.tradeStates.every(predicate);

const hasOpenCallback = (section: TodayTaskSection) => section.tradeStates.some(
  (state) => state.inspection === 'callback-required' || state.inspection === 'reinspection-pending',
);

const hasResolvedCallback = (section: TodayTaskSection) => section.tradeStates.some(
  (state) => state.inspection === 'passed-after-callback',
);

export function validateReleaseAgainstRoster(
  roster: PropertyRoster,
  release: DailyReleaseBatch,
): readonly string[] {
  const errors: string[] = [];
  if (release.propertyId !== roster.propertyId) {
    errors.push('Release property does not match the roster property.');
    return errors;
  }

  const unitMap = new Map(roster.units.map((unit) => [unit.id, unit]));
  const seen = new Set<string>();

  for (const entry of release.entries) {
    const unit = unitMap.get(entry.unitId);
    if (!unit) {
      errors.push(`Released Unit ${entry.unitId} is not present in the property roster.`);
      continue;
    }
    const section = unit.applicableSections.find((candidate) => candidate.id === entry.sectionId);
    if (!section) {
      errors.push(`Released section ${entry.sectionId} is not applicable to Unit ${unit.unitNumber}.`);
      continue;
    }
    const key = stableSectionKey(entry.unitId, entry.sectionId);
    if (seen.has(key)) {
      errors.push(`Release contains duplicate section ${unit.unitNumber} ${section.label}.`);
    }
    seen.add(key);

    for (const trade of entry.trades) {
      if (!section.trades.includes(trade)) {
        errors.push(`${trade} is not structurally available for Unit ${unit.unitNumber} ${section.label}.`);
      }
    }
    if (entry.trades.length === 0) {
      errors.push(`Released section ${unit.unitNumber} ${section.label} has no released trade.`);
    }
  }

  return errors;
}

export function createTodayTask(
  roster: PropertyRoster,
  releaseBatches: readonly DailyReleaseBatch[],
  date: string,
  daySessionId?: string,
): TodayTask | null {
  const confirmed = releaseBatches.filter((release) => (
    release.propertyId === roster.propertyId
    && release.date === date
    && release.confirmationStatus === 'confirmed'
    && Boolean(release.confirmedAt)
    && Boolean(release.confirmedBy)
  ));
  if (confirmed.length === 0) return null;

  const errors = confirmed.flatMap((release) => validateReleaseAgainstRoster(roster, release));
  if (errors.length > 0) {
    throw new Error(`Confirmed release is incompatible with the property roster:\n${errors.join('\n')}`);
  }

  const unitMap = new Map(roster.units.map((unit) => [unit.id, unit]));
  const sections = new Map<string, TodayTaskSection>();

  for (const release of confirmed) {
    for (const entry of release.entries) {
      const unit = unitMap.get(entry.unitId);
      if (!unit) continue;
      const rosterSection = unit.applicableSections.find((section) => section.id === entry.sectionId);
      if (!rosterSection) continue;
      const key = stableSectionKey(entry.unitId, entry.sectionId);
      const existing = sections.get(key);
      const nextTradeStates = entry.trades.map<TodayTaskTradeState>((trade) => ({
        execution: 'unassigned',
        inspection: 'pending',
        propertyWalk: 'not-ready',
        trade,
      }));

      if (existing) {
        const trades = new Map(existing.tradeStates.map((state) => [state.trade, state]));
        nextTradeStates.forEach((state) => trades.set(state.trade, state));
        sections.set(key, {
          ...existing,
          restrictions: unique([...existing.restrictions, ...entry.restrictions]),
          tradeStates: [...trades.values()],
          uncertainties: unique([...existing.uncertainties, ...entry.uncertainties]),
        });
      } else {
        sections.set(key, {
          building: unit.building,
          floor: unit.floor,
          releaseBatchId: release.id,
          restrictions: [...entry.restrictions],
          sectionId: entry.sectionId,
          sectionLabel: rosterSection.label,
          tradeStates: nextTradeStates,
          uncertainties: [...entry.uncertainties],
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          unitType: unit.unitType,
          waitingReasons: [],
        });
      }
    }
  }

  return {
    date,
    daySessionId,
    propertyId: roster.propertyId,
    releaseBatchIds: confirmed.map((release) => release.id),
    sections: [...sections.values()],
  };
}

export function calculateTodayTaskProgress(task: TodayTask | null): TodayTaskProgress {
  const target = task?.sections.length ?? 0;
  const actual = task?.sections.filter((section) => (
    everyTrade(section, (state) => wasInspected(state.inspection))
  )).length ?? 0;
  const percentage = target === 0 ? 0 : Math.min(100, Math.round((actual / target) * 100));

  return {
    actual,
    copy: `${actual} of ${target} released ${target === 1 ? 'section' : 'sections'} inspected by Los`,
    metric: 'sections',
    milestone: 'los-inspected',
    percentage,
    scope: 'today-confirmed-release',
    scopeLabel: 'Today’s confirmed release',
    target,
  };
}

export function selectTodayTaskQueue(
  task: TodayTask | null,
  queueId: TodayTaskQueueId,
): TodayTaskQueue {
  const source = task?.sections ?? [];
  const records = source.filter((section) => {
    if (queueId === 'working') {
      return section.tradeStates.some((state) => state.execution === 'working');
    }
    if (queueId === 'waiting') {
      return section.waitingReasons.length > 0;
    }
    if (queueId === 'callbacks') {
      return hasOpenCallback(section);
    }
    return (
      section.waitingReasons.length === 0
      && !hasOpenCallback(section)
      && everyTrade(section, (state) => (
        passedInspection(state.inspection)
        && state.propertyWalk !== 'accepted'
        && state.propertyWalk !== 'correction-requested'
      ))
    );
  });

  return {
    ...queueMetadata[queueId],
    id: queueId,
    records: records.map((record) => ({
      ...record,
      restrictions: [...record.restrictions],
      tradeStates: record.tradeStates.map((state) => ({ ...state })),
      uncertainties: [...record.uncertainties],
      waitingReasons: [...record.waitingReasons],
    })),
  };
}

export function getTodayTaskQueueCounts(
  task: TodayTask | null,
): Readonly<Record<TodayTaskQueueId, number>> {
  return {
    callbacks: selectTodayTaskQueue(task, 'callbacks').records.length,
    'ready-to-walk': selectTodayTaskQueue(task, 'ready-to-walk').records.length,
    waiting: selectTodayTaskQueue(task, 'waiting').records.length,
    working: selectTodayTaskQueue(task, 'working').records.length,
  };
}

export function createPersonalDayEvent(input: Omit<DaySessionEvent, 'personalOfficialBoundary'>) {
  if (!input.recordedAt) throw new Error('recordedAt is required.');
  return {
    ...input,
    personalOfficialBoundary: 'personal-record-only',
  } satisfies DaySessionEvent;
}

export function startDaySession(
  review: StartDayReview,
  releases: readonly DailyReleaseBatch[],
  existingSessions: readonly DaySession[],
  recordedAt: string,
): StartDayResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!review.propertyId.trim()) errors.push('Property is required.');
  if (!review.date.trim()) errors.push('Date is required.');
  if (!review.propertyContact.trim()) errors.push('Property contact is required.');
  if (!review.crewReviewConfirmed.Paint) errors.push('Paint crew review is required.');
  if (!review.crewReviewConfirmed.Clean) errors.push('Clean crew review is required.');
  if (!review.explicitConfirmation) errors.push('Explicit Start Day confirmation is required.');

  const selectedReleases = releases.filter((release) => review.releaseBatchIds.includes(release.id));
  if (selectedReleases.length === 0) {
    errors.push('At least one confirmed daily release batch is required.');
  }
  for (const release of selectedReleases) {
    if (
      release.confirmationStatus !== 'confirmed'
      || !release.confirmedAt
      || !release.confirmedBy
    ) {
      errors.push(`Release batch ${release.id} is not explicitly confirmed.`);
    }
    if (release.propertyId !== review.propertyId || release.date !== review.date) {
      errors.push(`Release batch ${release.id} does not match the selected property and date.`);
    }
  }

  const conflict = existingSessions.find((session) => (
    session.accountId === review.accountId
    && session.propertyId === review.propertyId
    && ACTIVE_DAY_STATUSES.has(session.status)
  ));
  if (conflict) {
    errors.push(`Day Session ${conflict.daySessionId} is already active for this property and account.`);
  }

  if (review.keyStatus !== 'yes') {
    warnings.push(
      review.keyStatus === 'no'
        ? 'No keys are recorded. Confirm access before entering any released work.'
        : 'A key or access issue is recorded. Release authorization does not resolve access.',
    );
  }

  if (errors.length > 0) return { errors, warnings };

  const activeCrewIdsByTrade = {
    Clean: unique(review.activeCrewIdsByTrade.Clean),
    Paint: unique(review.activeCrewIdsByTrade.Paint),
  };
  const session: DaySession = {
    accountId: review.accountId,
    activeCrewIds: unique([...activeCrewIdsByTrade.Paint, ...activeCrewIdsByTrade.Clean]),
    activeCrewIdsByTrade,
    date: review.date,
    daySessionId: review.daySessionId,
    keyStatus: review.keyStatus,
    morningNote: review.morningNote?.trim() || undefined,
    propertyContact: review.propertyContact.trim(),
    propertyId: review.propertyId,
    releaseBatchIds: unique(review.releaseBatchIds),
    startedAt: recordedAt,
    startedBy: review.startedBy,
    status: 'active',
  };

  return {
    errors,
    session,
    startEvent: createPersonalDayEvent({
      actorId: review.startedBy,
      actorType: 'los',
      daySessionId: review.daySessionId,
      eventId: `${review.daySessionId}:started`,
      eventType: 'day-session-started',
      occurredAt: recordedAt,
      propertyId: review.propertyId,
      recordedAt,
      recordedBy: review.startedBy,
      sourceId: review.daySessionId,
      sourceType: 'day-session',
      summary: 'Los explicitly started the personal Day Session.',
    }),
    warnings,
  };
}

export function markDaySessionEnding(session: DaySession): DaySession {
  if (!ACTIVE_DAY_STATUSES.has(session.status)) {
    throw new Error('Only an active or reopened Day Session may enter End Day review.');
  }
  return { ...session, status: 'ending' };
}

export function buildEndDaySummary(
  task: TodayTask | null,
  events: readonly DaySessionEvent[],
): EndDaySummary {
  const sections = task?.sections ?? [];
  const notesAndPhotos = events.filter((event) => (
    event.eventType === 'note-saved' || event.eventType === 'photo-saved'
  )).length;
  const unresolvedSectionIds = sections
    .filter((section) => !everyTrade(section, (state) => state.propertyWalk === 'accepted'))
    .map((section) => stableSectionKey(section.unitId, section.sectionId));

  return {
    assigned: sections.filter((section) => everyTrade(
      section,
      (state) => Boolean(state.assignedCrewId) && state.execution !== 'unassigned',
    )).length,
    callbacksOpen: sections.filter(hasOpenCallback).length,
    callbacksResolved: sections.filter(hasResolvedCallback).length,
    crewReportedComplete: sections.filter((section) => everyTrade(
      section,
      (state) => state.execution === 'crew-reported-complete',
    )).length,
    inspected: sections.filter((section) => everyTrade(
      section,
      (state) => wasInspected(state.inspection),
    )).length,
    notesAndPhotos,
    propertyAccepted: sections.filter((section) => everyTrade(
      section,
      (state) => state.propertyWalk === 'accepted',
    )).length,
    readyToWalk: selectTodayTaskQueue(task, 'ready-to-walk').records.length,
    releasedToday: sections.length,
    unresolvedSectionIds,
    waiting: selectTodayTaskQueue(task, 'waiting').records.length,
    working: selectTodayTaskQueue(task, 'working').records.length,
  };
}

export function closeDaySession(
  session: DaySession,
  review: EndDayReview,
  summary: EndDaySummary,
  recordedAt: string,
  recordedBy: string,
): CloseDayResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (session.status !== 'ending') errors.push('End Day review must begin before closing.');
  if (!review.explicitConfirmation) errors.push('Explicit End Day confirmation is required.');
  if (review.propertyReviewStatus !== 'reviewed') {
    warnings.push('The clipboard or wall-board review is still marked not reviewed.');
  }
  if (!review.endKeyStatus) {
    warnings.push('End Day key or access status was not recorded.');
  } else if (review.endKeyStatus !== 'yes') {
    warnings.push('Keys or access remain unresolved at End Day.');
  }
  if (summary.unresolvedSectionIds.length > 0) {
    warnings.push(
      `${summary.unresolvedSectionIds.length} released ${summary.unresolvedSectionIds.length === 1 ? 'section remains' : 'sections remain'} unresolved.`,
    );
  }
  if (errors.length > 0) return { errors, warnings };

  const closed: DaySession = {
    ...session,
    closedAt: recordedAt,
    endKeyStatus: review.endKeyStatus,
    endNote: review.endNote?.trim() || undefined,
    propertyCheckIn: review.propertyCheckIn?.trim() || undefined,
    propertyReviewStatus: review.propertyReviewStatus,
    status: 'closed',
  };

  return {
    closeEvent: createPersonalDayEvent({
      actorId: recordedBy,
      actorType: 'los',
      daySessionId: session.daySessionId,
      eventId: `${session.daySessionId}:closed:${recordedAt}`,
      eventType: 'day-session-closed',
      occurredAt: recordedAt,
      propertyId: session.propertyId,
      recordedAt,
      recordedBy,
      sourceId: session.daySessionId,
      sourceType: 'day-session',
      summary: summary.unresolvedSectionIds.length > 0
        ? `Los closed the personal Day Session with ${summary.unresolvedSectionIds.length} unresolved released sections.`
        : 'Los closed the personal Day Session after review.',
    }),
    errors,
    session: closed,
    warnings,
  };
}

export function getDayRecoveryDecision(
  sessions: readonly DaySession[],
  accountId: string,
  propertyId: string,
  currentDate: string,
): DayRecoveryDecision {
  const session = sessions.find((candidate) => (
    candidate.accountId === accountId
    && candidate.propertyId === propertyId
    && ACTIVE_DAY_STATUSES.has(candidate.status)
  ));
  if (!session) return { kind: 'none' };
  return {
    kind: session.date === currentDate ? 'restore-active' : 'date-rollover',
    session: { ...session },
  };
}

export function applyDayRolloverChoice(
  session: DaySession,
  choice: DayRolloverChoice,
  recordedAt: string,
): DaySession {
  if (!ACTIVE_DAY_STATUSES.has(session.status)) {
    throw new Error('Rollover recovery requires an active, ending, or reopened Day Session.');
  }
  if (choice === 'resume') {
    return { ...session, status: session.status === 'ending' ? 'ending' : 'active' };
  }
  if (choice === 'review-and-close') {
    return { ...session, status: 'ending' };
  }
  return { ...session, reopenedAt: recordedAt, status: 'reopened' };
}

export function reopenClosedDaySession(
  session: DaySession,
  recordedAt: string,
): DaySession {
  if (session.status !== 'closed') {
    throw new Error('Only a closed Day Session may be reopened as a correction.');
  }
  return {
    ...session,
    reopenedAt: recordedAt,
    status: 'reopened',
  };
}
