import { seedData } from './seed';
import {
  appendManualReleaseBatchOnce,
  applyTrackCStateChange,
  projectTrackCState,
  setTradeReleaseState,
} from '../features/wave2a2-core/appDataAdapters';
import {
  applyTrackCSectionAction,
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
  recordTrackCDirectPropertyAcceptance,
  type TrackCSectionAction,
} from '../features/wave2a2-track-c/operations';
import type { TrackCSection } from '../features/wave2a2-track-c/model';
import type {
  AppData,
  CrewMember,
  DaySession,
  Floor,
  Project,
  PropertyContact,
  Unit,
} from '../types';

// The Demo Turn: a fully playable FAKE tower that behaves exactly like a real
// one — release, assign, crew-done, callbacks, walks, payroll — because it is
// built by driving the SAME writers the field app uses, never hand-forged
// events. Hard wall: every entity carries the demo project id, every crew
// phone is empty (a tapped send link goes nowhere), and enter/exit only ever
// filters on that id, so the real turn cannot be touched from inside the demo.

const DEMO_PREFIX = 'demo-tower-';
// The project id itself carries the prefix so the strip/merge filters catch
// the project entity too, not just its children.
export const DEMO_TOWER_PROJECT_ID = 'demo-tower-project';

const localDayOf = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const shiftIso = (iso: string, hours: number): string =>
  new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();

interface DemoStoryHandles {
  data: AppData;
  seq: number;
}

const demoUnits = (createdAt: string): Unit[] => {
  const units: Unit[] = [];
  for (let floor = 1; floor <= 4; floor += 1) {
    for (let slot = 1; slot <= 4; slot += 1) {
      const unitNumber = `${floor}0${slot}`;
      units.push({
        assignedCrewIds: [],
        bathroomCount: 2,
        bedCount: slot === 4 ? 4 : 3,
        buildingId: `${DEMO_PREFIX}building`,
        cleanStatus: 'Not Started',
        createdAt,
        flooringStatus: 'Not Applicable',
        floorId: `${DEMO_PREFIX}floor-${floor}`,
        hasCommonArea: true,
        id: `${DEMO_PREFIX}unit-${unitNumber}`,
        inspectionStatus: 'Not Started',
        notes: '',
        overallStatus: 'Not Started',
        paintStatus: 'Not Started',
        projectId: DEMO_TOWER_PROJECT_ID,
        repairStatus: 'Not Applicable',
        trashStatus: 'Not Started',
        unitNumber,
        updatedAt: createdAt,
      } as Unit);
    }
  }
  return units;
};

const demoCrews = (createdAt: string): CrewMember[] => ([
  { name: 'Blue Crew (demo)', trade: 'Painter' },
  { name: 'Red Crew (demo)', trade: 'Painter' },
  { name: 'Green Crew (demo)', trade: 'Cleaner' },
  { name: 'Gold Crew (demo)', trade: 'Cleaner' },
] as const).map((crew, index): CrewMember => ({
  active: true,
  assignedLocation: '',
  company: 'Demo crews only',
  createdAt,
  id: `${DEMO_PREFIX}crew-${index + 1}`,
  language: 'Español',
  name: crew.name,
  notes: 'Demo crew — no phone on purpose, sends go nowhere.',
  phone: '',
  projectId: DEMO_TOWER_PROJECT_ID,
  trade: crew.trade,
  updatedAt: createdAt,
}));

const demoProjectEntity = (nowIso: string, contactId: string, crewIds: {
  clean: readonly string[];
  paint: readonly string[];
}): Project => ({
  aiBudgetUsd: 0,
  createdAt: nowIso,
  endDate: '',
  estimatedBeds: 52,
  estimatedBuildings: 1,
  estimatedCommonAreas: 16,
  estimatedUnits: 16,
  fieldConfiguration: {
    activatedAt: nowIso,
    activatedBy: 'Los',
    defaultCrewIdsByTrade: { clean: crewIds.clean, paint: crewIds.paint },
    defaultPropertyContactId: contactId,
    defaultWalkthroughScheduleWording: 'Walks in the afternoon, demo pace',
    defaultWorkingHoursWording: '9 AM to 5 PM (demo)',
    enabledTrades: { clean: true, paint: true },
    permissions: {
      officialApprovals: false,
      paperTurnBoardAuthoritative: true,
      payrollCalculations: false,
      personalAppData: 'synthetic-or-explicitly-approved-only',
      photos: 'not-confirmed',
    },
    projectId: DEMO_TOWER_PROJECT_ID,
    role: 'turn-supervisor',
    status: 'active',
    version: 1,
  },
  id: DEMO_TOWER_PROJECT_ID,
  location: 'Anywhere, USA',
  mode: 'demo',
  name: 'Demo Tower',
  notes: 'A fake tower for showing and practicing. Nothing here is real.',
  projectManagerName: 'Jordan (demo)',
  propertyName: 'Demo Tower',
  startDate: localDayOf(shiftIso(nowIso, -24)),
  supervisorName: 'Los',
  updatedAt: nowIso,
} as Project);

const sectionAction = (
  handles: DemoStoryHandles,
  stateActions: {
    action: TrackCSectionAction;
    at: string;
    section: TrackCSection;
    trade: 'clean' | 'paint';
    unitNumber: string;
  }[],
): void => {
  let state = projectTrackCState(handles.data);
  for (const step of stateActions) {
    const unit = state.units.find((candidate) => candidate.unitNumber === step.unitNumber);
    if (!unit) throw new Error(`demo build: unit ${step.unitNumber} missing`);
    const result = applyTrackCSectionAction(state, {
      action: step.action,
      eventId: `${DEMO_PREFIX}ev-${(handles.seq += 1)}`,
      recordedAt: step.at,
      recordedBy: 'Los',
      target: { section: step.section, trade: step.trade, unitId: unit.id },
    });
    if (!result.ok) throw new Error(`demo build: ${step.action} ${step.unitNumber} ${step.section} failed`);
    state = result.value;
  }
  handles.data = applyTrackCStateChange(handles.data, state);
};

const assignUnits = (
  handles: DemoStoryHandles,
  input: { at: string; crewName: string; trade: 'clean' | 'paint'; unitNumbers: string[] },
): void => {
  const state = projectTrackCState(handles.data);
  const crew = state.crews.find((candidate) => candidate.name === input.crewName);
  if (!crew) throw new Error(`demo build: crew ${input.crewName} missing`);
  const unitIds = input.unitNumbers.map((unitNumber) => {
    const unit = state.units.find((candidate) => candidate.unitNumber === unitNumber);
    if (!unit) throw new Error(`demo build: unit ${unitNumber} missing`);
    return unit.id;
  });
  const proposal = createTrackCBulkAssignmentProposal(state, {
    createdAt: input.at,
    createdBy: 'Los',
    crewId: crew.id,
    proposalId: `${DEMO_PREFIX}prop-${(handles.seq += 1)}`,
    sectionMode: 'all-released',
    trade: input.trade,
    unitIds,
  });
  const confirmed = confirmTrackCBulkAssignmentProposal(state, proposal, {
    confirmed: true,
    eventIdPrefix: `${DEMO_PREFIX}asg-${(handles.seq += 1)}`,
    recordedAt: input.at,
    recordedBy: 'Los',
  });
  if (!confirmed.ok) throw new Error(`demo build: assign ${input.crewName} failed`);
  handles.data = applyTrackCStateChange(handles.data, confirmed.value.state);
};

const releaseUnits = (
  handles: DemoStoryHandles,
  input: {
    at: string;
    trade: 'clean' | 'paint';
    units: { unitNumber: string; workType?: 'cut-in' | 'full' | 'heavy-clean' | 'touch-up' }[];
  },
): void => {
  for (const entry of input.units) {
    const unit = handles.data.units.find((candidate) =>
      candidate.projectId === DEMO_TOWER_PROJECT_ID && candidate.unitNumber === entry.unitNumber);
    if (!unit) throw new Error(`demo build: unit ${entry.unitNumber} missing`);
    handles.data = setTradeReleaseState(handles.data, {
      idFactory: (prefix: string) => `${DEMO_PREFIX}${prefix}-${(handles.seq += 1)}`,
      nowIso: shiftIso(input.at, handles.seq * 0.0001),
      released: true,
      trade: input.trade,
      unitId: unit.id,
      workType: entry.workType,
    });
  }
};

const acceptUnits = (
  handles: DemoStoryHandles,
  input: { at: string; trade: 'clean' | 'paint'; unitNumbers: string[] },
): void => {
  let state = projectTrackCState(handles.data);
  for (const unitNumber of input.unitNumbers) {
    const unit = state.units.find((candidate) => candidate.unitNumber === unitNumber);
    if (!unit) throw new Error(`demo build: unit ${unitNumber} missing`);
    const result = recordTrackCDirectPropertyAcceptance(state, {
      idFactory: (prefix: string) => `${DEMO_PREFIX}${prefix}-${(handles.seq += 1)}`,
      recordedAt: input.at,
      recordedBy: 'Los',
      trade: input.trade,
      unitId: unit.id,
    });
    if (!result.ok) throw new Error(`demo build: accept ${unitNumber} failed`);
    state = result.value;
  }
  handles.data = applyTrackCStateChange(handles.data, state);
};

const demoSession = (id: string, dayIso: string, contact: string): DaySession => ({
  activeCleanCrewIds: [],
  activePaintCrewIds: [],
  createdAt: dayIso,
  date: localDayOf(dayIso),
  id,
  keyStatus: 'yes',
  morningNote: '',
  projectId: DEMO_TOWER_PROJECT_ID,
  propertyContact: contact,
  releaseBatchIds: [],
  startedAt: dayIso,
  startedBy: 'Los',
  status: 'active',
  updatedAt: dayIso,
} as DaySession);

// Build the whole demo world on a scratch AppData whose ONLY project is the
// demo tower, by replaying a believable day-and-a-half of turn work.
export const buildDemoTurnScratch = (nowIso: string): AppData => {
  const created = shiftIso(nowIso, -30);
  const contact: PropertyContact = {
    createdAt: created,
    id: `${DEMO_PREFIX}contact`,
    isPrimary: true,
    name: 'Jordan (demo property)',
    phone: '',
    projectId: DEMO_TOWER_PROJECT_ID,
    title: 'Property Manager',
    updatedAt: created,
  };
  const crews = demoCrews(created);
  const project = demoProjectEntity(nowIso, contact.id, {
    clean: crews.filter((crew) => crew.trade === 'Cleaner').map((crew) => crew.id),
    paint: crews.filter((crew) => crew.trade === 'Painter').map((crew) => crew.id),
  });
  const scratchBase = structuredClone(seedData) as AppData;
  const scratch: AppData = {
    ...scratchBase,
    activeProjectId: DEMO_TOWER_PROJECT_ID,
    activityLogs: [],
    agentRuns: [],
    aiUsageEvents: [],
    assignments: [],
    buildings: [{
      createdAt: created,
      id: `${DEMO_PREFIX}building`,
      name: 'Demo Tower',
      notes: '',
      projectId: DEMO_TOWER_PROJECT_ID,
      updatedAt: created,
    }],
    copilotConversations: [],
    dailyLogs: [],
    dailyReleaseBatches: [],
    daySessions: [],
    draftActions: [],
    fieldEvents: [],
    floors: [1, 2, 3, 4].map((floor): Floor => ({
      buildingId: `${DEMO_PREFIX}building`,
      createdAt: created,
      id: `${DEMO_PREFIX}floor-${floor}`,
      name: `Floor ${floor}`,
      notes: '',
      updatedAt: created,
    })),
    followUpTasks: [],
    issues: [],
    memories: [],
    memoryCandidates: [],
    photoNotes: [],
    projects: [project],
    propertyContacts: [contact],
    reportDrafts: [],
    smartSuggestions: [],
    todayTasks: [],
    trainingQuestions: [],
    units: demoUnits(created),
    walkSessions: [],
    crewMembers: crews,
  };

  const handles: DemoStoryHandles = { data: scratch, seq: 0 };
  const yesterday = shiftIso(nowIso, -26); // yesterday morning
  const today = shiftIso(nowIso, -3); // this morning

  // ---- Yesterday: Jordan releases floors 1–2, crews work, walks happen ----
  handles.data = {
    ...handles.data,
    daySessions: [demoSession(`${DEMO_PREFIX}day-1`, yesterday, contact.name)],
  };
  releaseUnits(handles, {
    at: shiftIso(yesterday, 0.5),
    trade: 'paint',
    units: [
      { unitNumber: '101', workType: 'full' },
      { unitNumber: '102', workType: 'touch-up' },
      { unitNumber: '103', workType: 'cut-in' },
      { unitNumber: '104', workType: 'full' },
      { unitNumber: '201', workType: 'touch-up' },
      { unitNumber: '202', workType: 'full' },
    ],
  });
  releaseUnits(handles, {
    at: shiftIso(yesterday, 0.6),
    trade: 'clean',
    units: [
      { unitNumber: '101' },
      { unitNumber: '102', workType: 'heavy-clean' },
      { unitNumber: '103' },
    ],
  });
  assignUnits(handles, { at: shiftIso(yesterday, 1), crewName: 'Blue Crew (demo)', trade: 'paint', unitNumbers: ['101', '102', '103'] });
  assignUnits(handles, { at: shiftIso(yesterday, 1.1), crewName: 'Red Crew (demo)', trade: 'paint', unitNumbers: ['104', '201', '202'] });
  assignUnits(handles, { at: shiftIso(yesterday, 1.2), crewName: 'Green Crew (demo)', trade: 'clean', unitNumbers: ['101', '102'] });

  const doneRooms = (unitNumbers: string[], trade: 'clean' | 'paint', sections: TrackCSection[], at: string) =>
    unitNumbers.flatMap((unitNumber) => sections.flatMap((section) => ([
      { action: 'start-work' as const, at, section, trade, unitNumber },
      { action: 'record-crew-complete' as const, at: shiftIso(at, 0.2), section, trade, unitNumber },
    ])));
  sectionAction(handles, doneRooms(['101', '102'], 'paint', ['common', 'A', 'B', 'C'], shiftIso(yesterday, 3)));
  sectionAction(handles, doneRooms(['103'], 'paint', ['common', 'A'], shiftIso(yesterday, 4)));
  sectionAction(handles, doneRooms(['104'], 'paint', ['common', 'A', 'B', 'C', 'D'], shiftIso(yesterday, 4.5)));
  sectionAction(handles, doneRooms(['101'], 'clean', ['common', 'A', 'B', 'C'], shiftIso(yesterday, 5)));
  // Los walks: passes 101/102 paint, opens a callback on 104 room B.
  sectionAction(handles, ['101', '102'].flatMap((unitNumber) =>
    (['common', 'A', 'B', 'C'] as TrackCSection[]).map((section) => ({
      action: 'record-los-pass' as const, at: shiftIso(yesterday, 6), section, trade: 'paint' as const, unitNumber,
    }))));
  sectionAction(handles, [{ action: 'open-callback', at: shiftIso(yesterday, 6.5), section: 'B', trade: 'paint', unitNumber: '104' }]);
  // Jordan accepts 101 and 102 paint on the afternoon walk.
  acceptUnits(handles, { at: shiftIso(yesterday, 7), trade: 'paint', unitNumbers: ['101', '102'] });

  // Yesterday ends.
  handles.data = {
    ...handles.data,
    daySessions: handles.data.daySessions.map((session) =>
      session.id === `${DEMO_PREFIX}day-1`
        ? {
          ...session,
          endedAt: shiftIso(yesterday, 9),
          endedBy: 'Los',
          status: 'closed' as const,
          updatedAt: shiftIso(yesterday, 9),
        }
        : session),
  };

  // ---- Today: fresh releases, work in flight, plenty left to play with ----
  handles.data = {
    ...handles.data,
    daySessions: [...handles.data.daySessions, demoSession(`${DEMO_PREFIX}day-2`, today, contact.name)],
  };
  releaseUnits(handles, {
    at: shiftIso(today, 0.4),
    trade: 'paint',
    units: [
      { unitNumber: '203', workType: 'full' },
      { unitNumber: '204', workType: 'cut-in' },
      { unitNumber: '301', workType: 'touch-up' },
      { unitNumber: '302', workType: 'full' },
    ],
  });
  releaseUnits(handles, {
    at: shiftIso(today, 0.5),
    trade: 'clean',
    units: [{ unitNumber: '104' }, { unitNumber: '201' }],
  });
  assignUnits(handles, { at: shiftIso(today, 1), crewName: 'Blue Crew (demo)', trade: 'paint', unitNumbers: ['203'] });
  assignUnits(handles, { at: shiftIso(today, 1.1), crewName: 'Gold Crew (demo)', trade: 'clean', unitNumbers: ['104'] });
  sectionAction(handles, doneRooms(['203'], 'paint', ['common', 'A'], shiftIso(today, 2)));
  // 204, 301, 302 paint and 201 clean stay unassigned — live Needs Crew work
  // for whoever is holding the phone.

  return handles.data;
};

const DEMO_COLLECTIONS = [
  'activityLogs', 'buildings', 'crewMembers', 'dailyLogs', 'dailyReleaseBatches',
  'daySessions', 'fieldEvents', 'photoNotes', 'projects', 'propertyContacts',
  'reportDrafts', 'todayTasks', 'units', 'walkSessions', 'assignments', 'issues',
] as const;

type DemoCollection = (typeof DEMO_COLLECTIONS)[number];

const withoutDemoTower = (data: AppData): AppData => {
  const next = { ...data };
  for (const key of DEMO_COLLECTIONS) {
    const items = (data[key] ?? []) as { buildingId?: string; id?: string; projectId?: string }[];
    (next as Record<DemoCollection, unknown>)[key] = items.filter((item) =>
      item.projectId !== DEMO_TOWER_PROJECT_ID
      && !(item.id ?? '').startsWith(DEMO_PREFIX)
      && !(item.buildingId ?? '').startsWith(DEMO_PREFIX));
  }
  return next;
};

export type DemoTurnResult =
  | { readonly ok: true; readonly data: AppData }
  | { readonly ok: false; readonly reason: string };

// Enter (or reset) the Demo Turn: strip any previous demo slice, generate a
// fresh one, and switch onto it. The real turn — sealed or live — is carried
// through untouched.
export const enterDemoTurn = (data: AppData, nowIso: string): DemoTurnResult => {
  let scratch: AppData;
  try {
    scratch = buildDemoTurnScratch(nowIso);
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : 'Demo build failed.' };
  }
  const cleaned = withoutDemoTower(data);
  const merged: AppData = { ...cleaned, activeProjectId: DEMO_TOWER_PROJECT_ID };
  for (const key of DEMO_COLLECTIONS) {
    const scratchItems = (scratch[key] ?? []) as { projectId?: string; id?: string; buildingId?: string }[];
    const demoItems = scratchItems.filter((item) =>
      item.projectId === DEMO_TOWER_PROJECT_ID
      || (item.id ?? '').startsWith(DEMO_PREFIX)
      || (item.buildingId ?? '').startsWith(DEMO_PREFIX));
    (merged as Record<DemoCollection, unknown>)[key] = [
      ...((cleaned[key] ?? []) as unknown[]),
      ...demoItems,
    ];
  }
  return { ok: true, data: merged };
};

// Leave the demo: back to the most recent REAL turn — a sealed one counts
// (browsing the saved record is exactly where Los left off). The demo slice
// stays behind for an instant re-enter; Reset regenerates it.
export const exitDemoTurn = (data: AppData): DemoTurnResult => {
  const realProjects = data.projects
    .filter((project) => project.mode === 'real')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const target = realProjects.find((project) => !project.archivedAt) ?? realProjects[0];
  if (!target) {
    return { ok: false, reason: 'No real turn to go back to — set one up from More → Project Setup.' };
  }
  return { ok: true, data: { ...data, activeProjectId: target.id } };
};

export const isDemoTurnActive = (data: AppData): boolean =>
  data.activeProjectId === DEMO_TOWER_PROJECT_ID;
