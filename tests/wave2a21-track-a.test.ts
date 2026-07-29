import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import type {
  FieldEvent,
  Project,
} from '../src/types.ts';
import type { TodayTask } from '../src/features/wave2a2-track-b/types.ts';
import type {
  TrackCConfirmedEvent,
  TrackCState,
} from '../src/features/wave2a2-track-c/model.ts';
import {
  activateProjectLocally,
} from '../src/features/wave2a21-track-a/activation.ts';
import {
  adaptDurableFieldEventsToActivity,
} from '../src/features/wave2a21-track-a/activity.ts';
import {
  adaptAppDataForTrackA,
} from '../src/features/wave2a21-track-a/appDataAdapter.ts';
import type {
  ProjectActivationDraft,
  ProjectConfiguration,
  PropertyContact,
  TrackAAppData,
  TrackAProject,
} from '../src/features/wave2a21-track-a/contracts.ts';
import {
  buildCanonicalFieldProjection,
  buildCanonicalFieldProjectionFromAppData,
} from '../src/features/wave2a21-track-a/projections.ts';
import {
  START_DAY_EIGHT_STEP_CONTRACT,
  createStartDaySavedDefaults,
  getStartDayStepContract,
} from '../src/features/wave2a21-track-a/startDayDefaults.ts';

const NOW = '2026-07-29T14:00:00.000Z';
const PROJECT_ID = 'project-wave2a21-track-a';
const DAY_SESSION_ID = 'day-session-wave2a21-track-a';

const createProject = (): TrackAProject => ({
  ...(structuredClone(seedData.projects[0]) as Project),
  createdAt: NOW,
  endDate: '2026-08-15',
  id: PROJECT_ID,
  location: 'Austin, Texas',
  mode: 'real',
  name: 'Moon Tower personal supervisor project',
  projectManagerName: 'Property contact',
  propertyName: 'Moon Tower',
  startDate: '2026-08-01',
  supervisorName: 'Los',
  updatedAt: NOW,
});

const createContacts = (): readonly PropertyContact[] => [{
  createdAt: NOW,
  id: 'contact-tony',
  isPrimary: true,
  name: 'Tony',
  phone: 'synthetic-only',
  projectId: PROJECT_ID,
  title: 'Property contact',
  updatedAt: NOW,
}];

const createConfiguration = (): ProjectConfiguration => ({
  activatedAt: NOW,
  activatedBy: 'Los',
  defaultCrewIdsByTrade: {
    clean: ['crew-clean'],
    paint: ['crew-paint'],
  },
  defaultPropertyContactId: 'contact-tony',
  defaultWalkthroughScheduleWording: 'Daily walkthrough at noon.',
  defaultWorkingHoursWording: 'Occupied areas 10 AM–5 PM; vacant areas later.',
  enabledTrades: { clean: true, paint: true },
  permissions: {
    officialApprovals: false,
    paperTurnBoardAuthoritative: true,
    payrollCalculations: false,
    personalAppData: 'synthetic-or-explicitly-approved-only',
    photos: 'not-confirmed',
  },
  projectId: PROJECT_ID,
  role: 'turn-supervisor',
  status: 'active',
  version: 1,
});

const createData = (): TrackAAppData => ({
  ...structuredClone(seedData),
  activeProjectId: seedData.activeProjectId,
  fieldEvents: [],
  projects: structuredClone(seedData.projects),
  propertyContacts: [],
});

const createDraft = (
  overrides: Partial<ProjectActivationDraft> = {},
): ProjectActivationDraft => ({
  configuration: createConfiguration(),
  confirmOverwrite: false,
  contacts: createContacts(),
  project: createProject(),
  ...overrides,
});

test('atomic local activation adds one project, its contacts, active scope, and one personal event', () => {
  const data = createData();
  const before = structuredClone(data);
  const draft = createDraft();
  const result = activateProjectLocally(data, draft);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.changed, true);
  assert.equal(result.data.activeProjectId, PROJECT_ID);
  assert.equal(result.data.projects.filter((project) => project.id === PROJECT_ID).length, 1);
  assert.deepEqual(result.data.propertyContacts, createContacts());
  assert.equal(result.data.fieldEvents.filter((event) =>
    event.eventType === 'project-activated').length, 1);
  assert.equal(result.event.boundary, 'personal-record');
  assert.match(result.event.summary, /paper TurnBoard remains authoritative/u);
  assert.deepEqual(data, before, 'activation must not mutate the source snapshot');
});

test('activation is idempotent for the same revision and refuses silent overwrite', () => {
  const first = activateProjectLocally(createData(), createDraft());
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const repeated = activateProjectLocally(first.data, createDraft());
  assert.equal(repeated.ok, true);
  if (!repeated.ok) return;
  assert.equal(repeated.changed, false);
  assert.equal(repeated.data.fieldEvents.length, first.data.fieldEvents.length);
  assert.equal(repeated.data.projects.length, first.data.projects.length);

  const conflictingEvent = structuredClone(first.data);
  conflictingEvent.fieldEvents[0] = {
    ...conflictingEvent.fieldEvents[0],
    summary: 'Different event using the same durable ID.',
  };
  const collision = activateProjectLocally(conflictingEvent, createDraft());
  assert.equal(collision.ok, false);
  if (collision.ok) return;
  assert.equal(collision.code, 'invalid-configuration');
  assert.match(collision.errors.join(' '), /event ID conflicts/u);

  const changedProject = {
    ...createProject(),
    propertyName: 'Changed without confirmation',
  };
  const rejected = activateProjectLocally(first.data, createDraft({
    project: changedProject,
  }));
  assert.deepEqual(rejected, {
    code: 'overwrite-confirmation-required',
    errors: ['This project already exists. Confirm before replacing its personal setup defaults.'],
    ok: false,
  });

  const confirmed = activateProjectLocally(first.data, createDraft({
    configuration: {
      ...createConfiguration(),
      activatedAt: '2026-07-29T14:05:00.000Z',
    },
    confirmOverwrite: true,
    project: changedProject,
  }));
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) return;
  assert.equal(
    confirmed.data.projects.find((project) => project.id === PROJECT_ID)?.propertyName,
    'Changed without confirmation',
  );
});

test('activation fails closed for invalid contact scope and weakened authority', () => {
  const wrongContact = {
    ...createContacts()[0],
    projectId: 'another-project',
  };
  const wrongScope = activateProjectLocally(createData(), createDraft({
    contacts: [wrongContact],
  }));
  assert.equal(wrongScope.ok, false);
  if (wrongScope.ok) return;
  assert.equal(wrongScope.code, 'invalid-contacts');
  assert.match(wrongScope.errors.join(' '), /another project/u);

  const unsafeConfiguration: ProjectConfiguration = {
    ...createConfiguration(),
    permissions: {
      ...createConfiguration().permissions,
      officialApprovals: true,
    },
  };
  const unsafe = activateProjectLocally(createData(), createDraft({
    configuration: unsafeConfiguration,
  }));
  assert.equal(unsafe.ok, false);
  if (unsafe.ok) return;
  assert.equal(unsafe.code, 'invalid-configuration');
  assert.match(unsafe.errors.join(' '), /authority boundary/u);

  const wrongConfigurationScope = activateProjectLocally(createData(), createDraft({
    configuration: {
      ...createConfiguration(),
      projectId: 'another-project',
    },
  }));
  assert.equal(wrongConfigurationScope.ok, false);
  if (wrongConfigurationScope.ok) return;
  assert.equal(wrongConfigurationScope.code, 'invalid-configuration');
  assert.match(wrongConfigurationScope.errors.join(' '), /match the project/u);
});

test('AppData adapter keeps shared data compatible without mutating it', () => {
  const source = structuredClone(seedData);
  const adapted = adaptAppDataForTrackA(source, createContacts());

  assert.notEqual(adapted, source);
  assert.deepEqual(adapted.projects, source.projects);
  assert.deepEqual(adapted.propertyContacts, createContacts());
  assert.deepEqual(source, seedData);
});

test('Start Day saved defaults use the configured contact and allow explicit today-only overrides', () => {
  assert.equal(START_DAY_EIGHT_STEP_CONTRACT.length, 8);
  assert.deepEqual(getStartDayStepContract(), START_DAY_EIGHT_STEP_CONTRACT);
  assert.notEqual(getStartDayStepContract(), START_DAY_EIGHT_STEP_CONTRACT);

  const defaults = createStartDaySavedDefaults(
    createConfiguration(),
    createContacts(),
  );
  assert.deepEqual(defaults.activeCrewIdsByTrade, {
    Clean: ['crew-clean'],
    Paint: ['crew-paint'],
  });
  assert.equal(defaults.propertyContact, 'Tony');

  const override = createStartDaySavedDefaults(
    createConfiguration(),
    createContacts(),
    {
      activeCrewIdsByTrade: { Paint: ['crew-paint-today'] },
      walkthroughScheduleWording: 'Today only: 2 PM walkthrough.',
    },
  );
  assert.deepEqual(override.activeCrewIdsByTrade, {
    Clean: ['crew-clean'],
    Paint: ['crew-paint-today'],
  });
  assert.equal(override.walkthroughScheduleWording, 'Today only: 2 PM walkthrough.');
  assert.equal(
    createConfiguration().defaultWalkthroughScheduleWording,
    'Daily walkthrough at noon.',
  );
  assert.throws(
    () => createStartDaySavedDefaults(
      createConfiguration(),
      [{ ...createContacts()[0], projectId: 'another-project' }],
    ),
    /property contact is unavailable/u,
  );
});

const taskState = (
  execution: 'unassigned' | 'assigned' | 'working' | 'crew-reported-complete',
  inspection: 'pending' | 'passed' | 'callback-required',
  propertyWalk: 'not-ready' | 'pending',
) => ({
  execution,
  inspection,
  propertyWalk,
  trade: 'Paint' as const,
});

const createTodayTask = (): TodayTask => ({
  date: '2026-08-01',
  daySessionId: DAY_SESSION_ID,
  propertyId: PROJECT_ID,
  releaseBatchIds: ['release-1'],
  sections: [
    {
      releaseBatchId: 'release-1',
      restrictions: [],
      sectionId: 'A',
      sectionLabel: 'Bedroom A',
      tradeStates: [taskState('working', 'pending', 'not-ready')],
      uncertainties: [],
      unitId: 'unit-101',
      unitNumber: '101',
      unitType: '4',
      waitingReasons: [],
    },
    {
      releaseBatchId: 'release-1',
      restrictions: ['Access pending'],
      sectionId: 'B',
      sectionLabel: 'Bedroom B',
      tradeStates: [taskState('assigned', 'pending', 'not-ready')],
      uncertainties: [],
      unitId: 'unit-102',
      unitNumber: '102',
      unitType: '4',
      waitingReasons: ['Access pending'],
    },
    {
      releaseBatchId: 'release-1',
      restrictions: [],
      sectionId: 'C',
      sectionLabel: 'Bedroom C',
      tradeStates: [taskState('crew-reported-complete', 'callback-required', 'not-ready')],
      uncertainties: [],
      unitId: 'unit-103',
      unitNumber: '103',
      unitType: '4',
      waitingReasons: [],
    },
    {
      releaseBatchId: 'release-1',
      restrictions: [],
      sectionId: 'D',
      sectionLabel: 'Bedroom D',
      tradeStates: [taskState('crew-reported-complete', 'passed', 'pending')],
      uncertainties: [],
      unitId: 'unit-104',
      unitNumber: '104',
      unitType: '4',
      waitingReasons: [],
    },
  ],
});

const fieldEvent = (
  id: string,
  eventType: string,
  unitId?: string,
  daySessionId = DAY_SESSION_ID,
): FieldEvent => ({
  actorId: 'Los',
  actorType: 'los',
  boundary: 'personal-record',
  daySessionId,
  eventType,
  id,
  projectId: PROJECT_ID,
  recordedAt: NOW,
  recordedBy: 'Los',
  sourceType: 'personal-confirmation',
  summary: `${eventType} synthetic record`,
  unitId,
});

const trackCEvent = (
  id: string,
  eventType: TrackCConfirmedEvent['eventType'],
  unitId: string,
  section: 'A' | 'B' | 'C' | 'D',
): TrackCConfirmedEvent => ({
  confirmation: 'confirmed',
  crewId: 'crew-paint',
  eventType,
  id,
  officialPaperChanged: false,
  payrollChanged: false,
  personalRecordOnly: true,
  recordedAt: NOW,
  recordedBy: 'Los',
  sourceLabel: 'Synthetic test fixture',
  sourceType: 'synthetic-fixture',
  summary: `${eventType} synthetic record`,
  target: {
    section,
    trade: 'paint',
    unitId,
  },
});

const createTrackCState = (): TrackCState => {
  const targets = [
    { section: 'A', unitId: 'unit-101', unitNumber: '101' },
    { section: 'B', unitId: 'unit-102', unitNumber: '102' },
    { section: 'C', unitId: 'unit-103', unitNumber: '103' },
    { section: 'D', unitId: 'unit-104', unitNumber: '104' },
  ] as const;
  return {
    completedWalks: [],
    crews: [{
      activeToday: true,
      id: 'crew-paint',
      name: 'Paint Crew',
      trade: 'paint',
    }],
    events: [
      ...targets.map((target) =>
        trackCEvent(`assignment-${target.unitId}`, 'assignment-confirmed', target.unitId, target.section)),
      trackCEvent('work-unit-101', 'work-started', 'unit-101', 'A'),
      trackCEvent('complete-unit-103', 'crew-reported-complete', 'unit-103', 'C'),
      trackCEvent('callback-unit-103', 'callback-opened', 'unit-103', 'C'),
      trackCEvent('complete-unit-104', 'crew-reported-complete', 'unit-104', 'D'),
      trackCEvent('pass-unit-104', 'los-passed', 'unit-104', 'D'),
    ],
    propertyId: PROJECT_ID,
    propertyName: 'Moon Tower',
    terminology: {
      boardName: 'Personal TurnBoard mirror',
      paperReminder: 'Paper remains authoritative',
      personalMirrorLabel: 'Personal PDS Approved mirror',
      propertyAcceptanceLabel: 'Property acceptance',
    },
    units: targets.map((target) => ({
      applicableSections: [target.section],
      id: target.unitId,
      locationLabel: 'Synthetic floor',
      unitNumber: target.unitNumber,
      unitType: '4BR',
      workFacts: [{
        access: target.unitId === 'unit-102' ? 'access-blocked' : 'clear',
        id: `work-${target.unitId}`,
        release: 'released',
        section: target.section,
        sourceConfidence: 'confirmed',
        sourceLabel: 'Synthetic confirmed release',
        trade: 'paint',
        unitId: target.unitId,
      }],
    })),
  };
};

test('one canonical projection provides shared queue counts, Units touched, crew work, and Activity', () => {
  const task = createTodayTask();
  const events = [
    fieldEvent('event-work', 'work-started', 'unit-101'),
    fieldEvent('event-callback', 'callback-opened', 'unit-103'),
    fieldEvent('event-old-day', 'los-passed', 'unit-999', 'older-day'),
    fieldEvent('event-project', 'project-activated'),
  ];
  const projection = buildCanonicalFieldProjection({
    accountId: 'los-personal',
    activeDaySessionId: DAY_SESSION_ID,
    fieldEvents: events,
    projectId: PROJECT_ID,
    todayTask: task,
    trackCState: createTrackCState(),
  });

  assert.deepEqual(projection.counts, {
    callbacks: 1,
    ready: 1,
    unitsTouched: 2,
    waiting: 1,
    working: 1,
  });
  assert.equal(projection.todayTask.progress.actual, 2);
  assert.equal(projection.todayTask.progress.target, 4);
  assert.deepEqual(projection.crewCurrentWork, [{
    callbacks: 1,
    crewId: 'crew-paint',
    crewName: 'Paint Crew',
    currentAssignments: 4,
    trade: 'paint',
    waiting: 1,
  }]);
  assert.deepEqual(projection.grains, {
    activity: 'events',
    crewCurrentWork: 'section-trades',
    queues: 'sections',
    todayTaskProgress: 'sections',
    unitsTouched: 'units',
  });
  assert.equal(projection.activity.length, 4);
  assert.deepEqual(projection.boundaries, {
    officialApprovalMutated: false,
    paperTurnBoardAuthoritative: true,
    payrollCalculated: false,
  });
});

test('durable field-event Activity adapter is project scoped, exact, sorted, and deduplicated', () => {
  const older = { ...fieldEvent('event-a', 'day-session-started'), recordedAt: '2026-07-29T13:00:00.000Z' };
  const newer = { ...fieldEvent('event-b', 'assignment-confirmed', 'unit-101'), recordedAt: NOW };
  const otherProject = { ...fieldEvent('event-c', 'work-started'), projectId: 'other-project' };
  const activity = adaptDurableFieldEventsToActivity({
    accountId: 'los-personal',
    fieldEvents: [older, newer, newer, otherProject],
    projectId: PROJECT_ID,
  });

  assert.equal(activity.length, 2);
  assert.deepEqual(activity.map((item) => item.sourceEventId), ['event-b', 'event-a']);
  assert.equal(activity[0].wording, newer.summary);
  assert.equal(activity[0].eventKind, 'assignment-recorded');
  assert.equal(activity[0].sourceRefs[0].id, 'field-event:event-b');

  const reversal = {
    ...fieldEvent('event-reversal', 'assignment-cleared', 'unit-101'),
    reversesEventId: newer.id,
  };
  assert.equal(
    adaptDurableFieldEventsToActivity({
      accountId: 'los-personal',
      fieldEvents: [reversal],
      projectId: PROJECT_ID,
    })[0].eventKind,
    'undo-recorded',
  );
});

test('AppData projection adapter preserves project scope when no Day Session is active', () => {
  const activated = activateProjectLocally(createData(), createDraft());
  assert.equal(activated.ok, true);
  if (!activated.ok) return;

  const projection = buildCanonicalFieldProjectionFromAppData(
    activated.data,
    'los-personal',
  );
  assert.equal(projection.projectId, PROJECT_ID);
  assert.equal(projection.daySessionId, undefined);
  assert.equal(projection.counts.unitsTouched, 0);
  assert.deepEqual(projection.todayTask.queueCounts, {
    callbacks: 0,
    'ready-to-walk': 0,
    waiting: 0,
    working: 0,
  });
  assert.deepEqual(
    projection.activity.map((activity) => activity.sourceEventId),
    [`project-activated:${PROJECT_ID}:${NOW}`],
  );
});

test('projection rejects cross-project and cross-session state instead of merging it', () => {
  assert.throws(
    () => buildCanonicalFieldProjection({
      accountId: 'los-personal',
      activeDaySessionId: DAY_SESSION_ID,
      fieldEvents: [],
      projectId: 'wrong-project',
      todayTask: createTodayTask(),
      trackCState: createTrackCState(),
    }),
    /does not match the requested project/u,
  );
  assert.throws(
    () => buildCanonicalFieldProjection({
      accountId: 'los-personal',
      activeDaySessionId: 'wrong-session',
      fieldEvents: [],
      projectId: PROJECT_ID,
      todayTask: createTodayTask(),
      trackCState: createTrackCState(),
    }),
    /does not match the active Day Session/u,
  );
});

test('the UI package exposes five controlled setup steps and isolated scroll ownership', async () => {
  const [setupSource, taskSource, detailSource, css] = await Promise.all([
    readFile(new URL('../src/features/wave2a21-track-a/ProjectSetupFlow.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/wave2a21-track-a/TodayTaskDetail.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/wave2a21-track-a/ProfilePrivacyScrollRegion.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/wave2a21-track-a/trackA.css', import.meta.url), 'utf8'),
  ]);

  const stepBlock = setupSource.match(
    /PROJECT_SETUP_STEPS = Object\.freeze\(\[([\s\S]*?)\] as const\)/u,
  );
  assert.ok(stepBlock);
  assert.equal(stepBlock[1].match(/\{ id:/gu)?.length, 5);
  assert.ok(setupSource.includes('Step {step + 1} of {PROJECT_SETUP_STEPS.length}'));
  assert.match(setupSource, /paper TurnBoard remains authoritative/u);
  assert.match(setupSource, /onDraftChange/u);
  assert.match(setupSource, /Activate personal project/u);
  assert.match(taskSource, /Crew completion does not mean Los inspected or property accepted/u);
  assert.match(taskSource, /does not change today’s confirmed release/u);
  assert.match(detailSource, /data-turn-scroll-region="primary"/u);
  assert.ok(css.includes('.w2a21a-profile-privacy-scroll'));
  assert.ok(css.includes('overflow-y: auto'));
  assert.match(css, /env\(safe-area-inset-bottom\)/u);
  assert.match(css, /prefers-reduced-motion/u);
});
