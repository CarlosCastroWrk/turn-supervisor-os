import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { parseJsonBackup } from '../src/lib/backups.ts';
import { buildJsonBackup } from '../src/lib/exporters.ts';
import type {
  AppData,
  FieldEvent,
  Project,
} from '../src/types.ts';
import type { TodayTask } from '../src/features/wave2a2-track-b/types.ts';
import type {
  TrackCConfirmedEvent,
  TrackCState,
} from '../src/features/wave2a2-track-c/model.ts';
import {
  projectTrackCState,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import {
  projectTrackCAssignmentEligibility,
} from '../src/features/wave2a2-track-c/projections.ts';
import {
  persistPreparedProjectActivation,
  prepareProjectActivation,
} from '../src/features/wave2a21-track-a/activation.ts';
import {
  adaptDurableFieldEventsToActivity,
  adaptLegacyActivityLogsToActivity,
  groupFieldActivityBursts,
} from '../src/features/wave2a21-track-a/activity.ts';
import {
  adaptAppDataForTrackA,
} from '../src/features/wave2a21-track-a/appDataAdapter.ts';
import type {
  ProjectActivationDraft,
  ProjectConfiguration,
  ProjectRosterUnitOption,
  PropertyContact,
  TrackACrewOption,
  TrackAAppData,
  TrackAFieldActivity,
  TrackAProject,
} from '../src/features/wave2a21-track-a/contracts.ts';
import {
  PROPERTY_CONTACT_ROLES,
} from '../src/features/wave2a21-track-a/contracts.ts';
import {
  buildCanonicalFieldProjection,
  buildCanonicalFieldProjectionFromAppData,
} from '../src/features/wave2a21-track-a/projections.ts';
import {
  START_DAY_EIGHT_STEP_CONTRACT,
  getStartDayStepContract,
  resolveStartDayValues,
} from '../src/features/wave2a21-track-a/startDayDefaults.ts';
import {
  PROJECT_SETUP_STEPS,
  clampProjectSetupStep,
} from '../src/features/wave2a21-track-a/projectSetup.ts';
import {
  createProjectSetupDraftStore,
} from '../src/features/wave2a21-track-a/projectSetupDraft.ts';
import {
  FAST_START_DAY_STEPS,
  availableDailyReleaseTradeChoices,
  clampFastStartDayStep,
  configurationWithSchedule,
  createConfirmedDailyReleaseBatch,
  createDailyReleaseDraft,
  createFastStartDayDraft,
  defaultActiveCrewIds,
  prepareDailyReleasePlan,
  prepareFastStartDaySubmission,
  resolveExactUnitNumberSelection,
  resolveProjectDefaultSchedule,
  setDailyReleaseException,
  setDailyReleaseUnitSelected,
  validatePreparedReleaseAgainstRoster,
} from '../src/features/wave2a21-track-a/phase2Workflow.ts';
import {
  projectCanonicalFieldConsumers,
} from '../src/features/launch-command-center/canonicalFieldConsumers.ts';

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
  activeForProject: true,
  note: 'Synthetic personal contact note',
  phone: 'synthetic-only',
  projectId: PROJECT_ID,
  role: 'Property Manager',
  title: 'Property Manager',
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
  defaultWalkthroughScheduleWording: '12:00',
  defaultWorkingHoursWording: '08:00–18:00',
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

const rosterUnits: readonly ProjectRosterUnitOption[] = [
  {
    applicableSections: ['common', 'A', 'B', 'C'],
    building: 'Synthetic Tower',
    floor: '1',
    id: 'unit-101',
    unitNumber: '101',
    unitType: '3 bedroom',
  },
  {
    applicableSections: ['common', 'A', 'B'],
    building: 'Synthetic Tower',
    floor: '2',
    id: 'unit-202',
    unitNumber: '202',
    unitType: '2 bedroom',
  },
];

const crewOptions: readonly TrackACrewOption[] = [
  { id: 'crew-paint', name: 'Synthetic Paint', trade: 'paint' },
  { id: 'crew-clean', name: 'Synthetic Clean', trade: 'clean' },
  {
    active: false,
    id: 'crew-paint-inactive',
    name: 'Inactive Paint',
    trade: 'paint',
  },
];

test('Phase 2 Property Contact roles match the approved operational choices exactly', () => {
  assert.deepEqual(PROPERTY_CONTACT_ROLES, [
    'Property Manager',
    'Maintenance',
    'Field Lead / Market Partner',
    'Runner',
    'Other',
  ]);
});

test('Fast Start Day exposes a bounded four-screen route step', () => {
  assert.equal(clampFastStartDayStep(-1), 0);
  assert.equal(clampFastStartDayStep(0), 0);
  assert.equal(clampFastStartDayStep(2.8), 2);
  assert.equal(clampFastStartDayStep(99), 3);
  assert.equal(clampFastStartDayStep(Number.NaN), 0);
});

test('activation preparation adds one candidate project, its contacts, active scope, and one personal event', () => {
  const data = createData();
  const before = structuredClone(data);
  const draft = createDraft();
  const result = prepareProjectActivation(data, draft);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stage, 'prepared');
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
  const first = prepareProjectActivation(createData(), createDraft());
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const repeated = prepareProjectActivation(first.data, createDraft());
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
  const collision = prepareProjectActivation(conflictingEvent, createDraft());
  assert.equal(collision.ok, false);
  if (collision.ok) return;
  assert.equal(collision.code, 'invalid-configuration');
  assert.match(collision.errors.join(' '), /event ID conflicts/u);

  const changedProject = {
    ...createProject(),
    propertyName: 'Changed without confirmation',
  };
  const rejected = prepareProjectActivation(first.data, createDraft({
    project: changedProject,
  }));
  assert.deepEqual(rejected, {
    code: 'overwrite-confirmation-required',
    errors: ['This project already exists. Confirm before replacing its personal setup defaults.'],
    ok: false,
    stage: 'preparation',
  });

  const confirmed = prepareProjectActivation(first.data, createDraft({
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
  const wrongScope = prepareProjectActivation(createData(), createDraft({
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
  const unsafe = prepareProjectActivation(createData(), createDraft({
    configuration: unsafeConfiguration,
  }));
  assert.equal(unsafe.ok, false);
  if (unsafe.ok) return;
  assert.equal(unsafe.code, 'invalid-configuration');
  assert.match(unsafe.errors.join(' '), /authority boundary/u);

  const wrongConfigurationScope = prepareProjectActivation(createData(), createDraft({
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

test('activation timestamp matches strict backup shape and round-trips with an offset', () => {
  const activatedAt = '2026-07-29T09:00:00.000-05:00';
  const source = createData();
  const prepared = prepareProjectActivation(source, createDraft({
    configuration: {
      ...createConfiguration(),
      activatedAt,
    },
  }));

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.event.recordedAt, activatedAt);

  const restored = parseJsonBackup(buildJsonBackup(prepared.data)) as TrackAAppData;
  const restoredProject = restored.projects.find((project) => project.id === PROJECT_ID);
  const restoredEvent = restored.fieldEvents.find((event) => event.id === prepared.event.id);
  assert.equal(restoredProject?.fieldConfiguration?.activatedAt, activatedAt);
  assert.equal(restoredEvent?.recordedAt, activatedAt);
  assert.deepEqual(restored.propertyContacts, createContacts());

  const invalidTimestamps = [
    '2026-07-29',
    '2026-07-29T09:00:00.000',
    '2026-02-30T09:00:00.000-05:00',
    '2026-07-29T09:00:00.000Z trailing-data',
  ];
  for (const invalidTimestamp of invalidTimestamps) {
    const invalidSource = createData();
    const before = structuredClone(invalidSource);
    const rejected = prepareProjectActivation(invalidSource, createDraft({
      configuration: {
        ...createConfiguration(),
        activatedAt: invalidTimestamp,
      },
    }));
    assert.equal(rejected.ok, false, `accepted invalid timestamp ${invalidTimestamp}`);
    if (rejected.ok) continue;
    assert.equal(rejected.code, 'invalid-configuration');
    assert.match(rejected.errors.join(' '), /offset-capable ISO timestamp/u);
    assert.equal('event' in rejected, false);
    assert.deepEqual(invalidSource, before);
  }
});

test('durable activation receipt is withheld on persistence failure and retry state is preserved', async () => {
  const source = createData();
  const draft = createDraft();
  const prepared = prepareProjectActivation(source, draft);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  let attemptedData: Readonly<TrackAAppData> | undefined;
  const rejected = await persistPreparedProjectActivation(prepared, (candidate) => {
    attemptedData = candidate;
    return false;
  });
  assert.equal(attemptedData, prepared.data);
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.equal(rejected.stage, 'persistence');
  assert.equal(rejected.code, 'persistence-failed');
  assert.equal('receipt' in rejected, false);
  assert.deepEqual(rejected.retry.sourceData, source);
  assert.deepEqual(rejected.retry.draft, draft);
  assert.deepEqual(source, createData());

  const threw = await persistPreparedProjectActivation(prepared, () => {
    throw new Error('Synthetic storage failure');
  });
  assert.equal(threw.ok, false);
  assert.equal('receipt' in threw, false);

  const persisted = await persistPreparedProjectActivation(prepared, () => true);
  assert.equal(persisted.ok, true);
  if (!persisted.ok) return;
  assert.equal(persisted.stage, 'persisted');
  assert.deepEqual(persisted.receipt, {
    acknowledgement: 'durable-save-succeeded',
    activatedAt: NOW,
    changed: true,
    eventId: `project-activated:${PROJECT_ID}:${NOW}`,
    projectId: PROJECT_ID,
  });
});

test('AppData adapter keeps shared data compatible without mutating it', () => {
  const source = structuredClone(seedData);
  const adapted = adaptAppDataForTrackA(source, createContacts());

  assert.notEqual(adapted, source);
  assert.deepEqual(adapted.projects, source.projects);
  assert.deepEqual(adapted.propertyContacts, createContacts());
  assert.deepEqual(source, seedData);
});

test('Project Setup uses five authorized groups and stores native time controls in accepted wording fields', () => {
  assert.deepEqual(
    PROJECT_SETUP_STEPS.map((step) => step.label),
    [
      'Property',
      'Contacts',
      'Crews',
      'Units',
      'Review',
    ],
  );
  const source = createConfiguration();
  const configured = configurationWithSchedule(source, {
    walkthroughTime: '12:30',
    workEndTime: '18:15',
    workStartTime: '07:45',
  });
  assert.equal(configured.defaultWorkingHoursWording, '07:45–18:15');
  assert.equal(configured.defaultWalkthroughScheduleWording, '12:30');
  assert.deepEqual(resolveProjectDefaultSchedule(configured), {
    walkthroughTime: '12:30',
    workEndTime: '18:15',
    workStartTime: '07:45',
  });
  assert.equal('defaultSchedule' in configured, false);
  assert.equal(source.defaultWorkingHoursWording, '08:00–18:00');

  const withoutWalkthrough = configurationWithSchedule(source, {
    workEndTime: '17:00',
    workStartTime: '09:00',
  });
  assert.equal(withoutWalkthrough.defaultWalkthroughScheduleWording, 'Not scheduled');
  assert.deepEqual(resolveProjectDefaultSchedule(withoutWalkthrough), {
    walkthroughTime: undefined,
    workEndTime: '17:00',
    workStartTime: '09:00',
  });

  assert.deepEqual(resolveProjectDefaultSchedule({
    ...source,
    defaultWalkthroughScheduleWording: 'Daily walkthrough at 12 PM',
    defaultWorkingHoursWording: 'Occupied areas 10 AM–5 PM',
  }), {
    walkthroughTime: '12:00',
    workEndTime: '17:00',
    workStartTime: '10:00',
  });
  assert.deepEqual(resolveProjectDefaultSchedule({
    ...source,
    defaultWalkthroughScheduleWording: 'Walkthrough 2:30 p.m.',
    defaultWorkingHoursWording: 'Today only: 9:15 a.m.–4:45 p.m.',
  }), {
    walkthroughTime: '14:30',
    workEndTime: '16:45',
    workStartTime: '09:15',
  });

  const startOnly = configurationWithSchedule(source, {
    walkthroughTime: '12:00',
    workEndTime: '',
    workStartTime: '10:00',
  });
  assert.equal(startOnly.defaultWorkingHoursWording, '10:00–');
  assert.deepEqual(resolveProjectDefaultSchedule(startOnly), {
    walkthroughTime: '12:00',
    workEndTime: '',
    workStartTime: '10:00',
  });
  const completedAfterStart = configurationWithSchedule(
    startOnly,
    {
      ...resolveProjectDefaultSchedule(startOnly),
      workEndTime: '17:00',
    },
  );
  assert.equal(completedAfterStart.defaultWorkingHoursWording, '10:00–17:00');

  const incompleteActivation = prepareProjectActivation(
    createData(),
    createDraft({ configuration: startOnly }),
  );
  assert.equal(incompleteActivation.ok, false);
  if (!incompleteActivation.ok) {
    assert.match(incompleteActivation.errors.join(' '), /Default working hours are required/u);
  }
});

test('Project Setup autosave is owner-scoped, step-restorable, and fails closed for malformed data', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const store = createProjectSetupDraftStore(storage);
  const draft = createDraft({
    project: { ...createProject(), propertyName: 'Moon Tower' },
  });

  assert.equal(store.write('account-los', draft, 3), true);
  assert.deepEqual(store.read('account-los'), {
    draft,
    step: 3,
    version: 1,
  });
  assert.equal(store.read('account-other'), undefined);

  const key = [...values.keys()].find((candidate) =>
    candidate.includes('account-los'));
  assert.ok(key);
  values.set(key, '{"version":1,"draft":{"project":null},"step":99}');
  assert.equal(store.read('account-los'), undefined);
  assert.equal(values.has(key), false);
});

test('Daily Release starts empty, defaults applicable sections only after Unit selection, and requires explicit review', () => {
  const initial = createDailyReleaseDraft('Both');
  assert.deepEqual(initial.selectedUnitIds, []);
  assert.equal(initial.explicitConfirmation, false);

  const unconfirmed = prepareDailyReleasePlan({
    contacts: createContacts(),
    date: '2026-08-01',
    draft: initial,
    enabledTrades: { clean: true, paint: true },
    projectId: PROJECT_ID,
    propertyContactId: 'contact-tony',
    rosterUnits,
  });
  assert.equal(unconfirmed.ok, false);
  if (unconfirmed.ok) return;
  assert.match(unconfirmed.errors.join(' '), /explicitly confirm/u);
  assert.match(unconfirmed.errors.join(' '), /at least one Unit/u);

  let draft = setDailyReleaseUnitSelected(initial, 'unit-101', true);
  draft = setDailyReleaseUnitSelected(draft, 'unit-202', true);
  draft = setDailyReleaseException(draft, 'unit-101', 'B', 'unreleased-bedroom');
  draft = setDailyReleaseException(draft, 'unit-101', 'C', 'access-issue');
  draft = setDailyReleaseException(draft, 'unit-202', 'A', 'occupied-restricted');
  draft = { ...draft, explicitConfirmation: true };

  const prepared = prepareDailyReleasePlan({
    contacts: createContacts(),
    date: '2026-08-01',
    draft,
    enabledTrades: { clean: true, paint: true },
    projectId: PROJECT_ID,
    propertyContactId: 'contact-tony',
    rosterUnits,
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.plan.items.length, 10);
  assert.equal(
    prepared.plan.items.some((item) =>
      item.unitId === 'unit-101' && item.section === 'B'),
    false,
  );
  assert.equal(
    prepared.plan.items.some((item) =>
      item.unitId === 'unit-202' && item.section === 'A'),
    false,
  );
  assert.equal(
    prepared.plan.items.filter((item) =>
      item.unitId === 'unit-101'
      && item.section === 'C'
      && item.restriction === 'Access issue').length,
    2,
  );
  assert.deepEqual(initial, createDailyReleaseDraft('Both'));
});

test('exact Unit-number selection fails as one batch for duplicates, unknowns, or ambiguous roster matches', () => {
  assert.deepEqual(
    resolveExactUnitNumberSelection('101, 202', rosterUnits),
    {
      ok: true,
      unitIds: ['unit-101', 'unit-202'],
      unitNumbers: ['101', '202'],
    },
  );
  assert.deepEqual(
    resolveExactUnitNumberSelection('101\n202', rosterUnits),
    {
      ok: true,
      unitIds: ['unit-101', 'unit-202'],
      unitNumbers: ['101', '202'],
    },
  );

  const duplicate = resolveExactUnitNumberSelection('101 101', rosterUnits);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.match(duplicate.errors.join(' '), /Duplicate Unit numbers: 101/u);
  }

  const unknown = resolveExactUnitNumberSelection('101, 999', rosterUnits);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.match(unknown.errors.join(' '), /Not in the current Property roster: 999/u);
  }

  const ambiguous = resolveExactUnitNumberSelection('101', [
    ...rosterUnits,
    { ...rosterUnits[0], id: 'unit-101-building-b' },
  ]);
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) {
    assert.match(
      ambiguous.errors.join(' '),
      /Unit numbers are not unique in the current Property roster: 101/u,
    );
  }

  const empty = resolveExactUnitNumberSelection('  , \n ', rosterUnits);
  assert.equal(empty.ok, false);
});

test('Daily Release respects enabled Paint/Clean scope and rejects stale roster confirmation', () => {
  assert.deepEqual(
    availableDailyReleaseTradeChoices({ clean: true, paint: true }),
    ['Both', 'Paint', 'Clean'],
  );
  assert.deepEqual(
    availableDailyReleaseTradeChoices({ clean: false, paint: true }),
    ['Paint'],
  );
  assert.deepEqual(
    availableDailyReleaseTradeChoices({ clean: true, paint: false }),
    ['Clean'],
  );

  const bothDraft = {
    ...setDailyReleaseUnitSelected(createDailyReleaseDraft('Both'), 'unit-101', true),
    explicitConfirmation: true,
  };
  const disabledTrade = prepareDailyReleasePlan({
    contacts: createContacts(),
    date: '2026-08-01',
    draft: bothDraft,
    enabledTrades: { clean: false, paint: true },
    projectId: PROJECT_ID,
    propertyContactId: 'contact-tony',
    rosterUnits,
  });
  assert.equal(disabledTrade.ok, false);
  if (disabledTrade.ok) return;
  assert.match(disabledTrade.errors.join(' '), /not enabled/u);

  const paintDraft = { ...bothDraft, tradeChoice: 'Paint' as const };
  const prepared = prepareDailyReleasePlan({
    contacts: createContacts(),
    date: '2026-08-01',
    draft: paintDraft,
    enabledTrades: { clean: false, paint: true },
    projectId: PROJECT_ID,
    propertyContactId: 'contact-tony',
    rosterUnits,
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.plan.items.every((item) => item.trade === 'paint'), true);

  const changedRoster = rosterUnits.map((unit) =>
    unit.id === 'unit-101'
      ? { ...unit, applicableSections: ['common', 'A'] as const }
      : unit);
  assert.match(
    validatePreparedReleaseAgainstRoster(prepared.plan, changedRoster).join(' '),
    /roster changed/u,
  );
  assert.throws(
    () => createConfirmedDailyReleaseBatch(prepared.plan, changedRoster, {
      batchId: 'release-batch-1',
      confirmedAt: NOW,
      confirmedBy: 'Los',
    }),
    /roster changed/u,
  );

  const batch = createConfirmedDailyReleaseBatch(prepared.plan, rosterUnits, {
    batchId: 'release-batch-1',
    confirmedAt: NOW,
    confirmedBy: 'Los',
  });
  assert.equal(batch.status, 'confirmed');
  assert.equal(batch.sourceType, 'manual');
  assert.equal(batch.items.length, 4);
  assert.equal(batch.items.every((item) => item.trade === 'paint'), true);
});

test('target-specific release exceptions do not taint unaffected work in the accepted Phase 1 projection', () => {
  const projectionRoster: readonly ProjectRosterUnitOption[] = [{
    applicableSections: ['common', 'A', 'B', 'C'],
    id: 'unit_101',
    unitNumber: '101',
    unitType: '3 bedroom',
  }];

  for (const exceptionKind of [
    'unreleased-bedroom',
    'occupied-restricted',
    'access-issue',
  ] as const) {
    let draft = setDailyReleaseUnitSelected(
      createDailyReleaseDraft('Paint'),
      'unit_101',
      true,
    );
    draft = setDailyReleaseException(
      draft,
      'unit_101',
      'B',
      exceptionKind,
    );
    draft = { ...draft, explicitConfirmation: true };
    const prepared = prepareDailyReleasePlan({
      contacts: [{
        ...createContacts()[0],
        projectId: seedData.activeProjectId,
      }],
      date: '2026-08-01',
      draft,
      enabledTrades: { clean: true, paint: true },
      projectId: seedData.activeProjectId,
      propertyContactId: 'contact-tony',
      rosterUnits: projectionRoster,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) continue;

    const batch = createConfirmedDailyReleaseBatch(
      prepared.plan,
      projectionRoster,
      {
        batchId: `release-${exceptionKind}`,
        confirmedAt: NOW,
        confirmedBy: 'Los',
      },
    );
    assert.deepEqual(batch.uncertainties, []);

    const data: AppData = {
      ...structuredClone(seedData),
      dailyReleaseBatches: [batch],
      daySessions: [{
        activeCleanCrewIds: [],
        activePaintCrewIds: [],
        createdAt: NOW,
        date: '2026-08-01',
        id: `session-${exceptionKind}`,
        keyStatus: 'yes',
        morningNote: '',
        projectId: seedData.activeProjectId,
        propertyContact: 'Tony',
        releaseBatchIds: [batch.id],
        startedAt: NOW,
        startedBy: 'Los',
        status: 'active',
        updatedAt: NOW,
      }],
      fieldEvents: [],
      walkSessions: [],
    };
    const state = projectTrackCState(data);
    const unaffected = projectTrackCAssignmentEligibility(state, {
      section: 'A',
      trade: 'paint',
      unitId: 'unit_101',
    });
    assert.equal(unaffected.projection?.release, 'released');
    assert.equal(unaffected.projection?.sourceConfidence, 'confirmed');
    assert.equal(unaffected.eligible, true);

    const affected = projectTrackCAssignmentEligibility(state, {
      section: 'B',
      trade: 'paint',
      unitId: 'unit_101',
    });
    assert.equal(affected.eligible, false);
    if (exceptionKind === 'access-issue') {
      assert.equal(affected.projection?.release, 'released');
      assert.equal(affected.projection?.access, 'access-blocked');
      assert.match(
        batch.items.find((item) =>
          item.unitId === 'unit_101'
          && item.section === 'B'
          && item.trade === 'paint')?.sourceExcerpt ?? '',
        /Target exception: Access issue/u,
      );
    } else {
      assert.equal(affected.projection?.release, 'unreleased');
    }
  }
});

test('Fast Start Day is four screens, reuses active defaults, and returns an atomic host payload without mutation', () => {
  assert.deepEqual(
    FAST_START_DAY_STEPS.map((step) => step.label),
    [
      'Day and access',
      'Daily release',
      'Crews and defaults',
      'Review and Start Day',
    ],
  );
  assert.deepEqual(defaultActiveCrewIds(createConfiguration(), crewOptions), {
    clean: ['crew-clean'],
    paint: ['crew-paint'],
  });

  const releaseDraft = {
    ...setDailyReleaseUnitSelected(createDailyReleaseDraft('Both'), 'unit-101', true),
    explicitConfirmation: true,
  };
  const input = {
    activeCrewIdsByTrade: {
      clean: ['crew-clean'],
      paint: ['crew-paint'],
    },
    contacts: createContacts(),
    crewOptions,
    date: '2026-08-01',
    enabledTrades: { clean: true, paint: true },
    explicitStartConfirmation: true,
    keyStatus: 'partial-issue' as const,
    morningNote: '  Synthetic note  ',
    projectId: PROJECT_ID,
    propertyContactId: 'contact-tony',
    propertyName: 'Moon Tower',
    releaseDraft,
    rosterUnits,
    schedule: {
      walkthroughTime: '12:00',
      workEndTime: '18:00',
      workStartTime: '08:00',
    },
  };
  const before = structuredClone(input);
  const prepared = prepareFastStartDaySubmission(input);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.submission.keyStatus, 'partial-issue');
  assert.equal(prepared.submission.morningNote, 'Synthetic note');
  assert.equal(prepared.submission.release.items.length, 8);
  assert.deepEqual(input, before);

  const missingKeyAndConfirmation = prepareFastStartDaySubmission({
    ...input,
    explicitStartConfirmation: false,
    keyStatus: undefined,
  });
  assert.equal(missingKeyAndConfirmation.ok, false);
  if (missingKeyAndConfirmation.ok) return;
  assert.match(missingKeyAndConfirmation.errors.join(' '), /key status/u);
  assert.match(missingKeyAndConfirmation.errors.join(' '), /confirm Start Day/u);

  const unavailableCrew = prepareFastStartDaySubmission({
    ...input,
    activeCrewIdsByTrade: {
      clean: ['crew-clean'],
      paint: ['crew-paint-inactive'],
    },
  });
  assert.equal(unavailableCrew.ok, false);
  if (unavailableCrew.ok) return;
  assert.match(unavailableCrew.errors.join(' '), /unavailable/u);
});

test('Fast Start Day full draft survives host serialization and remount at review', () => {
  const alternateContact: PropertyContact = {
    ...createContacts()[0],
    id: 'contact-alternate',
    isPrimary: false,
    name: 'Alternate field contact',
    role: 'Field Lead / Market Partner',
    title: 'Field Lead / Market Partner',
  };
  const contacts = [...createContacts(), alternateContact];
  const initial = createFastStartDayDraft({
    configuration: createConfiguration(),
    contacts,
    crewOptions,
    currentDate: '2026-08-01',
    projectId: PROJECT_ID,
  });
  const selectedRelease = setDailyReleaseException(
    setDailyReleaseUnitSelected(initial.releaseDraft, 'unit-101', true),
    'unit-101',
    'B',
    'access-issue',
  );
  const controlledDraft = {
    ...initial,
    activeCrewIdsByTrade: {
      clean: ['crew-clean'],
      paint: ['crew-paint'],
    },
    changeCrewsToday: true,
    changeScheduleToday: true,
    date: '2026-08-02',
    explicitStartConfirmation: true,
    keyStatus: 'partial-issue' as const,
    morningNote: 'Exact note — preserve punctuation.',
    propertyContactId: alternateContact.id,
    releaseDraft: {
      ...selectedRelease,
      explicitConfirmation: true,
    },
    schedule: {
      walkthroughTime: '13:15',
      workEndTime: '17:30',
      workStartTime: '09:30',
    },
  };
  const restored = JSON.parse(
    JSON.stringify(controlledDraft),
  ) as typeof controlledDraft;
  assert.deepEqual(restored, controlledDraft);

  const prepared = prepareFastStartDaySubmission({
    activeCrewIdsByTrade: restored.activeCrewIdsByTrade,
    contacts,
    crewOptions,
    date: restored.date,
    enabledTrades: createConfiguration().enabledTrades,
    explicitStartConfirmation: restored.explicitStartConfirmation,
    keyStatus: restored.keyStatus,
    morningNote: restored.morningNote,
    projectId: PROJECT_ID,
    propertyContactId: restored.propertyContactId,
    propertyName: 'Moon Tower',
    releaseDraft: restored.releaseDraft,
    rosterUnits,
    schedule: restored.schedule,
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.submission.propertyContact.id, alternateContact.id);
  assert.equal(prepared.submission.keyStatus, 'partial-issue');
  assert.equal(
    prepared.submission.release.exceptions[0]?.kind,
    'access-issue',
  );
  assert.deepEqual(prepared.submission.activeCrewIdsByTrade, {
    clean: ['crew-clean'],
    paint: ['crew-paint'],
  });
  assert.deepEqual(prepared.submission.schedule, controlledDraft.schedule);
  assert.equal(prepared.submission.morningNote, controlledDraft.morningNote);
});

test('Start Day values preserve per-value saved-default and today-only provenance', () => {
  assert.equal(START_DAY_EIGHT_STEP_CONTRACT.length, 8);
  assert.deepEqual(getStartDayStepContract(), START_DAY_EIGHT_STEP_CONTRACT);
  assert.notEqual(getStartDayStepContract(), START_DAY_EIGHT_STEP_CONTRACT);

  const defaults = resolveStartDayValues(
    createConfiguration(),
    createContacts(),
  );
  assert.deepEqual(defaults.activeCrewIdsByTrade, {
    Clean: {
      source: 'saved-project-default',
      value: ['crew-clean'],
    },
    Paint: {
      source: 'saved-project-default',
      value: ['crew-paint'],
    },
  });
  assert.deepEqual(defaults.propertyContact, {
    source: 'saved-project-default',
    value: { id: 'contact-tony', name: 'Tony' },
  });

  const alternateContact: PropertyContact = {
    ...createContacts()[0],
    id: 'contact-today',
    isPrimary: false,
    name: 'Today Contact',
  };
  const override = resolveStartDayValues(
    createConfiguration(),
    [...createContacts(), alternateContact],
    {
      activeCrewIdsByTrade: {
        Clean: [],
        Paint: ['crew-paint-today'],
      },
      propertyContactId: alternateContact.id,
      walkthroughScheduleWording: 'Today only: 2 PM walkthrough.',
      workingHoursWording: 'Today only: 9 AM–4 PM.',
    },
  );
  assert.deepEqual(override.activeCrewIdsByTrade.Clean, {
    source: 'today-only-override',
    value: [],
  });
  assert.deepEqual(override.activeCrewIdsByTrade.Paint, {
    source: 'today-only-override',
    value: ['crew-paint-today'],
  });
  assert.deepEqual(override.walkthroughScheduleWording, {
    source: 'today-only-override',
    value: 'Today only: 2 PM walkthrough.',
  });
  assert.deepEqual(override.workingHoursWording, {
    source: 'today-only-override',
    value: 'Today only: 9 AM–4 PM.',
  });
  assert.deepEqual(override.propertyContact, {
    source: 'today-only-override',
    value: { id: 'contact-today', name: 'Today Contact' },
  });
  assert.equal(
    createConfiguration().defaultWalkthroughScheduleWording,
    '12:00',
  );
  assert.throws(
    () => resolveStartDayValues(
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
    activity: 4,
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
    queues: 'section-trades',
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

test('canonical consumer lists, badges, queue counts, and exact section-trade records stay in parity', () => {
  const projection = buildCanonicalFieldProjection({
    accountId: 'los-personal',
    activeDaySessionId: DAY_SESSION_ID,
    fieldEvents: [
      fieldEvent('event-work', 'work-started', 'unit-101'),
      fieldEvent('event-callback', 'callback-opened', 'unit-103'),
      fieldEvent('event-project', 'project-activated'),
    ],
    projectId: PROJECT_ID,
    todayTask: createTodayTask(),
    trackCState: createTrackCState(),
  });
  const consumers = projectCanonicalFieldConsumers(projection, new Set());

  assert.equal(projection.counts.working, projection.queues.working.length);
  assert.equal(projection.counts.waiting, projection.queues.waiting.length);
  assert.equal(projection.counts.callbacks, projection.queues.callbacks.length);
  assert.equal(projection.counts.ready, projection.queues['ready-to-walk'].length);
  assert.equal(projection.counts.activity, projection.activity.length);
  assert.equal(
    consumers.homeRecords.length,
    projection.counts.working
      + projection.counts.waiting
      + projection.counts.callbacks
      + projection.counts.ready,
  );
  const uniqueUnitTrades = (records: readonly { target: { unitId: string }; trade: string }[]) =>
    new Set(records.map((record) => `${record.target.unitId}:${record.trade}`)).size;
  assert.equal(
    consumers.notifications.filter((item) => item.category === 'callbacks').length,
    uniqueUnitTrades(projection.queues.callbacks),
  );
  assert.equal(
    consumers.notifications.filter((item) => item.category === 'inspections').length,
    uniqueUnitTrades(projection.queues['ready-to-walk']),
  );
  assert.equal(
    consumers.searchGroups.find((group) => group.id === 'activity')?.results.length,
    projection.counts.activity,
  );

  for (const record of projection.queues.working) {
    assert.equal(record.projection.release, 'released');
    assert.ok(record.projection.responsibleCrewId);
    assert.ok(['assigned', 'working'].includes(record.projection.execution));
  }
  for (const record of projection.queues.waiting) {
    assert.ok(record.waitingReasons.length > 0);
  }
  for (const record of projection.queues.callbacks) {
    assert.equal(record.projection.callbackOpen, true);
  }
  for (const record of projection.queues['ready-to-walk']) {
    assert.equal(record.projection.inspection, 'los-passed');
    assert.equal(record.projection.property, 'pending-property-walk');
  }
  assert.equal(
    projection.workRecords.some((record) =>
      record.projection.release === 'unreleased'
      && record.projection.confirmedEventCount === 0),
    false,
  );
});

test('canonical notifications group at Unit + Trade grain with sections in the reason', () => {
  const base = createTrackCState();
  const state: TrackCState = {
    ...base,
    events: [
      ...base.events,
      trackCEvent('assignment-unit-103-b', 'assignment-confirmed', 'unit-103', 'B'),
      trackCEvent('complete-unit-103-b', 'crew-reported-complete', 'unit-103', 'B'),
      trackCEvent('callback-unit-103-b', 'callback-opened', 'unit-103', 'B'),
    ],
    units: base.units.map((unit) => unit.id === 'unit-103'
      ? {
          ...unit,
          applicableSections: ['B', 'C'],
          workFacts: [
            ...unit.workFacts,
            { ...unit.workFacts[0], id: 'work-unit-103-b', section: 'B' as const },
          ],
        }
      : unit),
  };
  const projection = buildCanonicalFieldProjection({
    accountId: 'los-personal',
    activeDaySessionId: DAY_SESSION_ID,
    fieldEvents: [],
    projectId: PROJECT_ID,
    todayTask: createTodayTask(),
    trackCState: state,
  });
  assert.equal(projection.queues.callbacks.length, 2, 'both callback sections stay in the queue');

  const consumers = projectCanonicalFieldConsumers(projection, new Set());
  const callbackNotifications = consumers.notifications
    .filter((item) => item.category === 'callbacks');
  assert.equal(callbackNotifications.length, 1, 'one notification per unit and trade');
  assert.equal(callbackNotifications[0].title, 'Unit 103 · Paint');
  assert.equal(callbackNotifications[0].id, 'canonical-callback:unit-103:paint');
  assert.match(callbackNotifications[0].reason, /Room B/u);
  assert.match(callbackNotifications[0].reason, /Room C/u);
});

const activityItem = (
  id: string,
  overrides: Partial<TrackAFieldActivity> = {},
): TrackAFieldActivity => ({
  accountId: 'los-personal',
  boundary: 'personal-record',
  eventKind: 'assignment-recorded',
  id,
  projectId: PROJECT_ID,
  recordedAt: NOW,
  sourceEventId: id,
  sourceRefs: [],
  title: 'Crew assignment confirmed',
  wording: `${id} synthetic wording`,
  ...overrides,
});

test('Activity bursts collapse one bulk action into a single Unit + Trade row', () => {
  const grouped = groupFieldActivityBursts([
    activityItem('a-1', { recordedAt: '2026-07-29T14:00:03.000Z', section: 'C', trade: 'paint', unitId: 'unit-101' }),
    activityItem('a-2', { recordedAt: '2026-07-29T14:00:02.000Z', section: 'B', trade: 'paint', unitId: 'unit-101' }),
    activityItem('a-3', { recordedAt: '2026-07-29T14:00:01.000Z', section: 'A', trade: 'paint', unitId: 'unit-101' }),
    activityItem('a-4', { recordedAt: '2026-07-29T14:00:00.000Z', section: 'common', trade: 'paint', unitId: 'unit-101' }),
    activityItem('b-1', { recordedAt: '2026-07-29T13:59:00.000Z', section: 'A', trade: 'clean', unitId: 'unit-102' }),
  ]);

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].groupedCount, 4);
  assert.equal(grouped[0].id, 'a-1', 'group keeps the newest member as its head');
  assert.equal(grouped[0].section, undefined, 'grouped rows drop the single-section scope');
  assert.deepEqual(grouped[0].groupedSections, ['common', 'A', 'B', 'C']);
  assert.equal(grouped[1].groupedCount, 1);
  assert.equal(grouped[1].wording, 'b-1 synthetic wording', 'single rows keep their original wording');
});

test('Activity bursts never merge across the window, different titles, or unitless events', () => {
  const grouped = groupFieldActivityBursts([
    activityItem('recent', { recordedAt: '2026-07-29T14:30:00.000Z', section: 'A', trade: 'paint', unitId: 'unit-101' }),
    activityItem('stale', { recordedAt: '2026-07-29T14:00:00.000Z', section: 'B', trade: 'paint', unitId: 'unit-101' }),
    activityItem('other-title', { recordedAt: '2026-07-29T13:59:59.000Z', section: 'B', title: 'Work started', trade: 'paint', unitId: 'unit-101' }),
    activityItem('day-1', { recordedAt: '2026-07-29T13:59:58.000Z', title: 'Day started' }),
    activityItem('day-2', { recordedAt: '2026-07-29T13:59:57.000Z', title: 'Day started' }),
  ]);

  assert.deepEqual(
    grouped.map((item) => item.id),
    ['recent', 'stale', 'other-title', 'day-1', 'day-2'],
  );
  assert.ok(grouped.every((item) => item.groupedCount === 1));
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

test('canonical Activity preserves exact personal AppData notes alongside field events', () => {
  const activated = prepareProjectActivation(createData(), createDraft());
  assert.equal(activated.ok, true);
  if (!activated.ok) return;

  const exactNote = 'Unit walk reminder — exact personal wording.';
  const note = {
    action: 'Added personal note',
    createdAt: '2026-07-29T15:00:00.000Z',
    entityId: PROJECT_ID,
    entityType: 'Project' as const,
    id: 'activity-personal-note',
    note: exactNote,
    projectId: PROJECT_ID,
  };
  const adapterResult = adaptLegacyActivityLogsToActivity({
    accountId: 'los-personal',
    activityLogs: [note, note],
    projectId: PROJECT_ID,
  });
  assert.equal(adapterResult.length, 1);
  assert.equal(adapterResult[0].wording, exactNote);
  assert.equal(adapterResult[0].boundary, 'personal-record');
  assert.equal(adapterResult[0].sourceRefs[0].kind, 'app-data-record');

  const projection = buildCanonicalFieldProjectionFromAppData(
    {
      ...activated.data,
      activityLogs: [note, ...activated.data.activityLogs],
    },
    'los-personal',
  );
  assert.equal(projection.activity[0].wording, exactNote);
  assert.equal(projection.counts.activity, projection.activity.length);
  assert.equal(
    projection.activity.filter((activity) => activity.wording === exactNote).length,
    1,
  );
});

test('AppData projection adapter preserves project scope when no Day Session is active', () => {
  const activated = prepareProjectActivation(createData(), createDraft());
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
    'needs-crew': 0,
    'needs-inspection': 0,
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

test('the five-step setup clamp fails closed to a renderable controlled step', () => {
  assert.equal(PROJECT_SETUP_STEPS.length, 5);
  assert.deepEqual(
    PROJECT_SETUP_STEPS.map((step) => step.id),
    [
      'property',
      'contacts-schedule',
      'crews-permissions',
      'property-roster',
      'review-activate',
    ],
  );
  assert.equal(clampProjectSetupStep(-9), 0);
  assert.equal(clampProjectSetupStep(Number.NaN), 0);
  assert.equal(clampProjectSetupStep(2.9), 2);
  assert.equal(clampProjectSetupStep(99), 4);
});
