import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  START_DAY_STEPS,
  applyDayRolloverChoice,
  buildEndDaySummary,
  calculateTodayTaskProgress,
  closeDaySession,
  createPersonalDayEvent,
  createTodayTask,
  createTodayTaskGoal,
  getDayRecoveryDecision,
  getTodayTaskQueueCounts,
  markDaySessionEnding,
  projectTodayTaskForSession,
  reopenClosedDaySession,
  selectTodayTaskQueue,
  startDaySession,
  validateSelectedReleaseSet,
  validateReleaseAgainstRoster,
  walkReadyPackageKeys,
} from '../src/features/wave2a2-track-b/model.ts';
import {
  SYNTHETIC_ACCOUNT_ID,
  SYNTHETIC_DATE,
  SYNTHETIC_PROPERTY_ID,
  createSyntheticActiveSession,
  createSyntheticEvents,
  createSyntheticRelease,
  createSyntheticRoster,
  createSyntheticTodayTask,
} from '../src/features/wave2a2-track-b/fixtures.ts';

const featureRoot = new URL('../src/features/wave2a2-track-b/', import.meta.url);
const readFeature = (name) => readFile(new URL(name, featureRoot), 'utf8');

const createStartReview = (release, overrides = {}, roster = createSyntheticRoster()) => {
  const task = createTodayTask(roster, [release], SYNTHETIC_DATE, 'day-session-contract');
  assert.ok(task);
  return {
    accountId: SYNTHETIC_ACCOUNT_ID,
    activeCrewIdsByTrade: { Clean: ['clean-green'], Paint: ['paint-blue'] },
    assignmentEvidenceReviewNote: 'Reviewed exact synthetic assignment evidence.',
    crewReviewConfirmed: { Clean: true, Paint: true },
    date: SYNTHETIC_DATE,
    daySessionId: 'day-session-contract',
    explicitConfirmation: true,
    goal: createTodayTaskGoal(task),
    keyStatus: 'yes',
    propertyContact: release.propertyContact,
    propertyId: SYNTHETIC_PROPERTY_ID,
    releaseBatchIds: [release.id],
    startedBy: 'Los',
    walkthroughScheduleWording: 'Daily walkthrough at 12:00 PM with the synthetic contact.',
    workingHoursWording: 'Occupied areas: 10:00 AM–5:00 PM; vacant areas may continue later.',
    ...overrides,
  };
};

test('PropertyRoster stays distinct from a confirmed 40-Unit DailyReleaseBatch', () => {
  const roster = createSyntheticRoster(500);
  const release = createSyntheticRelease(roster, 40);
  const releasedUnitIds = new Set(release.entries.map((entry) => entry.unitId));

  assert.equal(roster.units.length, 500);
  assert.equal(releasedUnitIds.size, 40);
  assert.equal(release.entries.length, 112);
  assert.equal(release.confirmationStatus, 'confirmed');
  assert.ok(release.confirmedAt);
  assert.ok(release.confirmedBy);
});

test('only an explicitly confirmed release creates Today’s Task', () => {
  const roster = createSyntheticRoster();
  const release = createSyntheticRelease(roster);
  const draft = {
    ...release,
    confirmedAt: undefined,
    confirmedBy: undefined,
    confirmationStatus: 'draft',
  };

  assert.equal(createTodayTask(roster, [], SYNTHETIC_DATE), null);
  assert.equal(createTodayTask(roster, [draft], SYNTHETIC_DATE), null);
  assert.equal(createTodayTask(roster, [release], '2026-08-04'), null);

  const task = createTodayTask(roster, [release], SYNTHETIC_DATE);
  assert.ok(task);
  assert.equal(task.sections.length, 112);
  assert.equal(new Set(task.sections.map((section) => section.unitId)).size, 40);
});

test('an incompatible confirmed release fails instead of inventing roster structure', () => {
  const roster = createSyntheticRoster();
  const release = createSyntheticRelease(roster);
  const incompatible = {
    ...release,
    entries: [{
      restrictions: [],
      sectionId: 'not-a-section',
      trades: ['Paint'],
      uncertainties: [],
      unitId: roster.units[0].id,
    }],
  };

  assert.deepEqual(validateReleaseAgainstRoster(roster, incompatible), [
    `Released section not-a-section is not applicable to Unit ${roster.units[0].unitNumber}.`,
  ]);
  assert.throws(
    () => createTodayTask(roster, [incompatible], SYNTHETIC_DATE),
    /Confirmed release is incompatible with the property roster/u,
  );
});

test('Start Day rejects every invalid selected release ID and validates the exact goal target', () => {
  const roster = createSyntheticRoster();
  const valid = createSyntheticRelease(roster);
  const invalidReleases = [
    {
      ...valid,
      confirmedAt: undefined,
      confirmedBy: undefined,
      confirmationStatus: 'draft',
      id: 'release-draft',
    },
    {
      ...valid,
      id: 'release-wrong-property',
      propertyId: 'another-property',
    },
    {
      ...valid,
      date: '2026-08-04',
      id: 'release-wrong-date',
    },
  ];

  for (const release of invalidReleases) {
    const result = startDaySession(
      createStartReview(valid, { releaseBatchIds: [valid.id, release.id] }),
      [valid, release],
      roster,
      [],
      '2026-08-03T12:15:00.000Z',
    );
    assert.equal(result.session, undefined, `${release.id} must reject the entire selected set`);
  }

  const missing = startDaySession(
    createStartReview(valid, { releaseBatchIds: [valid.id, 'release-missing'] }),
    [valid],
    roster,
    [],
    '2026-08-03T12:15:00.000Z',
  );
  assert.equal(missing.session, undefined);
  assert.match(missing.errors.join(' '), /release-missing is missing/u);

  const duplicate = startDaySession(
    createStartReview(valid, { releaseBatchIds: [valid.id, valid.id] }),
    [valid],
    roster,
    [],
    '2026-08-03T12:15:00.000Z',
  );
  assert.equal(duplicate.session, undefined);
  assert.match(duplicate.errors.join(' '), /is duplicated/u);

  const duplicateSource = validateSelectedReleaseSet(
    [valid.id],
    [valid, { ...valid }],
    SYNTHETIC_PROPERTY_ID,
    SYNTHETIC_DATE,
  );
  assert.match(duplicateSource.errors.join(' '), /multiple release records/u);

  const wrongGoal = startDaySession(
    createStartReview(valid, {
      goal: {
        metric: 'sections',
        milestone: 'los-inspected',
        scope: 'today-confirmed-release',
        target: 111,
      },
    }),
    [valid],
    roster,
    [],
    '2026-08-03T12:15:00.000Z',
  );
  assert.equal(wrongGoal.session, undefined);
  assert.match(wrongGoal.errors.join(' '), /target 111.*target 112/u);
});

test('active Today’s Task uses exactly DaySession.releaseBatchIds', () => {
  const roster = createSyntheticRoster();
  const selected = createSyntheticRelease(roster);
  const extra = {
    ...createSyntheticRelease(roster, 41),
    id: 'release-extra',
  };
  const active = createSyntheticActiveSession(selected, roster).session;
  assert.ok(active);

  const projection = projectTodayTaskForSession(roster, [selected, extra], active);
  assert.deepEqual(projection.errors, []);
  assert.ok(projection.task);
  assert.deepEqual(projection.task.releaseBatchIds, [selected.id]);
  assert.equal(projection.task.sections.length, 112);

  const recordedMismatch = {
    ...createSyntheticTodayTask(roster, selected, active.daySessionId),
    releaseBatchIds: [extra.id],
  };
  const rejectedRecordedTask = projectTodayTaskForSession(
    roster,
    [selected, extra],
    active,
    recordedMismatch,
  );
  assert.equal(rejectedRecordedTask.task, undefined);
  assert.match(rejectedRecordedTask.errors.join(' '), /do not exactly match/u);

  const wrongSessionTask = {
    ...createSyntheticTodayTask(roster, selected, 'another-day-session'),
  };
  const rejectedWrongSessionTask = projectTodayTaskForSession(
    roster,
    [selected],
    active,
    wrongSessionTask,
  );
  assert.equal(rejectedWrongSessionTask.task, undefined);
  assert.match(rejectedWrongSessionTask.errors.join(' '), /active Day Session/u);

  const duplicateScopeTask = structuredClone(
    createSyntheticTodayTask(roster, selected, active.daySessionId),
  );
  duplicateScopeTask.sections[1] = structuredClone(duplicateScopeTask.sections[0]);
  const rejectedDuplicateScope = projectTodayTaskForSession(
    roster,
    [selected],
    active,
    duplicateScopeTask,
  );
  assert.equal(rejectedDuplicateScope.task, undefined);
  assert.match(rejectedDuplicateScope.errors.join(' '), /scope does not exactly match/u);

  const tamperedSectionLineage = structuredClone(
    createSyntheticTodayTask(roster, selected, active.daySessionId),
  );
  tamperedSectionLineage.sections[0].releaseBatchId = extra.id;
  const rejectedSectionLineage = projectTodayTaskForSession(
    roster,
    [selected, extra],
    active,
    tamperedSectionLineage,
  );
  assert.equal(rejectedSectionLineage.task, undefined);
  assert.match(rejectedSectionLineage.errors.join(' '), /release lineage/u);

  const missingSelectedId = projectTodayTaskForSession(
    roster,
    [selected],
    { ...active, releaseBatchIds: [selected.id, 'release-missing'] },
  );
  assert.equal(missingSelectedId.task, undefined);
  assert.match(missingSelectedId.errors.join(' '), /release-missing is missing/u);
});

test('progress names one section metric, one Los-inspected milestone, actual, and target', () => {
  const task = createSyntheticTodayTask();
  const progress = calculateTodayTaskProgress(task);

  // Trade-grain (Aug 1): paint releases first, cleans follow — each trade
  // counts its own units so a finished clean day never reads "0 done".
  assert.deepEqual(progress, {
    actual: 32,
    copy: 'Paint 16/40 · Clean 16/40 units inspected by Los',
    metric: 'sections',
    milestone: 'los-inspected',
    percentage: 40,
    scope: 'today-confirmed-release',
    scopeLabel: 'Today’s confirmed release',
    target: 80,
    trades: [
      { actual: 16, target: 40, trade: 'Paint' },
      { actual: 16, target: 40, trade: 'Clean' },
    ],
  });
});

test('Home queue filters return only exact released section records', () => {
  const task = createSyntheticTodayTask();
  const counts = getTodayTaskQueueCounts(task);

  // Every queue counts Unit+Trade jobs; queue detail pages list the
  // underlying section records grouped per job.
  assert.deepEqual(counts, {
    callbacks: 4,
    'needs-crew': 32,
    'needs-inspection': 0,
    'ready-to-walk': 22,
    waiting: 6,
    working: 12,
  });
  // Package-grain: a room shows in Ready to Walk only when its whole unit+trade
  // is ready — the stray room from a not-fully-ready unit is excluded (33, not 34).
  assert.equal(selectTodayTaskQueue(task, 'ready-to-walk').records.length, 33);
  for (const queueId of Object.keys(counts)) {
    const queue = selectTodayTaskQueue(task, queueId);
    assert.ok(queue.records.every((record) => task.sections.some((section) => (
      section.unitId === record.unitId && section.sectionId === record.sectionId
    ))));
  }

  const firstReady = selectTodayTaskQueue(task, 'ready-to-walk').records[0];
  assert.ok(firstReady);
  const notExplicitlyPending = {
    ...task,
    sections: task.sections.map((section) => (
      section.unitId === firstReady.unitId && section.sectionId === firstReady.sectionId
        ? {
            ...section,
            tradeStates: section.tradeStates.map((state, index) => (
              index === 0 ? { ...state, propertyWalk: 'not-ready' } : state
            )),
          }
        : section
    )),
  };
  // Package-grain: making ONE room not-pending drops the whole unit+trade out of
  // Ready to Walk (22 → 21 packages) — it never sits half in walk, half elsewhere.
  assert.equal(
    getTodayTaskQueueCounts(notExplicitlyPending)['ready-to-walk'],
    21,
    'Ready to walk is package-grain: one room not pending drops the whole unit+trade',
  );

  const untouched = createTodayTask(
    createSyntheticRoster(),
    [createSyntheticRelease()],
    SYNTHETIC_DATE,
  );
  const emptyReady = selectTodayTaskQueue(untouched, 'ready-to-walk');
  assert.equal(emptyReady.records.length, 0);
  assert.equal(emptyReady.emptyMessage, 'No units are ready for a property walk yet.');
});

test('a callback in ONE room pulls that whole unit+trade out of Ready to Walk (into Callbacks)', () => {
  const task = createSyntheticTodayTask();
  // Find a unit+trade package that IS ready to walk, then put ONE of its rooms
  // in callback. That unit+trade must leave Ready to Walk entirely.
  const ready = selectTodayTaskQueue(task, 'ready-to-walk').records[0];
  assert.ok(ready, 'need a walk-ready unit to start from');
  const readyTrade = task.sections
    .find((section) => section.unitId === ready.unitId && section.sectionId === ready.sectionId)
    ?.tradeStates[0]?.trade;
  const packageKey = `${ready.unitId}:${readyTrade}`;
  assert.ok(walkReadyPackageKeys(task).has(packageKey), 'package starts walk-ready');

  const withCallback = {
    ...task,
    sections: task.sections.map((section) =>
      section.unitId === ready.unitId && section.sectionId === ready.sectionId
        ? {
            ...section,
            tradeStates: section.tradeStates.map((state) =>
              state.trade === readyTrade
                ? { ...state, inspection: 'callback-required' }
                : state),
          }
        : section),
  };

  // The whole unit+trade package must leave Ready to Walk once one room callbacks.
  assert.equal(
    walkReadyPackageKeys(withCallback).has(packageKey),
    false,
    'a room in callback pulls the whole unit+trade out of Ready to Walk',
  );
  assert.ok(
    selectTodayTaskQueue(withCallback, 'callbacks').records.some((record) =>
      record.unitId === ready.unitId),
    'and the unit appears in Callbacks',
  );
});

test('Start Day uses eight grouped steps, requires confirmation, and treats keys as access only', () => {
  const roster = createSyntheticRoster();
  const release = createSyntheticRelease(roster);
  assert.deepEqual(START_DAY_STEPS, [
    'Confirm project and day',
    'Confirm property contact',
    'Confirm keys and access',
    'Confirm today’s released work',
    'Confirm active Paint and Clean crews',
    'Review hours and walkthrough defaults',
    'Morning note',
    'Review and Start Day',
  ]);

  const missingConfirmation = startDaySession(
    createStartReview(release, { explicitConfirmation: false }),
    [release],
    roster,
    [],
    '2026-08-03T12:15:00.000Z',
  );
  assert.deepEqual(missingConfirmation.errors, ['Explicit Start Day confirmation is required.']);

  const noKeys = startDaySession(
    createStartReview(release, { keyStatus: 'no' }),
    [release],
    roster,
    [],
    '2026-08-03T12:15:00.000Z',
  );
  assert.ok(noKeys.session, 'confirmed release remains authorized even when access is unresolved');
  assert.equal(noKeys.session.keyStatus, 'no');
  assert.equal(
    noKeys.session.assignmentEvidenceReviewNote,
    'Reviewed exact synthetic assignment evidence.',
  );
  assert.equal(
    noKeys.session.workingHoursWording,
    'Occupied areas: 10:00 AM–5:00 PM; vacant areas may continue later.',
  );
  assert.equal(
    noKeys.session.walkthroughScheduleWording,
    'Daily walkthrough at 12:00 PM with the synthetic contact.',
  );
  assert.deepEqual(noKeys.session.goal, {
    metric: 'sections',
    milestone: 'los-inspected',
    scope: 'today-confirmed-release',
    target: 112,
  });
  assert.match(noKeys.warnings.join(' '), /No keys are recorded/u);
});

test('one active Day Session is allowed per property/account', () => {
  const roster = createSyntheticRoster();
  const release = createSyntheticRelease(roster);
  const active = createSyntheticActiveSession(release, roster).session;
  assert.ok(active);

  const conflict = startDaySession(
    createStartReview(release),
    [release],
    roster,
    [active],
    '2026-08-03T12:20:00.000Z',
  );

  assert.equal(conflict.session, undefined);
  assert.match(conflict.errors.join(' '), /already active for this property and account/u);
});

test('recordedAt is required and remains distinct from optional occurredAt', () => {
  assert.throws(
    () => createPersonalDayEvent({
      actorId: 'Los',
      actorType: 'los',
      daySessionId: 'day-session-contract',
      eventId: 'event-missing-recorded',
      eventType: 'note-saved',
      propertyId: SYNTHETIC_PROPERTY_ID,
      recordedAt: '',
      recordedBy: 'Los',
      sourceType: 'personal-entry',
      summary: 'Exact wording.',
    }),
    /recordedAt is required/u,
  );

  const event = createPersonalDayEvent({
    actorId: 'Los',
    actorType: 'los',
    daySessionId: 'day-session-contract',
    eventId: 'event-recorded-later',
    eventType: 'note-saved',
    occurredAt: '2026-08-03T13:00:00.000Z',
    propertyId: SYNTHETIC_PROPERTY_ID,
    recordedAt: '2026-08-03T13:17:00.000Z',
    recordedBy: 'Los',
    sourceType: 'personal-entry',
    summary: 'Exact wording.',
  });
  assert.equal(event.occurredAt, '2026-08-03T13:00:00.000Z');
  assert.equal(event.recordedAt, '2026-08-03T13:17:00.000Z');
  assert.equal(event.personalOfficialBoundary, 'personal-record-only');
});

test('End Day summarizes deterministically and preserves unresolved work', () => {
  const task = createSyntheticTodayTask();
  const active = createSyntheticActiveSession().session;
  assert.ok(active);
  const linkedEvents = createSyntheticEvents(active);
  const events = [
    ...linkedEvents,
    {
      ...linkedEvents[0],
      daySessionId: 'another-day-session',
      eventId: 'wrong-session-note',
    },
    {
      ...linkedEvents[1],
      eventId: 'wrong-property-photo',
      propertyId: 'another-property',
    },
  ];
  const taskSnapshot = structuredClone(task);
  const summary = buildEndDaySummary(task, events, active);

  assert.deepEqual(summary, {
    assigned: 144,
    callbacksOpen: 12,
    callbacksResolved: 4,
    crewReportedComplete: 96,
    eventCountGrain: 'events',
    inspected: 96,
    notePhotoEvents: 2,
    operationalCountGrain: 'section-trades',
    propertyAccepted: 16,
    readyToWalk: 68,
    releasedToday: 224,
    unresolvedSectionTradeIds: summary.unresolvedSectionTradeIds,
    waiting: 16,
    working: 32,
  });
  assert.equal(summary.unresolvedSectionTradeIds.length, 208);
  assert.ok(summary.unresolvedSectionTradeIds.every((id) => /::(?:Paint|Clean)$/u.test(id)));

  const pendingTradeChangedToNotReady = structuredClone(task);
  const firstPendingSection = pendingTradeChangedToNotReady.sections.find((section) => (
    section.tradeStates.some((state) => state.propertyWalk === 'pending')
  ));
  assert.ok(firstPendingSection);
  const firstPendingTrade = firstPendingSection.tradeStates.find(
    (state) => state.propertyWalk === 'pending',
  );
  assert.ok(firstPendingTrade);
  firstPendingTrade.propertyWalk = 'not-ready';
  const strictReadySummary = buildEndDaySummary(pendingTradeChangedToNotReady, events, active);
  assert.equal(
    strictReadySummary.readyToWalk,
    67,
    'section-trade Ready to walk counts only explicit pending property-walk states',
  );

  const result = closeDaySession(
    markDaySessionEnding(active),
    {
      endNote: 'Exact synthetic end note.',
      endKeyStatus: 'partial-issue',
      explicitConfirmation: true,
      propertyCheckIn: 'Checked in with synthetic contact.',
      propertyReviewStatus: 'reviewed',
    },
    summary,
    '2026-08-03T23:00:00.000Z',
    'Los',
  );

  assert.ok(result.session);
  assert.equal(result.session.status, 'closed');
  assert.equal(result.session.keyStatus, active.keyStatus, 'Start Day key observation must be preserved');
  assert.equal(result.session.endKeyStatus, 'partial-issue');
  assert.equal(result.session.propertyCheckIn, 'Checked in with synthetic contact.');
  assert.match(result.warnings.join(' '), /Keys or access remain unresolved at End Day/u);
  assert.match(result.warnings.join(' '), /208 released section-trades remain unresolved/u);
  assert.deepEqual(task, taskSnapshot, 'End Day must not convert unresolved work into completion');
});

test('active-day restore, date rollover choices, and closed-session correction are explicit', () => {
  const fixture = createSyntheticActiveSession().session;
  const active = fixture ? { ...fixture, keyStatus: 'partial-issue' } : undefined;
  assert.ok(active);

  assert.equal(
    getDayRecoveryDecision([active], SYNTHETIC_ACCOUNT_ID, SYNTHETIC_PROPERTY_ID, SYNTHETIC_DATE).kind,
    'restore-active',
  );
  const rollover = getDayRecoveryDecision(
    [active],
    SYNTHETIC_ACCOUNT_ID,
    SYNTHETIC_PROPERTY_ID,
    '2026-08-04',
  );
  assert.equal(rollover.kind, 'date-rollover');
  for (const [choice, status] of [
    ['resume', 'active'],
    ['review-and-close', 'ending'],
    ['reopen-as-correction', 'reopened'],
  ]) {
    const recovered = applyDayRolloverChoice(active, choice, '2026-08-04T12:00:00.000Z');
    assert.equal(recovered.status, status);
    assert.equal(recovered.keyStatus, 'partial-issue');
    assert.equal(recovered.endKeyStatus, undefined);
  }

  const closed = {
    ...active,
    closedAt: '2026-08-03T23:00:00.000Z',
    endKeyStatus: 'yes',
    status: 'closed',
  };
  const reopened = reopenClosedDaySession(closed, '2026-08-04T12:00:00.000Z');
  assert.equal(reopened.status, 'reopened');
  assert.equal(reopened.keyStatus, 'partial-issue');
  assert.equal(reopened.endKeyStatus, 'yes');
});

test('500-Unit roster and 40-Unit release projections remain bounded', () => {
  const iterations = 250;
  const startedAt = performance.now();
  let checksum = 0;

  for (let index = 0; index < iterations; index += 1) {
    const roster = createSyntheticRoster(500);
    const release = createSyntheticRelease(roster, 40);
    const task = createTodayTask(roster, [release], SYNTHETIC_DATE);
    checksum += task?.sections.length ?? 0;
    checksum += selectTodayTaskQueue(task, 'working').records.length;
  }

  const durationMs = performance.now() - startedAt;
  assert.equal(checksum, iterations * 112);
  assert.ok(durationMs < 1_500, `Track B projections took ${durationMs.toFixed(1)}ms.`);
  console.log(`Track B model performance: ${iterations} projections in ${durationMs.toFixed(1)}ms.`);
});

test('feature source preserves integration and operational boundaries', async () => {
  const [component, model, types, css, previewCss] = await Promise.all([
    readFeature('DayTaskWorkspace.tsx'),
    readFeature('model.ts'),
    readFeature('types.ts'),
    readFeature('track-b.css'),
    readFeature('preview.css'),
  ]);
  const source = [component, model, types].join('\n');

  assert.match(source, /Paper remains authoritative/u);
  assert.match(source, /personal-record-only/u);
  assert.match(source, /Manual release review opened\. Record exactly what the property released\./u);
  assert.equal(/\bunlock(?:ed|ing)?\b/iu.test(source), false);
  assert.equal(/\bpayroll\b/iu.test(source), true, 'the boundary copy should explicitly deny payroll mutation');
  assert.equal(/\bAI\b|\bOCR\b|Whisper|Kimi/iu.test(source), false);
  assert.equal(/whole[- ]Unit Done/iu.test(source), false);
  assert.match(css, /font-size:\s*16px/u);
  assert.match(css, /min-height:\s*44px/u);
  assert.match(css, /overflow-x:\s*clip/u);
  assert.match(css, /@media \(max-width:\s*359px\)/u);
  assert.match(css, /--w2a2b-cta:\s*#0969c3/u);
  assert.match(css, /--w2a2b-warning:\s*#7a4700/u);
  assert.equal(/--w2a2b-cta:\s*var\(/u.test(css), false);
  assert.equal(/--w2a2b-warning:\s*var\(/u.test(css), false);
  assert.match(css, /button\.w2a2b-primary-button\s*\{[^}]*color:\s*#ffffff/su);
  assert.equal(/--cta\s*:/u.test(previewCss), false);
  assert.equal(/--amber\s*:/u.test(previewCss), false);
});
