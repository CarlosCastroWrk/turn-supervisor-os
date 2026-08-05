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
  TodayTaskGoal,
  TodayTaskProgress,
  TodayTaskQueue,
  TodayTaskQueueId,
  TodayTaskSection,
  TodayTaskTradeState,
  TrackBTrade,
} from './types';

export const START_DAY_STEPS = [
  'Confirm project and day',
  'Confirm property contact',
  'Confirm keys and access',
  'Confirm today’s released work',
  'Confirm active Paint and Clean crews',
  'Review hours and walkthrough defaults',
  'Morning note',
  'Review and Start Day',
] as const;

type EndDaySummaryCountKey = keyof Omit<
  EndDaySummary,
  'eventCountGrain' | 'operationalCountGrain' | 'unresolvedSectionTradeIds'
>;

export const END_DAY_SUMMARY_LABELS: Readonly<Record<EndDaySummaryCountKey, string>> = {
  assigned: 'Assigned · section-trades',
  callbacksOpen: 'Callbacks open · section-trades',
  callbacksResolved: 'Callbacks resolved · section-trades',
  crewReportedComplete: 'Crew reported complete · section-trades',
  inspected: 'Inspected · section-trades',
  notePhotoEvents: 'Notes/photos · events',
  propertyAccepted: 'Property accepted · section-trades',
  readyToWalk: 'Ready to walk · section-trades',
  releasedToday: 'Released today · section-trades',
  waiting: 'Waiting / Blocked · section-trades',
  working: 'Working · section-trades',
};

const ACTIVE_DAY_STATUSES = new Set<DaySession['status']>(['active', 'ending', 'reopened']);

const queueMetadata: Record<TodayTaskQueueId, Pick<TodayTaskQueue, 'emptyMessage' | 'label'>> = {
  callbacks: { emptyMessage: 'No released sections have an open callback.', label: 'Callbacks' },
  'needs-crew': {
    emptyMessage: 'Every released section has a crew.',
    label: 'Needs Crew',
  },
  'needs-inspection': {
    emptyMessage: 'Crew-completed work will appear here for your inspection.',
    label: 'Needs Inspection',
  },
  'ready-to-walk': {
    emptyMessage: 'No released sections are ready for a property walk.',
    label: 'Ready to walk',
  },
  waiting: { emptyMessage: 'Nothing is waiting or blocked.', label: 'Waiting / Blocked' },
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
const stableSectionTradeKey = (unitId: string, sectionId: string, trade: string) => (
  `${unitId}::${sectionId}::${trade}`
);
const taskSectionLineageKey = (section: TodayTaskSection) => (
  `${stableSectionKey(section.unitId, section.sectionId)}::${section.releaseBatchId}::${section.tradeStates
    .map((state) => state.trade)
    .sort()
    .join(',')}`
);
const exactIdsMatch = (left: readonly string[], right: readonly string[]) => (
  left.length === right.length
  && left.every((id) => right.includes(id))
  && right.every((id) => left.includes(id))
);
const exactStringMultisetMatch = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
};

const wasInspected = (state: LosInspectionState) => state !== 'pending';

export const passedInspection = (state: LosInspectionState) => (
  state === 'passed' || state === 'passed-after-callback'
);

const hasOpenCallback = (section: TodayTaskSection) => section.tradeStates.some(
  (state) => state.inspection === 'callback-required' || state.inspection === 'reinspection-pending',
);

interface SelectedReleaseResult {
  errors: readonly string[];
  releases: readonly DailyReleaseBatch[];
}

export interface SessionTaskProjectionResult {
  errors: readonly string[];
  task?: TodayTask;
}

export function validateSelectedReleaseSet(
  releaseBatchIds: readonly string[],
  releases: readonly DailyReleaseBatch[],
  propertyId: string,
  date: string,
): SelectedReleaseResult {
  const errors: string[] = [];
  const selected: DailyReleaseBatch[] = [];
  if (releaseBatchIds.length === 0) {
    return { errors: ['At least one confirmed daily release batch is required.'], releases: [] };
  }

  const duplicateIds = unique(
    releaseBatchIds.filter((id, index) => releaseBatchIds.indexOf(id) !== index),
  );
  duplicateIds.forEach((id) => errors.push(`Selected release batch ID ${id} is duplicated.`));

  for (const id of unique(releaseBatchIds)) {
    const matches = releases.filter((release) => release.id === id);
    if (matches.length === 0) {
      errors.push(`Selected release batch ID ${id} is missing.`);
      continue;
    }
    if (matches.length > 1) {
      errors.push(`Selected release batch ID ${id} resolves to multiple release records.`);
      continue;
    }
    const release = matches[0];
    selected.push(release);
    if (
      release.confirmationStatus !== 'confirmed'
      || !release.confirmedAt
      || !release.confirmedBy
    ) {
      errors.push(`Release batch ${id} is not explicitly confirmed.`);
    }
    if (release.propertyId !== propertyId) {
      errors.push(`Release batch ${id} does not match the selected property.`);
    }
    if (release.date !== date) {
      errors.push(`Release batch ${id} does not match the selected date.`);
    }
  }

  return { errors, releases: selected };
}

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

export function createTodayTaskGoal(task: TodayTask): TodayTaskGoal {
  return {
    metric: 'sections',
    milestone: 'los-inspected',
    scope: 'today-confirmed-release',
    target: task.sections.length,
  };
}

export function validateTodayTaskGoal(
  goal: TodayTaskGoal,
  task: TodayTask,
): readonly string[] {
  const errors: string[] = [];
  if (goal.scope !== 'today-confirmed-release') {
    errors.push('Today’s Task goal scope must be today-confirmed-release.');
  }
  if (goal.metric !== 'sections') {
    errors.push('Today’s Task goal metric must be sections.');
  }
  if (goal.milestone !== 'los-inspected') {
    errors.push('Today’s Task goal milestone must be los-inspected.');
  }
  if (goal.target !== task.sections.length) {
    errors.push(
      `Today’s Task goal target ${goal.target} does not match the exact selected release target ${task.sections.length}.`,
    );
  }
  return errors;
}

export function projectTodayTaskForSession(
  roster: PropertyRoster,
  releases: readonly DailyReleaseBatch[],
  session: DaySession,
  recordedTask?: TodayTask | null,
): SessionTaskProjectionResult {
  const selected = validateSelectedReleaseSet(
    session.releaseBatchIds,
    releases,
    session.propertyId,
    session.date,
  );
  const errors = [...selected.errors];
  if (roster.propertyId !== session.propertyId) {
    errors.push('Day Session property does not match the property roster.');
  }
  if (errors.length > 0) return { errors };

  let authorizedTask: TodayTask | null = null;
  try {
    authorizedTask = createTodayTask(
      roster,
      selected.releases,
      session.date,
      session.daySessionId,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Selected release validation failed.');
    return { errors };
  }
  if (!authorizedTask) {
    return { errors: ['The exact selected release IDs did not produce Today’s Task.'] };
  }
  if (!exactIdsMatch(authorizedTask.releaseBatchIds, session.releaseBatchIds)) {
    errors.push('Today’s Task release IDs do not exactly match DaySession.releaseBatchIds.');
  }
  errors.push(...validateTodayTaskGoal(session.goal, authorizedTask));

  if (recordedTask) {
    if (!exactIdsMatch(recordedTask.releaseBatchIds, session.releaseBatchIds)) {
      errors.push('Recorded Today’s Task release IDs do not exactly match DaySession.releaseBatchIds.');
    }
    if (recordedTask.daySessionId !== session.daySessionId) {
      errors.push('Recorded Today’s Task does not match the active Day Session.');
    }
    if (
      recordedTask.propertyId !== authorizedTask.propertyId
      || recordedTask.date !== authorizedTask.date
      || recordedTask.sections.length !== authorizedTask.sections.length
    ) {
      errors.push('Recorded Today’s Task does not match the exact selected release scope.');
    } else {
      const authorizedKeys = authorizedTask.sections.map(taskSectionLineageKey);
      const recordedKeys = recordedTask.sections.map(taskSectionLineageKey);
      if (!exactStringMultisetMatch(recordedKeys, authorizedKeys)) {
        errors.push(
          'Recorded Today’s Task section-trade scope does not exactly match '
          + 'the selected release or its release lineage.',
        );
      }
    }
  }

  if (errors.length > 0) return { errors };
  return {
    errors,
    task: recordedTask
      ? { ...recordedTask }
      : authorizedTask,
  };
}

export interface TodayTaskTradeProgress {
  trade: TrackBTrade;
  actual: number;
  target: number;
}

// Paint and Clean release on different days (paint first, cleans follow), so a
// unit-grain count reads "0 done" even when every clean is finished. Progress
// is therefore TRADE-grain everywhere: each trade counts only the units it was
// actually released for.
export function calculateTodayTaskTradeProgress(
  task: TodayTask | null,
): TodayTaskTradeProgress[] {
  const sections = task?.sections ?? [];
  return (['Paint', 'Clean'] as const).flatMap((trade) => {
    const tradeSections = sections.filter((section) =>
      section.tradeStates.some((state) => state.trade === trade));
    const unitIds = [...new Set(tradeSections.map((section) => section.unitId))];
    if (unitIds.length === 0) return [];
    const actual = unitIds.filter((unitId) =>
      tradeSections
        .filter((section) => section.unitId === unitId)
        .every((section) => section.tradeStates
          .filter((state) => state.trade === trade)
          .every((state) => wasInspected(state.inspection)))).length;
    return [{ actual, target: unitIds.length, trade }];
  });
}

export function calculateTodayTaskProgress(task: TodayTask | null): TodayTaskProgress {
  const trades = calculateTodayTaskTradeProgress(task);
  const target = trades.reduce((sum, line) => sum + line.target, 0);
  const actual = trades.reduce((sum, line) => sum + line.actual, 0);
  const percentage = target === 0 ? 0 : Math.min(100, Math.round((actual / target) * 100));
  const copy = trades.length === 0
    ? 'Nothing released yet today'
    : `${trades
      .map((line) => `${line.trade} ${line.actual}/${line.target}`)
      .join(' · ')} units inspected by Los`;

  return {
    actual,
    copy,
    metric: 'sections',
    milestone: 'los-inspected',
    percentage,
    scope: 'today-confirmed-release',
    scopeLabel: 'Today’s confirmed release',
    target,
    trades,
  };
}

export function selectTodayTaskQueue(
  task: TodayTask | null,
  queueId: TodayTaskQueueId,
): TodayTaskQueue {
  const source = task?.sections ?? [];
  // Ready to Walk is package-grain: precompute which unit+trades are fully ready
  // so a room only shows here when its whole unit+trade is — never split across
  // Ready to Walk and Callbacks at the same time.
  const walkReady = queueId === 'ready-to-walk'
    ? walkReadyPackageKeys(task)
    : new Set<string>();
  const records = source.filter((section) => {
    if (queueId === 'needs-crew') {
      return (
        section.waitingReasons.length === 0
        && section.tradeStates.some((state) => !state.assignedCrewId)
      );
    }
    if (queueId === 'needs-inspection') {
      return (
        section.waitingReasons.length === 0
        && !hasOpenCallback(section)
        && section.tradeStates.some((state) =>
          state.execution === 'crew-reported-complete'
          && !passedInspection(state.inspection))
      );
    }
    if (queueId === 'working') {
      return section.tradeStates.some((state) => state.execution === 'working');
    }
    if (queueId === 'waiting') {
      return section.waitingReasons.length > 0;
    }
    if (queueId === 'callbacks') {
      return hasOpenCallback(section);
    }
    // ready-to-walk: this room shows only if its whole unit+trade package is
    // ready (checked across ALL the unit's rooms), not just this room alone.
    return section.tradeStates.some((state) =>
      walkReady.has(`${section.unitId}:${state.trade}`));
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

// Ready to Walk is a Unit+Trade PACKAGE, not a room. A package is ready only
// when EVERY released room of that unit+trade passed Los inspection and is
// pending the walk — with no room in callback, needing inspection, or blocked.
// If even one room fails, the whole unit+trade stays out of Ready to Walk (it
// lives in Callbacks / Check instead) so a unit never shows in two queues at
// once. Returns the ready `${unitId}:${trade}` keys so the count and the queue
// use the exact same rule and always agree.
export function walkReadyPackageKeys(task: TodayTask | null): Set<string> {
  const keys = new Set<string>();
  if (!task) return keys;
  const byUnit = new Map<string, TodayTaskSection[]>();
  for (const section of task.sections) {
    const group = byUnit.get(section.unitId) ?? [];
    group.push(section);
    byUnit.set(section.unitId, group);
  }
  for (const [unitId, sections] of byUnit) {
    for (const trade of ['Paint', 'Clean'] as const) {
      const rooms = sections
        .map((section) => ({
          section,
          state: section.tradeStates.find((state) => state.trade === trade),
        }))
        .filter((room): room is { section: TodayTaskSection; state: TodayTaskTradeState } =>
          Boolean(room.state));
      if (rooms.length === 0) continue;
      // Every room of this unit+trade must be walk-ready: not blocked, not in
      // callback (callback-required/reinspection-pending aren't "passed"), and
      // passed + pending the walk.
      const ready = rooms.every(({ section, state }) =>
        section.waitingReasons.length === 0
        && passedInspection(state.inspection)
        && state.propertyWalk === 'pending');
      if (ready) keys.add(`${unitId}:${trade}`);
    }
  }
  return keys;
}

export function countReadyToWalkPackages(task: TodayTask | null): number {
  return walkReadyPackageKeys(task).size;
}

// Every queue counts Unit+Trade jobs — the grain Los thinks in — not
// individual sections.
const countQueueUnitTradeJobs = (
  task: TodayTask | null,
  queueId: TodayTaskQueueId,
): number => {
  const jobs = new Set<string>();
  for (const section of selectTodayTaskQueue(task, queueId).records) {
    for (const state of section.tradeStates) {
      const matches = queueId === 'needs-crew'
        ? !state.assignedCrewId
        : queueId === 'needs-inspection'
          ? state.execution === 'crew-reported-complete'
            && !passedInspection(state.inspection)
          : queueId === 'working'
            ? state.execution === 'working'
            : true;
      if (matches) jobs.add(`${section.unitId}:${state.trade}`);
    }
  }
  return jobs.size;
};

export function getTodayTaskQueueCounts(
  task: TodayTask | null,
): Readonly<Record<TodayTaskQueueId, number>> {
  return {
    callbacks: countQueueUnitTradeJobs(task, 'callbacks'),
    'needs-crew': countQueueUnitTradeJobs(task, 'needs-crew'),
    'needs-inspection': countQueueUnitTradeJobs(task, 'needs-inspection'),
    'ready-to-walk': countReadyToWalkPackages(task),
    waiting: countQueueUnitTradeJobs(task, 'waiting'),
    working: countQueueUnitTradeJobs(task, 'working'),
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
  roster: PropertyRoster,
  existingSessions: readonly DaySession[],
  recordedAt: string,
): StartDayResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!review.propertyId.trim()) errors.push('Property is required.');
  if (!review.date.trim()) errors.push('Date is required.');
  if (!review.propertyContact.trim()) errors.push('Property contact is required.');
  if (!review.workingHoursWording.trim()) errors.push('Exact working-hours wording is required.');
  if (!review.walkthroughScheduleWording.trim()) {
    errors.push('Walkthrough schedule wording is required.');
  }
  if (!review.assignmentEvidenceReviewNote.trim()) {
    errors.push('Assignment evidence / review note is required.');
  }
  if (!review.crewReviewConfirmed.Paint) errors.push('Paint crew review is required.');
  if (!review.crewReviewConfirmed.Clean) errors.push('Clean crew review is required.');
  if (!review.explicitConfirmation) errors.push('Explicit Start Day confirmation is required.');

  const selected = validateSelectedReleaseSet(
    review.releaseBatchIds,
    releases,
    review.propertyId,
    review.date,
  );
  errors.push(...selected.errors);
  if (roster.propertyId !== review.propertyId) {
    errors.push('Start Day property does not match the property roster.');
  }
  if (selected.errors.length === 0 && roster.propertyId === review.propertyId) {
    try {
      const task = createTodayTask(
        roster,
        selected.releases,
        review.date,
        review.daySessionId,
      );
      if (!task) {
        errors.push('The exact selected release IDs did not produce Today’s Task.');
      } else {
        if (!exactIdsMatch(task.releaseBatchIds, review.releaseBatchIds)) {
          errors.push('Today’s Task release IDs do not exactly match the selected release IDs.');
        }
        errors.push(...validateTodayTaskGoal(review.goal, task));
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Selected release validation failed.');
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
    assignmentEvidenceReviewNote: review.assignmentEvidenceReviewNote.trim(),
    date: review.date,
    daySessionId: review.daySessionId,
    goal: { ...review.goal },
    keyStatus: review.keyStatus,
    morningNote: review.morningNote?.trim() || undefined,
    propertyContact: review.propertyContact.trim(),
    propertyId: review.propertyId,
    releaseBatchIds: [...review.releaseBatchIds],
    startedAt: recordedAt,
    startedBy: review.startedBy,
    status: 'active',
    walkthroughScheduleWording: review.walkthroughScheduleWording.trim(),
    workingHoursWording: review.workingHoursWording.trim(),
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
  session: Pick<DaySession, 'daySessionId' | 'propertyId'>,
): EndDaySummary {
  const sections = task?.sections ?? [];
  const sectionTrades = sections.flatMap((section) => section.tradeStates.map((state) => ({
    id: stableSectionTradeKey(section.unitId, section.sectionId, state.trade),
    section,
    state,
  })));
  const notePhotoEvents = events.filter((event) => (
    event.propertyId === session.propertyId
    && event.daySessionId === session.daySessionId
    && (event.eventType === 'note-saved' || event.eventType === 'photo-saved')
  )).length;
  const unresolvedSectionTradeIds = sectionTrades
    .filter(({ state }) => state.propertyWalk !== 'accepted')
    .map(({ id }) => id);

  return {
    assigned: sectionTrades.filter(({ state }) => (
      Boolean(state.assignedCrewId) && state.execution !== 'unassigned'
    )).length,
    callbacksOpen: sectionTrades.filter(({ state }) => (
      state.inspection === 'callback-required' || state.inspection === 'reinspection-pending'
    )).length,
    callbacksResolved: sectionTrades.filter(
      ({ state }) => state.inspection === 'passed-after-callback',
    ).length,
    crewReportedComplete: sectionTrades.filter(
      ({ state }) => state.execution === 'crew-reported-complete',
    ).length,
    eventCountGrain: 'events',
    inspected: sectionTrades.filter(({ state }) => wasInspected(state.inspection)).length,
    notePhotoEvents,
    operationalCountGrain: 'section-trades',
    propertyAccepted: sectionTrades.filter(
      ({ state }) => state.propertyWalk === 'accepted',
    ).length,
    readyToWalk: sectionTrades.filter(({ section, state }) => (
      section.waitingReasons.length === 0
      && state.inspection !== 'callback-required'
      && state.inspection !== 'reinspection-pending'
      && passedInspection(state.inspection)
      && state.propertyWalk === 'pending'
    )).length,
    releasedToday: sectionTrades.length,
    unresolvedSectionTradeIds,
    waiting: sectionTrades.filter(({ section }) => section.waitingReasons.length > 0).length,
    working: sectionTrades.filter(({ state }) => state.execution === 'working').length,
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
  if (summary.unresolvedSectionTradeIds.length > 0) {
    warnings.push(
      `${summary.unresolvedSectionTradeIds.length} released ${summary.unresolvedSectionTradeIds.length === 1 ? 'section-trade remains' : 'section-trades remain'} unresolved.`,
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
      summary: summary.unresolvedSectionTradeIds.length > 0
        ? `Los closed the personal Day Session with ${summary.unresolvedSectionTradeIds.length} unresolved released section-trades.`
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
