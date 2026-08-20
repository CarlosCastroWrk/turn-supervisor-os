import { seedData } from './seed';
import { appendPersonalNoteActivity } from '../features/wave2a1-native/track-c/personalActivity';
import {
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
//
// Shaped like Moon Tower for the Rey demo: one tower, ~200 units (floors 3–12,
// 20 per floor), each with a Común and 2–4 beds, worked to a believable
// mid-turn board — every queue populated, hundreds of units still to play.

const DEMO_PREFIX = 'demo-tower-';
// The project id itself carries the prefix so the strip/merge filters catch
// the project entity too, not just its children.
export const DEMO_TOWER_PROJECT_ID = 'demo-tower-project';

const FLOORS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const SLOTS_PER_FLOOR = 20;
export const DEMO_UNIT_COUNT = FLOORS.length * SLOTS_PER_FLOOR; // 200

// 2–4 beds, cycling so the tower averages ~3 beds/unit like a real student turn.
const bedsForSlot = (slot: number): number => 2 + (slot % 3);
const SECTION_LETTERS: TrackCSection[] = ['A', 'B', 'C', 'D'];
const sectionsForBeds = (beds: number): TrackCSection[] => ['common', ...SECTION_LETTERS.slice(0, beds)];
const slotOfUnit = (unitNumber: string): number => Number(unitNumber.slice(-2));
const sectionsForUnit = (unitNumber: string): TrackCSection[] => sectionsForBeds(bedsForSlot(slotOfUnit(unitNumber)));
const unitNo = (floor: number, slot: number): string => `${floor}${String(slot).padStart(2, '0')}`;
const floorRange = (floor: number, from: number, to: number): string[] => {
  const out: string[] = [];
  for (let slot = from; slot <= to; slot += 1) out.push(unitNo(floor, slot));
  return out;
};

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
  for (const floor of FLOORS) {
    for (let slot = 1; slot <= SLOTS_PER_FLOOR; slot += 1) {
      const unitNumber = unitNo(floor, slot);
      units.push({
        assignedCrewIds: [],
        bathroomCount: 2,
        bedCount: bedsForSlot(slot),
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

const demoCrews = (createdAt: string, demoPhone: string): CrewMember[] => ([
  { name: 'Blue Crew (demo)', trade: 'Painter' },
  { name: 'Red Crew (demo)', trade: 'Painter' },
  { name: 'Silver Crew (demo)', trade: 'Painter' },
  { name: 'Green Crew (demo)', trade: 'Cleaner' },
  { name: 'Gold Crew (demo)', trade: 'Cleaner' },
  { name: 'Teal Crew (demo)', trade: 'Cleaner' },
] as const).map((crew, index): CrewMember => ({
  active: true,
  assignedLocation: '',
  company: 'Demo crews only',
  createdAt,
  id: `${DEMO_PREFIX}crew-${index + 1}`,
  language: 'Español',
  name: crew.name,
  notes: demoPhone
    ? 'Demo crew — texts go to YOUR number so you can show the real flow.'
    : 'Demo crew — no phone on purpose, sends go nowhere.',
  phone: demoPhone,
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
  estimatedBeds: 600,
  estimatedBuildings: 1,
  estimatedCommonAreas: DEMO_UNIT_COUNT,
  estimatedUnits: DEMO_UNIT_COUNT,
  fieldConfiguration: {
    activatedAt: nowIso,
    activatedBy: 'Los',
    defaultCrewIdsByTrade: { clean: crewIds.clean, paint: crewIds.paint },
    defaultPropertyContactId: contactId,
    defaultWalkthroughScheduleWording: 'Walks in the afternoon',
    defaultWorkingHoursWording: '9 AM to 5 PM',
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
  location: 'Austin, TX',
  mode: 'demo',
  name: 'Moon Tower',
  notes: 'Demo turn for showing and practicing — a fake Moon Tower. Nothing here syncs or is real.',
  projectManagerName: 'Joseph',
  propertyName: 'Moon Tower',
  startDate: localDayOf(shiftIso(nowIso, -24)),
  supervisorName: 'Los',
  updatedAt: nowIso,
} as Project);

interface SectionStep {
  action: TrackCSectionAction;
  at: string;
  section: TrackCSection;
  trade: 'clean' | 'paint';
  unitNumber: string;
}

const sectionAction = (handles: DemoStoryHandles, stateActions: SectionStep[]): void => {
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

// Section-step builders: work each unit through its OWN sections (a 2-bed unit
// has Común + A, B; a 4-bed has Común + A–D), so the board never shows a room
// that doesn't exist.
const crewCompleteSteps = (units: string[], trade: 'clean' | 'paint', at: string): SectionStep[] =>
  units.flatMap((unitNumber) => sectionsForUnit(unitNumber).flatMap((section) => ([
    { action: 'start-work' as const, at, section, trade, unitNumber },
    { action: 'record-crew-complete' as const, at: shiftIso(at, 0.25), section, trade, unitNumber },
  ])));

const losPassSteps = (units: string[], trade: 'clean' | 'paint', at: string): SectionStep[] =>
  units.flatMap((unitNumber) => sectionsForUnit(unitNumber).map((section) => (
    { action: 'record-los-pass' as const, at, section, trade, unitNumber })));

const startOnlySteps = (units: string[], trade: 'clean' | 'paint', sections: TrackCSection[], at: string): SectionStep[] =>
  units.flatMap((unitNumber) => sections.map((section) => (
    { action: 'start-work' as const, at, section, trade, unitNumber })));

// Build the whole demo world on a scratch AppData whose ONLY project is the
// demo tower, by replaying a believable day-and-a-half of Moon Tower work.
export const buildDemoTurnScratch = (nowIso: string, demoPhone = ''): AppData => {
  const created = shiftIso(nowIso, -30);
  const contact: PropertyContact = {
    createdAt: created,
    id: `${DEMO_PREFIX}contact`,
    isPrimary: true,
    name: 'Joseph',
    phone: demoPhone,
    projectId: DEMO_TOWER_PROJECT_ID,
    title: 'Property Manager',
    updatedAt: created,
  };
  const crews = demoCrews(created, demoPhone);
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
      name: 'Moon Tower',
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
    floors: FLOORS.map((floor): Floor => ({
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
  const yesterday = shiftIso(nowIso, -26);
  const today = shiftIso(nowIso, -3);

  // Unit groups by state, so every board queue is populated.
  const paintApproved = floorRange(3, 1, 12); // 301–312: done + Joseph-accepted
  const paintPassed = floorRange(4, 1, 12); //   401–412: Los-passed, waiting on Joseph
  const paintInspect = floorRange(5, 1, 12); //  501–512: crew done, needs Los
  const paintWorking = floorRange(6, 1, 8); //   601–608: crews in them now
  const paintCallbacks = ['505', '510']; //      callbacks opened on inspected rooms
  // Everything paint-released on floors 3–7 that isn't driven above stays as
  // live Needs Crew work; floors 8–12 aren't released yet (the backlog).
  const paintReleased = FLOORS.slice(0, 5).flatMap((floor) => floorRange(floor, 1, SLOTS_PER_FLOOR));

  const cleanApproved = floorRange(3, 1, 8); //  301–308: cleaned + accepted
  const cleanWorking = floorRange(4, 1, 6); //   401–406: cleaning now
  const cleanReleased = [...floorRange(3, 1, 20), ...floorRange(4, 1, 10), ...floorRange(5, 1, 8)];

  // ---- Yesterday: Joseph releases, crews work floors 3–5, Los walks ----
  handles.data = { ...handles.data, daySessions: [demoSession(`${DEMO_PREFIX}day-1`, yesterday, contact.name)] };

  const paintWorkType = (unitNumber: string): 'cut-in' | 'full' | 'touch-up' => {
    const s = slotOfUnit(unitNumber) % 3;
    return s === 0 ? 'touch-up' : s === 1 ? 'full' : 'cut-in';
  };
  releaseUnits(handles, {
    at: shiftIso(yesterday, 0.4),
    trade: 'paint',
    units: paintReleased.map((unitNumber) => ({ unitNumber, workType: paintWorkType(unitNumber) })),
  });
  releaseUnits(handles, {
    at: shiftIso(yesterday, 0.5),
    trade: 'clean',
    units: cleanReleased.map((unitNumber) => ({ unitNumber, workType: slotOfUnit(unitNumber) % 4 === 0 ? 'heavy-clean' : undefined })),
  });

  assignUnits(handles, { at: shiftIso(yesterday, 1), crewName: 'Blue Crew (demo)', trade: 'paint', unitNumbers: [...paintApproved, ...paintInspect] });
  assignUnits(handles, { at: shiftIso(yesterday, 1.1), crewName: 'Red Crew (demo)', trade: 'paint', unitNumbers: paintPassed });
  assignUnits(handles, { at: shiftIso(yesterday, 1.2), crewName: 'Green Crew (demo)', trade: 'clean', unitNumbers: cleanApproved });

  // Crews finish paint on floors 3–5.
  sectionAction(handles, crewCompleteSteps([...paintApproved, ...paintPassed, ...paintInspect], 'paint', shiftIso(yesterday, 3)));
  // Los walks: passes floors 3 and 4 paint.
  sectionAction(handles, losPassSteps([...paintApproved, ...paintPassed], 'paint', shiftIso(yesterday, 5.5)));
  // A couple callbacks off the inspection floor (crew done, Los wants a redo).
  sectionAction(handles, [
    { action: 'open-callback', at: shiftIso(yesterday, 6), section: 'A', trade: 'paint', unitNumber: '505' },
    { action: 'open-callback', at: shiftIso(yesterday, 6), section: 'B', trade: 'paint', unitNumber: '510' },
  ]);
  // Clean floor 3 finishes and Los passes it.
  sectionAction(handles, crewCompleteSteps(cleanApproved, 'clean', shiftIso(yesterday, 4)));
  sectionAction(handles, losPassSteps(cleanApproved, 'clean', shiftIso(yesterday, 5.8)));

  // Extras exactly like the real turn: a texture repair and a change order,
  // written through the real note writer so the extras sheet + pay packet
  // pick them up the same way they did at Moon Tower.
  const noteOn = (unitNumber: string, kind: 'change-order' | 'texture', wording: string, at: string) => {
    const unit = handles.data.units.find((candidate) =>
      candidate.projectId === DEMO_TOWER_PROJECT_ID && candidate.unitNumber === unitNumber);
    if (!unit) throw new Error(`demo build: note unit ${unitNumber} missing`);
    const result = appendPersonalNoteActivity(handles.data, { kind, unitId: unit.id, wording }, {
      createActivityId: () => `${DEMO_PREFIX}note-${(handles.seq += 1)}`,
      now: () => at,
    });
    if (!result.ok) throw new Error(`demo build: note on ${unitNumber} failed (${result.error})`);
    handles.data = result.data;
  };
  noteOn('509', 'texture', 'Texture repair — room B ×2 (wall patch behind the door)', shiftIso(yesterday, 6.4));
  noteOn('406', 'change-order', '2×2 ceiling drywall — approved by Joseph on the walk', shiftIso(yesterday, 6.5));

  // Joseph accepts floor 3 paint + clean on the afternoon walk.
  acceptUnits(handles, { at: shiftIso(yesterday, 7), trade: 'paint', unitNumbers: paintApproved });
  acceptUnits(handles, { at: shiftIso(yesterday, 7.1), trade: 'clean', unitNumbers: cleanApproved });

  // Yesterday ends.
  handles.data = {
    ...handles.data,
    daySessions: handles.data.daySessions.map((session) =>
      session.id === `${DEMO_PREFIX}day-1`
        ? { ...session, endedAt: shiftIso(yesterday, 9), endedBy: 'Los', status: 'closed' as const, updatedAt: shiftIso(yesterday, 9) }
        : session),
  };

  // ---- Today: crews in floor 6, cleaners in floor 4, backlog waiting ----
  handles.data = {
    ...handles.data,
    daySessions: [...handles.data.daySessions, demoSession(`${DEMO_PREFIX}day-2`, today, contact.name)],
  };
  // Joseph releases a fresh floor this morning — live Needs Crew work for today.
  releaseUnits(handles, {
    at: shiftIso(today, 0.3),
    trade: 'paint',
    units: floorRange(8, 1, SLOTS_PER_FLOOR).map((unitNumber) => ({ unitNumber, workType: paintWorkType(unitNumber) })),
  });
  assignUnits(handles, { at: shiftIso(today, 0.8), crewName: 'Silver Crew (demo)', trade: 'paint', unitNumbers: paintWorking });
  assignUnits(handles, { at: shiftIso(today, 0.9), crewName: 'Gold Crew (demo)', trade: 'clean', unitNumbers: cleanWorking });
  // Crews are mid-room: Común + A started, not yet complete (live "Working").
  sectionAction(handles, startOnlySteps(paintWorking, 'paint', ['common', 'A'], shiftIso(today, 1.5)));
  sectionAction(handles, startOnlySteps(cleanWorking, 'clean', ['common', 'A'], shiftIso(today, 1.6)));
  // 613–620, floor 7, and clean 501–508 stay released + unassigned — live Needs
  // Crew work; floors 8–12 aren't released yet (the backlog the tour can play with).

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
// demoPhone: Los's OWN number. When set, every demo crew and the demo property
// contact carry it, so "text the crew" flows fire for real — at Los's phone,
// never at a crew. Empty = links hidden (the phone-gated buttons stay off).
export const enterDemoTurn = (data: AppData, nowIso: string, demoPhone = ''): DemoTurnResult => {
  let scratch: AppData;
  try {
    scratch = buildDemoTurnScratch(nowIso, demoPhone);
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
