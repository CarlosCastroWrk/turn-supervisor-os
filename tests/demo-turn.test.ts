import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  DEMO_TOWER_PROJECT_ID,
  DEMO_UNIT_COUNT,
  enterDemoTurn,
  exitDemoTurn,
  isDemoTurnActive,
  showsFirstRunWelcome,
} from '../src/data/demoTurn.ts';
import { projectTrackCState } from '../src/features/wave2a2-core/appDataAdapters.ts';
import { buildAllCrewPayroll } from '../src/features/wave2a2-track-c/crewPayroll.ts';
import { parseStoredAppData } from '../src/lib/backups.ts';
import { normalizeAppData } from '../src/lib/dataMigrations.ts';
import type { AppData } from '../src/types.ts';

// The Demo Turn is the Rey-lunch weapon: a fully playable fake tower, hard-
// walled from the real record. These pins protect the wall (real data byte-
// identical through enter/reset/exit), the realism (live board with work in
// every queue), and the safety rails (no phones, passes the loader validator,
// survives a reload).

const NOW = '2026-08-18T15:00:00.000Z';

const realBase = (): AppData => {
  const data = structuredClone(seedData) as AppData;
  data.projects = data.projects.map((project) =>
    project.id === data.activeProjectId
      ? { ...project, mode: 'real' as const, name: 'Moon Tower' }
      : project);
  return data;
};

test('entering the demo never touches the real record — byte-identical slices', () => {
  const data = realBase();
  const realId = data.activeProjectId;
  const before = JSON.stringify({
    events: data.fieldEvents,
    projects: data.projects,
    sessions: data.daySessions,
    units: data.units,
  });
  const entered = enterDemoTurn(data, NOW);
  assert.ok(entered.ok);
  assert.equal(entered.data.activeProjectId, DEMO_TOWER_PROJECT_ID);
  assert.ok(isDemoTurnActive(entered.data));
  const after = JSON.stringify({
    events: entered.data.fieldEvents.filter((event) => event.projectId === realId),
    projects: entered.data.projects.filter((project) => project.id === realId)
      .concat(entered.data.projects.filter((project) =>
        project.id !== realId && project.id !== DEMO_TOWER_PROJECT_ID)),
    sessions: entered.data.daySessions.filter((session) => session.projectId === realId),
    units: entered.data.units.filter((unit) => unit.projectId === realId),
  });
  assert.equal(after, before, 'every real entity survives enter untouched');
});

test('the demo board is alive: a full Moon Tower, work in every state, payable rooms', () => {
  const entered = enterDemoTurn(realBase(), NOW);
  assert.ok(entered.ok);
  const state = projectTrackCState(entered.data);
  assert.equal(state.units.length, DEMO_UNIT_COUNT);
  const releasedPaint = state.units.flatMap((unit) =>
    unit.workFacts.filter((fact) => fact.trade === 'paint' && fact.release === 'released'));
  assert.ok(releasedPaint.length >= 20, `paint rooms on the board (${releasedPaint.length})`);
  assert.ok(state.events.length >= 40, `events recorded (${state.events.length})`);
  const payroll = buildAllCrewPayroll(state, new Date(NOW));
  const blue = [...payroll.values()].find((crew) =>
    state.crews.find((candidate) => candidate.id === crew.crewId)?.name.startsWith('Blue'));
  assert.ok(blue && blue.rooms.length > 0, 'Blue Crew has payable rooms');
});

test('demo phones: empty by default (sends nowhere), Los\'s number when given', () => {
  const entered = enterDemoTurn(realBase(), NOW);
  assert.ok(entered.ok);
  const demoCrews = entered.data.crewMembers.filter(
    (crew) => crew.projectId === DEMO_TOWER_PROJECT_ID);
  assert.ok(demoCrews.length >= 4);
  assert.ok(demoCrews.every((crew) => (crew.phone ?? '') === ''), 'no number = no links');
  const contacts = entered.data.propertyContacts.filter(
    (contact) => contact.projectId === DEMO_TOWER_PROJECT_ID);
  assert.ok(contacts.length > 0 && contacts.every((contact) => (contact.phone ?? '') === ''));

  // With Los's own number, every demo crew and the contact carry it — the
  // real text flows fire at HIS phone during a show, never at a crew.
  const withPhone = enterDemoTurn(realBase(), NOW, '+15125550100');
  assert.ok(withPhone.ok);
  const phonedCrews = withPhone.data.crewMembers.filter(
    (crew) => crew.projectId === DEMO_TOWER_PROJECT_ID);
  assert.ok(phonedCrews.every((crew) => crew.phone === '+15125550100'));
  const phonedContacts = withPhone.data.propertyContacts.filter(
    (contact) => contact.projectId === DEMO_TOWER_PROJECT_ID);
  assert.ok(phonedContacts.every((contact) => contact.phone === '+15125550100'));
});

test('demo data passes the SAME loader validator as real data', () => {
  const entered = enterDemoTurn(realBase(), NOW);
  assert.ok(entered.ok);
  const { data, warnings } = parseStoredAppData(JSON.stringify(entered.data));
  assert.equal(data.activeProjectId, DEMO_TOWER_PROJECT_ID);
  assert.deepEqual(warnings, [], 'no loader warnings on the demo payload');
});

test('reset regenerates instead of stacking — one demo project, full tower, always', () => {
  const first = enterDemoTurn(realBase(), NOW);
  assert.ok(first.ok);
  const second = enterDemoTurn(first.data, '2026-08-19T15:00:00.000Z');
  assert.ok(second.ok);
  assert.equal(
    second.data.projects.filter((project) => project.id === DEMO_TOWER_PROJECT_ID).length,
    1,
  );
  assert.equal(
    second.data.units.filter((unit) => unit.projectId === DEMO_TOWER_PROJECT_ID).length,
    DEMO_UNIT_COUNT,
  );
});

test('exit returns to the real turn — and a SEALED real turn still counts', () => {
  const data = realBase();
  const realId = data.activeProjectId;
  const entered = enterDemoTurn(data, NOW);
  assert.ok(entered.ok);
  const exited = exitDemoTurn(entered.data);
  assert.ok(exited.ok);
  assert.equal(exited.data.activeProjectId, realId);

  // Sealed Moon Tower: exit still lands on it (browsing the saved record).
  const sealedBase = realBase();
  sealedBase.projects = sealedBase.projects.map((project) =>
    project.id === realId ? { ...project, archivedAt: NOW } : project);
  const enteredSealed = enterDemoTurn(sealedBase, NOW);
  assert.ok(enteredSealed.ok);
  const exitedSealed = exitDemoTurn(enteredSealed.data);
  assert.ok(exitedSealed.ok);
  assert.equal(exitedSealed.data.activeProjectId, realId);
});

test('the demo survives an app reload — normalize keeps it active', () => {
  const entered = enterDemoTurn(realBase(), NOW);
  assert.ok(entered.ok);
  const normalized = normalizeAppData(structuredClone(entered.data));
  assert.equal(normalized.activeProjectId, DEMO_TOWER_PROJECT_ID);
});

test('the first-run welcome card never sits on top of the Demo Turn', () => {
  assert.equal(showsFirstRunWelcome(undefined), true, 'no project at all → welcome');
  assert.equal(showsFirstRunWelcome({ id: 'sample', mode: 'demo' }), true, 'bare sample project → welcome');
  assert.equal(showsFirstRunWelcome({ id: DEMO_TOWER_PROJECT_ID, mode: 'demo' }), false, 'inside the Demo Turn → the demo IS the tour');
  assert.equal(showsFirstRunWelcome({ id: 'real-1', mode: 'real' }), false, 'a real turn never shows it');
});
