import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  addProjectContact,
  createProjectActivationDraft,
  prepareDraftForActivationAttempt,
  removeProjectContact,
} from '../src/features/wave2a21-field-activation/model.ts';
import { START_DAY_STEPS } from '../src/features/wave2a2-track-b/model.ts';
import { parseJsonBackup } from '../src/lib/backups.ts';
import { buildJsonBackup } from '../src/lib/exporters.ts';
import {
  buildAppHash,
  parseAppHash,
  routeForNavigation,
} from '../src/lib/routing.ts';
import {
  mergeRemoteData,
  replaceRemoteData,
} from '../src/lib/supabase/sync.ts';
import type { AppData } from '../src/types.ts';

const NOW = '2026-07-29T15:00:00.000Z';
const LATER = '2026-07-29T15:05:00.000Z';

const createConfiguredData = () => {
  const data = structuredClone(seedData) as AppData;
  const initialDraft = createProjectActivationDraft(data, NOW, 'Los');
  const draft = {
    ...initialDraft,
    configuration: {
      ...initialDraft.configuration,
      defaultWalkthroughScheduleWording: 'Synthetic daily walkthrough at noon.',
      defaultWorkingHoursWording: 'Synthetic occupied-area window: 10 AM–5 PM.',
    },
  };
  const configured: AppData = {
    ...data,
    projects: data.projects.map((project) => (
      project.id === draft.project.id
        ? { ...project, fieldConfiguration: draft.configuration }
        : project
    )),
    propertyContacts: draft.contacts.map((contact) => structuredClone(contact)),
  };
  return { configured, draft };
};

test('host activation draft keeps the personal authority boundary and one primary contact', () => {
  const data = structuredClone(seedData) as AppData;
  const draft = createProjectActivationDraft(data, NOW, 'Los');

  assert.deepEqual(draft.configuration.enabledTrades, {
    clean: true,
    paint: true,
  });
  assert.deepEqual(draft.configuration.permissions, {
    officialApprovals: false,
    paperTurnBoardAuthoritative: true,
    payrollCalculations: false,
    personalAppData: 'synthetic-or-explicitly-approved-only',
    photos: 'not-confirmed',
  });
  assert.deepEqual(
    draft.configuration.defaultCrewIdsByTrade.paint,
    data.crewMembers
      .filter((crew) =>
        crew.active
        && crew.projectId === data.activeProjectId
        && crew.trade === 'Painter')
      .map((crew) => crew.id),
  );
  assert.deepEqual(
    draft.configuration.defaultCrewIdsByTrade.clean,
    data.crewMembers
      .filter((crew) =>
        crew.active
        && crew.projectId === data.activeProjectId
        && crew.trade === 'Cleaner')
      .map((crew) => crew.id),
  );
  assert.equal(draft.contacts.filter((contact) => contact.isPrimary).length, 1);
  assert.equal(
    draft.configuration.defaultPropertyContactId,
    draft.contacts.find((contact) => contact.isPrimary)?.id,
  );
});

test('contact add/remove and activation-attempt refresh preserve a valid retryable draft', () => {
  const data = structuredClone(seedData) as AppData;
  const initial = createProjectActivationDraft(data, NOW, 'Los');
  const added = addProjectContact(initial, 'property-contact:synthetic-secondary', NOW);

  assert.equal(added.contacts.length, initial.contacts.length + 1);
  assert.equal(added.contacts.filter((contact) => contact.isPrimary).length, 1);

  const originalPrimaryId = initial.configuration.defaultPropertyContactId;
  const removed = removeProjectContact(added, originalPrimaryId);
  assert.equal(removed.contacts.some((contact) => contact.id === originalPrimaryId), false);
  assert.equal(removed.contacts.filter((contact) => contact.isPrimary).length, 1);
  assert.equal(
    removed.configuration.defaultPropertyContactId,
    removed.contacts.find((contact) => contact.isPrimary)?.id,
  );

  const beforeRefresh = structuredClone(removed);
  const refreshed = prepareDraftForActivationAttempt(removed, LATER, 'Los');
  assert.deepEqual(removed, beforeRefresh, 'refresh must not mutate the retryable source draft');
  assert.equal(refreshed.configuration.activatedAt, LATER);
  assert.equal(refreshed.project.updatedAt, LATER);
  assert.ok(refreshed.contacts.every((contact) => contact.updatedAt === LATER));
  assert.deepEqual(refreshed.configuration.permissions, initial.configuration.permissions);
});

test('backup and remote reconciliation preserve local-only project activation configuration', () => {
  const { configured, draft } = createConfiguredData();
  const restored = parseJsonBackup(buildJsonBackup(configured));

  assert.deepEqual(
    restored.projects.find((project) => project.id === configured.activeProjectId)
      ?.fieldConfiguration,
    draft.configuration,
  );
  assert.deepEqual(restored.propertyContacts, draft.contacts);

  const remoteProject = {
    ...structuredClone(configured.projects[0]),
    fieldConfiguration: undefined,
    updatedAt: LATER,
  };
  const remote = { projects: [remoteProject] };

  for (const reconciled of [
    mergeRemoteData(configured, remote),
    replaceRemoteData(configured, remote),
  ]) {
    assert.deepEqual(
      reconciled.projects.find((project) => project.id === configured.activeProjectId)
        ?.fieldConfiguration,
      draft.configuration,
    );
    assert.deepEqual(reconciled.propertyContacts, draft.contacts);
  }
});

test('Today’s Task route round-trips and Start Day remains exactly eight listed steps', () => {
  const route = routeForNavigation(
    'dashboard',
    undefined,
    { homeSummary: 'today-task' },
  );

  assert.equal(buildAppHash(route), '#/dashboard?summary=today-task');
  assert.deepEqual(parseAppHash(buildAppHash(route)), {
    homeSummary: 'today-task',
    unitStatusFilter: 'All',
    view: 'dashboard',
  });
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
});
