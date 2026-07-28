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
  getDayRecoveryDecision,
  getTodayTaskQueueCounts,
  markDaySessionEnding,
  reopenClosedDaySession,
  selectTodayTaskQueue,
  startDaySession,
  validateReleaseAgainstRoster,
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

const createStartReview = (release, overrides = {}) => ({
  accountId: SYNTHETIC_ACCOUNT_ID,
  activeCrewIdsByTrade: { Clean: ['clean-green'], Paint: ['paint-blue'] },
  crewReviewConfirmed: { Clean: true, Paint: true },
  date: SYNTHETIC_DATE,
  daySessionId: 'day-session-contract',
  explicitConfirmation: true,
  keyStatus: 'yes',
  propertyContact: release.propertyContact,
  propertyId: SYNTHETIC_PROPERTY_ID,
  releaseBatchIds: [release.id],
  startedBy: 'Los',
  ...overrides,
});

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

test('progress names one section metric, one Los-inspected milestone, actual, and target', () => {
  const task = createSyntheticTodayTask();
  const progress = calculateTodayTaskProgress(task);

  assert.deepEqual(progress, {
    actual: 48,
    copy: '48 of 112 released sections inspected by Los',
    metric: 'sections',
    milestone: 'los-inspected',
    percentage: 43,
    scope: 'today-confirmed-release',
    scopeLabel: 'Today’s confirmed release',
    target: 112,
  });
});

test('Home queue filters return only exact released section records', () => {
  const task = createSyntheticTodayTask();
  const counts = getTodayTaskQueueCounts(task);

  assert.deepEqual(counts, {
    callbacks: 6,
    'ready-to-walk': 34,
    waiting: 8,
    working: 16,
  });
  for (const [queueId, count] of Object.entries(counts)) {
    const queue = selectTodayTaskQueue(task, queueId);
    assert.equal(queue.records.length, count);
    assert.ok(queue.records.every((record) => task.sections.some((section) => (
      section.unitId === record.unitId && section.sectionId === record.sectionId
    ))));
  }

  const untouched = createTodayTask(
    createSyntheticRoster(),
    [createSyntheticRelease()],
    SYNTHETIC_DATE,
  );
  const emptyReady = selectTodayTaskQueue(untouched, 'ready-to-walk');
  assert.equal(emptyReady.records.length, 0);
  assert.equal(emptyReady.emptyMessage, 'No released sections are ready for a property walk.');
});

test('Start Day uses ten explicit steps, requires confirmation, and treats keys as access only', () => {
  const release = createSyntheticRelease();
  assert.deepEqual(START_DAY_STEPS, [
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
  ]);

  const missingConfirmation = startDaySession(
    createStartReview(release, { explicitConfirmation: false }),
    [release],
    [],
    '2026-08-03T12:15:00.000Z',
  );
  assert.deepEqual(missingConfirmation.errors, ['Explicit Start Day confirmation is required.']);

  const noKeys = startDaySession(
    createStartReview(release, { keyStatus: 'no' }),
    [release],
    [],
    '2026-08-03T12:15:00.000Z',
  );
  assert.ok(noKeys.session, 'confirmed release remains authorized even when access is unresolved');
  assert.equal(noKeys.session.keyStatus, 'no');
  assert.match(noKeys.warnings.join(' '), /No keys are recorded/u);
});

test('one active Day Session is allowed per property/account', () => {
  const release = createSyntheticRelease();
  const active = createSyntheticActiveSession(release).session;
  assert.ok(active);

  const conflict = startDaySession(
    createStartReview(release),
    [release],
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
  const events = createSyntheticEvents(active);
  const taskSnapshot = structuredClone(task);
  const summary = buildEndDaySummary(task, events);

  assert.deepEqual(summary, {
    assigned: 72,
    callbacksOpen: 6,
    callbacksResolved: 2,
    crewReportedComplete: 48,
    inspected: 48,
    notesAndPhotos: 2,
    propertyAccepted: 8,
    readyToWalk: 34,
    releasedToday: 112,
    unresolvedSectionIds: summary.unresolvedSectionIds,
    waiting: 8,
    working: 16,
  });
  assert.equal(summary.unresolvedSectionIds.length, 104);

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
  assert.match(result.warnings.join(' '), /104 released sections remain unresolved/u);
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
  const [component, model, types, css] = await Promise.all([
    readFeature('DayTaskWorkspace.tsx'),
    readFeature('model.ts'),
    readFeature('types.ts'),
    readFeature('track-b.css'),
  ]);
  const source = [component, model, types].join('\n');

  assert.match(source, /Paper remains authoritative/u);
  assert.match(source, /personal-record-only/u);
  assert.match(source, /Integration owns the source-first import route/u);
  assert.equal(/\bunlock(?:ed|ing)?\b/iu.test(source), false);
  assert.equal(/\bpayroll\b/iu.test(source), true, 'the boundary copy should explicitly deny payroll mutation');
  assert.equal(/\bAI\b|\bOCR\b|Whisper|Kimi/iu.test(source), false);
  assert.equal(/whole[- ]Unit Done/iu.test(source), false);
  assert.match(css, /font-size:\s*16px/u);
  assert.match(css, /min-height:\s*44px/u);
  assert.match(css, /overflow-x:\s*clip/u);
  assert.match(css, /@media \(max-width:\s*359px\)/u);
});
