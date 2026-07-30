import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  appendManualReleaseBatchToActiveDay,
  createManualReleaseBatch,
  projectPropertyRoster,
  projectTrackCState,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import { projectTrackCAssignmentEligibility } from '../src/features/wave2a2-track-c/projections.ts';
import {
  parseJsonBackup,
  parseStoredAppData,
  StoredAppDataValidationError,
} from '../src/lib/backups.ts';
import type {
  AppData,
  DailyReleaseBatch,
  DaySession,
  FieldEvent,
} from '../src/types.ts';

const cloneSeed = (): AppData => structuredClone(seedData);
const projectId = seedData.activeProjectId;
const unitId = seedData.units[0].id;

const release = (
  id: string,
  date: string,
  confirmedAt: string,
  targetUnitId = unitId,
  trade: 'paint' | 'clean' = 'paint',
): DailyReleaseBatch => ({
  confirmedAt,
  confirmedBy: 'Los',
  createdAt: confirmedAt,
  date,
  id,
  items: [{
    id: `${id}:item:1`,
    section: 'A',
    sourceExcerpt: 'Confirmed test release.',
    trade,
    unitId: targetUnitId,
  }],
  projectId,
  propertyContact: 'Property contact',
  sourceLabel: 'Manual test release',
  sourceType: 'manual',
  status: 'confirmed',
  uncertainties: [],
  updatedAt: confirmedAt,
});

const day = (
  id: string,
  date: string,
  status: DaySession['status'],
  releaseBatchIds: string[],
  startedAt: string,
  endedAt?: string,
): DaySession => ({
  activeCleanCrewIds: ['crew_cleaner'],
  activePaintCrewIds: ['crew_painter'],
  createdAt: startedAt,
  date,
  endedAt,
  endKeyStatus: endedAt ? 'yes' : undefined,
  endNote: endedAt ? 'Closed in test.' : '',
  id,
  keyStatus: 'yes',
  morningNote: '',
  projectId,
  propertyContact: 'Property contact',
  releaseBatchIds,
  startedAt,
  startedBy: 'Los',
  status,
  updatedAt: endedAt ?? startedAt,
});

const fieldEvent = (
  id: string,
  daySessionId: string,
  eventType: string,
  recordedAt: string,
): FieldEvent => ({
  actorId: 'Los',
  actorType: 'los',
  boundary: eventType.startsWith('property-') ? 'property-reported' : 'personal-record',
  daySessionId,
  eventType,
  id,
  projectId,
  recordedAt,
  recordedBy: 'Los',
  section: 'A',
  sourceType: 'personal-confirmation',
  summary: eventType,
  trade: 'paint',
  unitId,
});

test('midday release commits the batch, active-Day link, and receipt event as one idempotent update', () => {
  const data = cloneSeed();
  const activeDay = day(
    'day-1',
    '2026-07-30',
    'active',
    ['release-1'],
    '2026-07-30T12:00:00.000Z',
  );
  data.daySessions = [activeDay];
  data.dailyReleaseBatches = [
    release('release-1', '2026-07-30', '2026-07-30T12:00:00.000Z'),
  ];
  const roster = projectPropertyRoster(data);
  const batch = createManualReleaseBatch({
    actor: 'Los',
    date: activeDay.date,
    id: 'midday-release',
    propertyContact: 'Property contact',
    recordedAt: '2026-07-30T16:00:00.000Z',
    roster,
    selections: [{ section: 'B', trade: 'clean', unitId }],
  });

  const committed = appendManualReleaseBatchToActiveDay(data, batch);
  assert.deepEqual(
    committed.daySessions[0].releaseBatchIds,
    ['release-1', 'midday-release'],
  );
  assert.equal(
    committed.fieldEvents.filter((event) =>
      event.eventType === 'daily-release-confirmed').length,
    1,
  );
  assert.equal(committed.dailyReleaseBatches.at(-1)?.id, 'midday-release');

  const retried = appendManualReleaseBatchToActiveDay(committed, batch);
  assert.equal(retried.dailyReleaseBatches.length, committed.dailyReleaseBatches.length);
  assert.equal(retried.daySessions[0].releaseBatchIds.length, 2);
  assert.equal(retried.fieldEvents.length, committed.fieldEvents.length);
});

test('midday release refuses to create an orphan batch before Start Day', () => {
  const data = cloneSeed();
  const batch = release(
    'orphan-midday-release',
    '2026-07-30',
    '2026-07-30T16:00:00.000Z',
  );
  const before = JSON.stringify(data);
  assert.throws(
    () => appendManualReleaseBatchToActiveDay(data, batch),
    /Start the day before confirming released work/,
  );
  assert.equal(JSON.stringify(data), before);
});

test('Day 1 project truth survives End Day and remains terminal during Day 2', () => {
  const data = cloneSeed();
  const dayOneRelease = release(
    'release-day-1',
    '2026-07-30',
    '2026-07-30T12:00:00.000Z',
  );
  const dayTwoRelease = release(
    'release-day-2',
    '2026-07-31',
    '2026-07-31T12:00:00.000Z',
    seedData.units[1].id,
    'clean',
  );
  data.dailyReleaseBatches = [dayOneRelease, dayTwoRelease];
  data.daySessions = [
    day(
      'day-1',
      '2026-07-30',
      'closed',
      [dayOneRelease.id],
      '2026-07-30T11:00:00.000Z',
      '2026-07-30T22:00:00.000Z',
    ),
    day(
      'day-2',
      '2026-07-31',
      'active',
      [dayTwoRelease.id],
      '2026-07-31T11:00:00.000Z',
    ),
  ];
  data.fieldEvents = [
    fieldEvent('z-assigned', 'day-1', 'assignment-confirmed', '2026-07-30T13:00:00.000Z'),
    fieldEvent('work-started', 'day-1', 'work-started', '2026-07-30T14:00:00.000Z'),
    fieldEvent('crew-complete', 'day-1', 'crew-reported-complete', '2026-07-30T15:00:00.000Z'),
    fieldEvent('los-pass', 'day-1', 'los-passed', '2026-07-30T16:00:00.000Z'),
    fieldEvent('property-accepted', 'day-1', 'property-accepted', '2026-07-30T17:00:00.000Z'),
  ].map((event) =>
    event.id === 'z-assigned'
      ? { ...event, reportedBy: 'crew_painter' }
      : event);

  const state = projectTrackCState(data);
  const target = { section: 'A' as const, trade: 'paint' as const, unitId };
  const projection = state.units
    .find((unit) => unit.id === unitId)
    ?.workFacts.find((fact) =>
      fact.section === target.section && fact.trade === target.trade);
  assert.equal(projection?.release, 'released');
  assert.deepEqual(
    state.events.map((event) => event.id),
    ['z-assigned', 'work-started', 'crew-complete', 'los-pass', 'property-accepted'],
  );
  const eligibility = projectTrackCAssignmentEligibility(state, target);
  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.includes('Property-accepted work cannot be assigned again.'));
  assert.equal(eligibility.projection?.property, 'property-accepted');
});

test('Day 2 can close a walk for Day 1 Ready-to-Walk scope without duplicate release', () => {
  const data = cloneSeed();
  const dayOneRelease = release(
    'release-day-1',
    '2026-07-30',
    '2026-07-30T12:00:00.000Z',
  );
  const dayTwoRelease = release(
    'release-day-2',
    '2026-07-31',
    '2026-07-31T12:00:00.000Z',
    seedData.units[1].id,
    'clean',
  );
  data.dailyReleaseBatches = [dayOneRelease, dayTwoRelease];
  data.daySessions = [
    day(
      'day-1',
      '2026-07-30',
      'closed',
      [dayOneRelease.id],
      '2026-07-30T11:00:00.000Z',
      '2026-07-30T22:00:00.000Z',
    ),
    day(
      'day-2',
      '2026-07-31',
      'active',
      [dayTwoRelease.id],
      '2026-07-31T11:00:00.000Z',
    ),
  ];
  data.fieldEvents = [
    fieldEvent('los-pass', 'day-1', 'los-passed', '2026-07-30T16:00:00.000Z'),
  ];
  data.walkSessions = [{
    createdAt: '2026-07-31T14:00:00.000Z',
    daySessionId: 'day-2',
    endedAt: '2026-07-31T15:00:00.000Z',
    id: 'walk-day-2',
    outcomes: [{
      outcome: 'accepted',
      selectedItemId: dayOneRelease.items[0].id,
    }],
    projectId,
    propertyContact: 'Property contact',
    selectedItemIds: [dayOneRelease.items[0].id],
    startedAt: '2026-07-31T14:00:00.000Z',
    startedBy: 'Los',
    status: 'closed',
    updatedAt: '2026-07-31T15:00:00.000Z',
  }];

  const restored = parseJsonBackup(JSON.stringify(data));
  assert.equal(restored.walkSessions[0].selectedItemIds[0], dayOneRelease.items[0].id);
  assert.deepEqual(restored.daySessions[1].releaseBatchIds, [dayTwoRelease.id]);
});

test('stored-data parser warns on recoverable lifecycle drift but blocks duplicate stable IDs', () => {
  const recoverable = cloneSeed();
  recoverable.dailyReleaseBatches = [
    release('release-1', '2026-07-30', '2026-07-30T12:00:00.000Z'),
  ];
  recoverable.daySessions = [
    day(
      'day-1',
      '2026-07-30',
      'closed',
      ['release-1'],
      '2026-07-30T11:00:00.000Z',
    ),
  ];
  const parsed = parseStoredAppData(JSON.stringify(recoverable));
  assert.equal(parsed.data.daySessions.length, 1);
  assert.ok(parsed.warnings.some((warning) =>
    warning.message === 'A closed Day Session requires endedAt.'));

  const fatal = structuredClone(recoverable);
  fatal.daySessions = [
    { ...fatal.daySessions[0], endedAt: '2026-07-30T22:00:00.000Z' },
    { ...fatal.daySessions[0], endedAt: '2026-07-30T22:00:00.000Z' },
  ];
  assert.throws(
    () => parseStoredAppData(JSON.stringify(fatal)),
    (error: unknown) => (
      error instanceof StoredAppDataValidationError
      && error.issues.some((issue) => issue.message.includes('Duplicate record id'))
    ),
  );
});
