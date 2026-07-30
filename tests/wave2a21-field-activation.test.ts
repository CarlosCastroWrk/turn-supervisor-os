import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  addProjectContact,
  createProjectActivationDraft,
  prepareDraftForActivationAttempt,
  removeProjectContact,
} from '../src/features/wave2a21-field-activation/model.ts';
import {
  prepareProjectActivation,
} from '../src/features/wave2a21-track-a/activation.ts';
import {
  applyTrackCWalkDraftChange,
  projectTrackCState,
  projectTrackCWalkDraft,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
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

const createRealSeedData = () => {
  const data = structuredClone(seedData) as AppData;
  data.projects = data.projects.map((project) =>
    project.id === data.activeProjectId
      ? { ...project, mode: 'real' as const }
      : project);
  return data;
};

const createConfiguredData = () => {
  const data = createRealSeedData();
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
  const data = createRealSeedData();
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

test('starting Setup from Demo creates an isolated real-project draft without sample crews or Units', () => {
  const data = structuredClone(seedData) as AppData;
  const draft = createProjectActivationDraft(data, NOW, 'Los');

  assert.notEqual(draft.project.id, data.activeProjectId);
  assert.equal(draft.project.mode, 'real');
  assert.equal(draft.project.propertyName, '');
  assert.deepEqual(draft.crews, []);
  assert.deepEqual(draft.units, []);
  assert.deepEqual(draft.configuration.defaultCrewIdsByTrade, {
    clean: [],
    paint: [],
  });
  assert.ok(draft.contacts.every((contact) => contact.projectId === draft.project.id));
  assert.equal(
    data.units.some((unit) => unit.projectId === draft.project.id),
    false,
    'sample Units must remain attached only to the Demo project',
  );
});

test('isolated activation persists only the new personal roster and crews under the new active project', () => {
  const source = structuredClone(seedData) as AppData;
  const initial = createProjectActivationDraft(source, NOW, 'Los');
  const contactId = initial.configuration.defaultPropertyContactId;
  const draft = {
    ...initial,
    configuration: {
      ...initial.configuration,
      defaultCrewIdsByTrade: {
        clean: ['crew-moon-clean'],
        paint: ['crew-moon-paint'],
      },
      defaultWalkthroughScheduleWording: '12:00',
      defaultWorkingHoursWording: '08:00–18:00',
    },
    contacts: initial.contacts.map((contact) => ({
      ...contact,
      activeForProject: true,
      isPrimary: contact.id === contactId,
      name: 'Synthetic Property Contact',
      role: 'Property Manager' as const,
      title: 'Property Manager',
    })),
    crews: [
      {
        active: true,
        id: 'crew-moon-paint',
        name: 'Synthetic Paint',
        projectId: initial.project.id,
        trade: 'paint' as const,
      },
      {
        active: true,
        id: 'crew-moon-clean',
        name: 'Synthetic Clean',
        projectId: initial.project.id,
        trade: 'clean' as const,
      },
    ],
    project: {
      ...initial.project,
      endDate: '2026-08-15',
      location: 'Synthetic Austin property',
      name: 'Moon Tower',
      propertyName: 'Moon Tower',
      startDate: '2026-08-01',
    },
    units: [{
      building: 'Building A',
      floor: 'Floor 1',
      id: `unit:${initial.project.id}:101`,
      projectId: initial.project.id,
      unitNumber: '101',
      unitType: 3 as const,
    }],
  };

  const prepared = prepareProjectActivation(source, draft);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.data.activeProjectId, draft.project.id);
  assert.deepEqual(
    prepared.data.units
      .filter((unit) => unit.projectId === draft.project.id)
      .map((unit) => unit.unitNumber),
    ['101'],
  );
  assert.deepEqual(
    prepared.data.crewMembers
      .filter((crew) => crew.projectId === draft.project.id)
      .map((crew) => crew.name)
      .sort(),
    ['Synthetic Clean', 'Synthetic Paint'],
  );
  assert.equal(
    prepared.data.fieldEvents.some((event) =>
      event.projectId === draft.project.id && event.summary.includes('sample')),
    false,
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

test('actual-host Walk draft envelope preserves exact notes and review stage without a schema change', () => {
  const data = structuredClone(seedData) as AppData;
  const projectId = data.activeProjectId;
  const target = {
    section: 'common' as const,
    trade: 'paint' as const,
    unitId: 'unit_101',
  };
  const reviewedSelection = {
    access: 'clear' as const,
    assignmentConflict: false,
    callbackOpen: false,
    confirmedEventCount: 3,
    inspection: 'los-passed' as const,
    property: 'pending-property-walk' as const,
    release: 'released' as const,
    responsibleCrewId: 'crew_painter',
    sourceConfidence: 'confirmed' as const,
    target,
  };
  const activeData: AppData = {
    ...data,
    dailyReleaseBatches: [{
      confirmedAt: NOW,
      confirmedBy: 'Los',
      createdAt: NOW,
      date: '2026-08-01',
      id: 'release-walk-draft',
      items: [{
        id: 'release-walk-draft:item:1',
        section: 'common',
        sourceExcerpt: 'Synthetic exact Walk draft test.',
        trade: 'paint',
        unitId: 'unit_101',
      }],
      projectId,
      propertyContact: 'Synthetic Property Contact',
      sourceLabel: 'Synthetic exact Walk draft test',
      sourceType: 'manual',
      status: 'confirmed',
      uncertainties: [],
      updatedAt: NOW,
    }],
    daySessions: [{
      activeCleanCrewIds: [],
      activePaintCrewIds: ['crew_painter'],
      createdAt: NOW,
      date: '2026-08-01',
      id: 'day-walk-draft',
      keyStatus: 'yes',
      morningNote: '',
      projectId,
      propertyContact: 'Synthetic Property Contact',
      releaseBatchIds: ['release-walk-draft'],
      startedAt: NOW,
      startedBy: 'Los',
      status: 'active',
      updatedAt: NOW,
    }],
    walkSessions: [{
      createdAt: NOW,
      daySessionId: 'day-walk-draft',
      id: 'walk-draft',
      note: `turn-os-track-c-review-v1:${JSON.stringify([reviewedSelection])}`,
      outcomes: [],
      projectId,
      propertyContact: 'Synthetic Property Contact',
      selectedItemIds: ['release-walk-draft:item:1'],
      startedAt: NOW,
      startedBy: 'Los',
      status: 'active',
      updatedAt: NOW,
    }],
  };
  const draft = {
    outcomes: [{
      note: 'Touch up behind the door — preserve this exact wording.',
      outcome: 'correction-requested' as const,
      target,
    }],
    stage: 'end-review' as const,
    updatedAt: LATER,
    version: 1 as const,
    walkSessionId: 'walk-draft',
  };

  const persisted = applyTrackCWalkDraftChange(activeData, draft);
  assert.deepEqual(projectTrackCWalkDraft(persisted), draft);
  assert.deepEqual(
    projectTrackCState(persisted).activeWalk?.outcomes,
    draft.outcomes,
  );
  assert.deepEqual(
    persisted.walkSessions[0]?.outcomes,
    [],
    'active Walk outcomes must remain draft evidence until End Walk succeeds',
  );
  const reloaded = parseJsonBackup(JSON.stringify(persisted));
  assert.deepEqual(projectTrackCWalkDraft(reloaded), draft);
  assert.deepEqual(
    projectTrackCState(reloaded).activeWalk?.outcomes,
    draft.outcomes,
  );

  const clearedDraft = applyTrackCWalkDraftChange(persisted, undefined);
  assert.equal(projectTrackCWalkDraft(clearedDraft), undefined);
  assert.deepEqual(
    projectTrackCState(clearedDraft).activeWalk?.outcomes,
    draft.outcomes,
    'clearing transient review state must not erase the recorded outcome or note',
  );
});
