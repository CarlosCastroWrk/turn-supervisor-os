import assert from 'node:assert/strict';
import test from 'node:test';
import type { DictationRosterUnit } from '../src/features/wave2a2-core/startDayParse.ts';
import {
  detectStartDayWorkType,
  parseStartDayMemo,
} from '../src/features/wave2a2-core/startDayParse.ts';
import {
  createConfirmedDailyReleaseBatch,
  prepareDailyReleasePlan,
} from '../src/features/wave2a21-track-a/phase2Workflow.ts';
import type {
  ProjectRosterUnitOption,
  PropertyContact,
} from '../src/features/wave2a21-track-a/contracts.ts';

// Roster mirroring Los's real Moon Tower units, common areas included.
// 1209 is a studio (no bedrooms, just the common scope).
const ROSTER: DictationRosterUnit[] = [
  { beds: ['A', 'B', 'C', 'D', 'E'], hasCommon: true, id: 'u800', unitNumber: '800' },
  { beds: ['A', 'B'], hasCommon: true, id: 'u1806', unitNumber: '1806' },
  { beds: ['A', 'B', 'C', 'D'], hasCommon: true, id: 'u1707', unitNumber: '1707' },
  { beds: ['A', 'B', 'C', 'D'], hasCommon: true, id: 'u1404', unitNumber: '1404' },
  { beds: ['A', 'B', 'C', 'D'], hasCommon: true, id: 'u1002', unitNumber: '1002' },
  { beds: [], hasCommon: true, id: 'u1209', unitNumber: '1209' },
  { beds: ['A', 'B', 'C'], hasCommon: true, id: 'u504', unitNumber: '504' },
];

const roomsOf = (
  result: ReturnType<typeof parseStartDayMemo>,
  unitNumber: string,
  trade: 'paint' | 'clean',
) => result.rows.find((row) =>
  row.unitNumber === unitNumber && row.trade === trade)?.rooms ?? [];

test('task words — English and the crews’ Spanish, combos win', () => {
  assert.equal(detectStartDayWorkType('cut in', 'paint'), 'cut-in');
  assert.equal(detectStartDayWorkType('recorte', 'paint'), 'cut-in');
  assert.equal(detectStartDayWorkType('retoque', 'paint'), 'touch-up');
  assert.equal(detectStartDayWorkType('pintura completa', 'paint'), 'full');
  assert.equal(detectStartDayWorkType('completo + recorte', 'paint'), 'full-cut-in');
  assert.equal(detectStartDayWorkType('retoque y recorte', 'paint'), 'touch-up-cut-in');
  assert.equal(detectStartDayWorkType('nothing here', 'paint'), undefined);
  assert.equal(detectStartDayWorkType('heavy clean', 'clean'), 'heavy-clean');
  assert.equal(detectStartDayWorkType('limpieza pesada', 'clean'), 'heavy-clean');
  assert.equal(detectStartDayWorkType('normal', 'clean'), undefined);
});

test("ChatGPT's exact CLEAN list lands perfectly — commons included (the Aug 10 bug)", () => {
  const memo = [
    'Clean:',
    '1404 — Común + A, B, C, D',
    '1209 — Estudio',
    '504 — Común + A, B, C',
  ].join('\n');
  const result = parseStartDayMemo(memo, ROSTER, 'both');
  assert.deepEqual(roomsOf(result, '1404', 'clean').map((room) => room.section),
    ['common', 'A', 'B', 'C', 'D']);
  assert.deepEqual(roomsOf(result, '1209', 'clean').map((room) => room.section),
    ['common']);
  assert.deepEqual(roomsOf(result, '504', 'clean').map((room) => room.section),
    ['common', 'A', 'B', 'C']);
  assert.deepEqual(result.unmatched, []);
  assert.deepEqual(result.mismatches, []);
});

test('clean auto-adds the common even when the sheet never says it', () => {
  const result = parseStartDayMemo('504 A B, 1806 A', ROSTER, 'clean');
  assert.deepEqual(roomsOf(result, '504', 'clean').map((room) => room.section),
    ['common', 'A', 'B']);
  assert.deepEqual(roomsOf(result, '1806', 'clean').map((room) => room.section),
    ['common', 'A']);
});

test("ChatGPT's PAINT line reads per-room Spanish tasks", () => {
  const result = parseStartDayMemo('1002 — A: recorte, D: retoque', ROSTER, 'both');
  assert.deepEqual(roomsOf(result, '1002', 'paint'), [
    { section: 'A', workType: 'cut-in' },
    { section: 'D', workType: 'touch-up' },
  ]);
});

test('Común carries its paint task — the task must show on every room', () => {
  const result = parseStartDayMemo(
    '1002 — Común: pintura completa, B: recorte',
    ROSTER,
    'both',
  );
  assert.deepEqual(roomsOf(result, '1002', 'paint'), [
    { section: 'common', workType: 'full' },
    { section: 'B', workType: 'cut-in' },
  ]);
});

test('a combined memo with headers splits paint from clean', () => {
  const memo = [
    '🎨 Paint',
    '1806 A B cut in',
    '800 — completo',
    '🧹 Limpieza',
    '1404 — Común + A, B, C, D',
  ].join('\n');
  const result = parseStartDayMemo(memo, ROSTER, 'both');
  assert.deepEqual(roomsOf(result, '1806', 'paint'), [
    { section: 'A', workType: 'cut-in' },
    { section: 'B', workType: 'cut-in' },
  ]);
  // "completo" alone = the whole unit, full paint.
  assert.deepEqual(roomsOf(result, '800', 'paint'),
    ['A', 'B', 'C', 'D', 'E'].map((section) => ({ section, workType: 'full' })));
  assert.deepEqual(roomsOf(result, '1404', 'clean').map((room) => room.section),
    ['common', 'A', 'B', 'C', 'D']);
});

test('one dictated line switches trades inline', () => {
  const result = parseStartDayMemo(
    'paint 1806 A B cut in clean 1404 A B C D',
    ROSTER,
    'both',
  );
  assert.equal(roomsOf(result, '1806', 'paint').length, 2);
  assert.deepEqual(roomsOf(result, '1404', 'clean').map((room) => room.section),
    ['common', 'A', 'B', 'C', 'D']);
});

test('without headers, task words mean paint and plain rooms mean clean', () => {
  const memo = [
    '1002 — A: recorte',
    '1404 — Común + A, B',
  ].join('\n');
  const result = parseStartDayMemo(memo, ROSTER, 'both');
  assert.equal(roomsOf(result, '1002', 'paint').length, 1);
  assert.deepEqual(roomsOf(result, '1404', 'clean').map((room) => room.section),
    ['common', 'A', 'B']);
});

test("Los's original shorthand still reads exactly as before", () => {
  const result = parseStartDayMemo(
    '1806 A B cut in, 1707 A touch plus cut, 800 full unit',
    ROSTER,
    'paint',
  );
  assert.deepEqual(roomsOf(result, '1806', 'paint'), [
    { section: 'A', workType: 'cut-in' },
    { section: 'B', workType: 'cut-in' },
  ]);
  assert.deepEqual(roomsOf(result, '1707', 'paint'), [
    { section: 'A', workType: 'touch-up-cut-in' },
  ]);
  assert.deepEqual(roomsOf(result, '800', 'paint'),
    ['A', 'B', 'C', 'D', 'E'].map((section) => ({ section, workType: 'full' })));
});

test('a task after a comma backfills the rooms before it', () => {
  const result = parseStartDayMemo('1806 A, B cut in', ROSTER, 'paint');
  assert.deepEqual(roomsOf(result, '1806', 'paint'), [
    { section: 'A', workType: 'cut-in' },
    { section: 'B', workType: 'cut-in' },
  ]);
});

test('markdown bullets and bold from ChatGPT are ignored', () => {
  const memo = [
    '**Clean:**',
    '- **1404** — Común + A, B, C, D',
    '• 1209 — Estudio',
  ].join('\n');
  const result = parseStartDayMemo(memo, ROSTER, 'both');
  assert.equal(roomsOf(result, '1404', 'clean').length, 5);
  assert.equal(roomsOf(result, '1209', 'clean').length, 1);
});

test('heavy clean rides on the rooms', () => {
  const result = parseStartDayMemo('1404 heavy clean', ROSTER, 'clean');
  const rooms = roomsOf(result, '1404', 'clean');
  assert.equal(rooms.length, 5);
  assert.ok(rooms.every((room) => room.workType === 'heavy-clean'));
});

test('disagreements are flagged, never silently dropped', () => {
  // Rooms the unit does not have.
  const extra = parseStartDayMemo('1806 A B C', ROSTER, 'clean');
  assert.deepEqual(roomsOf(extra, '1806', 'clean').map((room) => room.section),
    ['common', 'A', 'B']);
  assert.ok(extra.mismatches.some((line) =>
    line.includes('1806') && line.includes('C')));
  // Studio said, bedrooms in the roster.
  const studio = parseStartDayMemo('1707 — Estudio', ROSTER, 'clean');
  assert.deepEqual(roomsOf(studio, '1707', 'clean').map((room) => room.section),
    ['common', 'A', 'B', 'C', 'D']);
  assert.ok(studio.mismatches.some((line) => line.includes('1707')));
  // Unknown unit numbers surface.
  const unknown = parseStartDayMemo('9999 A B, 1806 A', ROSTER, 'paint');
  assert.deepEqual(unknown.unmatched, ['9999']);
});

test("a bare 'full' on a clean line means the whole unit (old shorthand kept)", () => {
  const result = parseStartDayMemo('504 full', ROSTER, 'clean');
  assert.deepEqual(roomsOf(result, '504', 'clean').map((room) => room.section),
    ['common', 'A', 'B', 'C']);
});

test("'limpieza completa' is a whole-unit CLEAN, never full paint", () => {
  const result = parseStartDayMemo('1404 — limpieza completa', ROSTER, 'both');
  assert.equal(roomsOf(result, '1404', 'paint').length, 0);
  assert.deepEqual(roomsOf(result, '1404', 'clean').map((room) => room.section),
    ['common', 'A', 'B', 'C', 'D']);
});

test('inferred trades come with a double-check warning', () => {
  const inferred = parseStartDayMemo('1806 A B', ROSTER, 'both');
  assert.deepEqual(roomsOf(inferred, '1806', 'clean').map((room) => room.section),
    ['common', 'A', 'B']);
  assert.ok(inferred.warnings.some((line) => line.includes('no Paint/Clean label')));
  const headed = parseStartDayMemo('Clean:\n1806 A B', ROSTER, 'both');
  assert.ok(!headed.warnings.some((line) => line.includes('no Paint/Clean label')));
});

test('a studio paints as its common — whole-unit paint never parses to nothing', () => {
  const result = parseStartDayMemo('Paint:\n1209 — completo', ROSTER, 'both');
  assert.deepEqual(roomsOf(result, '1209', 'paint'), [
    { section: 'common', workType: 'full' },
  ]);
  assert.equal(result.warnings.length, 0);
});

test('an em-dash range keeps the middle rooms', () => {
  const result = parseStartDayMemo('1404 — A—C', ROSTER, 'clean');
  assert.deepEqual(roomsOf(result, '1404', 'clean').map((room) => room.section),
    ['common', 'A', 'B', 'C']);
});

test('an emoji-only clean header still switches the trade', () => {
  const memo = [
    'Pintura:',
    '1002 — A: recorte',
    '🧹:',
    '1404 — Común + A, B, C, D',
  ].join('\n');
  const result = parseStartDayMemo(memo, ROSTER, 'both');
  assert.equal(roomsOf(result, '1002', 'paint').length, 1);
  assert.deepEqual(roomsOf(result, '1404', 'clean').map((room) => room.section),
    ['common', 'A', 'B', 'C', 'D']);
});

test('lines it could not read are named, never silently eaten', () => {
  const memo = [
    '1806 A B cut in',
    'Unit twelve-oh-nine — studio',
  ].join('\n');
  const result = parseStartDayMemo(memo, ROSTER, 'paint');
  assert.equal(result.rows.length, 1);
  assert.ok(result.warnings.some((line) =>
    line.includes('Didn’t read') && line.includes('twelve-oh-nine')));
});

test('the full memo: task + crew + textures in one line', () => {
  const crews = [
    { name: 'Rocky', trade: 'paint' as const },
    { name: 'Sandra', trade: 'paint' as const },
    { name: 'Graciela', trade: 'clean' as const },
  ];
  const memo = [
    'Paint:',
    '1806 A cut-in, B full — Rocky, 2 textures in B',
    '1707 A: retoque — assign to Sandra',
    '504 — texture by the window',
    'Clean:',
    '1404 — Común + A, B — Graciela',
  ].join('\n');
  const result = parseStartDayMemo(memo, ROSTER, 'both', crews);
  const row1806 = result.rows.find((row) => row.unitNumber === '1806' && row.trade === 'paint');
  assert.equal(row1806?.crewName, 'Rocky');
  assert.deepEqual(row1806?.rooms, [
    { section: 'A', workType: 'cut-in' },
    { section: 'B', workType: 'full' },
  ]);
  assert.deepEqual(row1806?.textures, [{ count: 2, section: 'B' }]);
  const row1707 = result.rows.find((row) => row.unitNumber === '1707');
  assert.equal(row1707?.crewName, 'Sandra');
  // Texture-only unit: nothing released, the texture rides as a note.
  const row504 = result.rows.find((row) => row.unitNumber === '504');
  assert.equal(row504?.rooms.length, 0);
  assert.deepEqual(row504?.textures, [{ count: 1, section: undefined }]);
  const row1404 = result.rows.find((row) => row.unitNumber === '1404');
  assert.equal(row1404?.crewName, 'Graciela');
  assert.deepEqual(row1404?.rooms.map((room) => room.section), ['common', 'A', 'B']);
});

test('a named crew settles the trade when no task words are said', () => {
  const crews = [
    { name: 'Rocky', trade: 'paint' as const },
    { name: 'Graciela', trade: 'clean' as const },
  ];
  // No headers, no task words — old inference would have called this clean.
  const result = parseStartDayMemo('1806 A B — Rocky', ROSTER, 'both', crews);
  const row = result.rows.find((candidate) => candidate.unitNumber === '1806');
  assert.equal(row?.trade, 'paint');
  assert.equal(row?.crewName, 'Rocky');
  assert.ok(!row?.rooms.some((room) => room.section === 'common'));
});

test('a texture segment never inherits a task from backward-fill', () => {
  const result = parseStartDayMemo('1806 A texture ×2, B cut-in', ROSTER, 'paint');
  const row = result.rows.find((candidate) => candidate.unitNumber === '1806');
  // A is texture-only (not released); B releases as cut-in.
  assert.deepEqual(row?.rooms, [{ section: 'B', workType: 'cut-in' }]);
  assert.deepEqual(row?.textures, [{ count: 2, section: 'A' }]);
});

test('a crew name with a regex metachar does not crash the read', () => {
  const crews = [{ name: 'A+ Team', trade: 'paint' as const }, { name: '(Rocky', trade: 'paint' as const }];
  // Before the escape fix this threw "Invalid regular expression" and killed
  // the whole read; now it parses cleanly.
  const result = parseStartDayMemo('Paint:\n1806 A B — A+ Team', ROSTER, 'both', crews);
  assert.equal(result.rows.find((r) => r.unitNumber === '1806')?.rooms.length, 2);
});

test('a 5-digit typo is flagged, not silently read as a shorter unit', () => {
  const result = parseStartDayMemo('Paint:\n10025 A B', ROSTER, 'both');
  assert.ok(result.warnings.some((w) => w.includes('10025') && /digits/.test(w)));
});

test('"incomplete" is not read as full paint', () => {
  // 1806 A is NOT done — must not release A as full.
  const result = parseStartDayMemo('Paint:\n1806 A incomplete', ROSTER, 'both');
  const a = result.rows.find((r) => r.unitNumber === '1806')?.rooms.find((room) => room.section === 'A');
  assert.notEqual(a?.workType, 'full');
});

test('a "Paseo…" header does not flip a paint block to clean', () => {
  const result = parseStartDayMemo('Paseo del Sol\n1806 A: recorte', ROSTER, 'both');
  assert.ok(result.rows.some((r) => r.unitNumber === '1806' && r.trade === 'paint'));
});

test('a unit with nothing usable warns instead of guessing', () => {
  const result = parseStartDayMemo('1806', ROSTER, 'paint');
  assert.equal(result.rows.length, 0);
  assert.ok(result.warnings.some((line) => line.includes('1806')));
});

// End-to-end: the parsed memo drives the same release machinery Start Day
// uses — commons and tasks must survive into the confirmed batch.
test('parsed memo → prepared plan → confirmed batch keeps commons and tasks', () => {
  const rosterUnits: ProjectRosterUnitOption[] = ROSTER.map((unit) => ({
    applicableSections: [
      ...(unit.hasCommon ? ['common' as const] : []),
      ...unit.beds,
    ],
    id: unit.id,
    unitNumber: unit.unitNumber,
    unitType: unit.beds.length === 0 ? 'Studio' : `${unit.beds.length} bed`,
  }));
  const contact: PropertyContact = {
    activeForProject: true,
    createdAt: '2026-08-01T12:00:00.000Z',
    id: 'contact-joseph',
    isPrimary: true,
    name: 'Joseph',
    projectId: 'project-1',
    title: 'Property manager',
    updatedAt: '2026-08-01T12:00:00.000Z',
  };
  const memo = [
    'Paint:',
    '1002 — A: recorte, D: retoque',
    'Clean:',
    '1404 — Común + A, B, C, D',
    '1209 — Estudio',
  ].join('\n');
  const parsed = parseStartDayMemo(memo, ROSTER, 'both');
  const roomPlan = parsed.rows.flatMap((row) => row.rooms.map((room) => ({
    section: room.section,
    trade: row.trade,
    unitId: row.unitId,
    ...(room.workType ? { workType: room.workType } : {}),
  })));
  const prepared = prepareDailyReleasePlan({
    contacts: [contact],
    date: '2026-08-11',
    draft: {
      exceptions: [],
      explicitConfirmation: true,
      roomPlan,
      selectedUnitIds: [...new Set(parsed.rows.map((row) => row.unitId))],
      tradeChoice: 'Both',
    },
    enabledTrades: { clean: true, paint: true },
    projectId: 'project-1',
    propertyContactId: contact.id,
    rosterUnits,
  });
  assert.ok(prepared.ok, prepared.ok ? '' : prepared.errors.join(' '));
  if (!prepared.ok) return;
  const batch = createConfirmedDailyReleaseBatch(prepared.plan, rosterUnits, {
    batchId: 'batch-1',
    confirmedAt: '2026-08-11T13:00:00.000Z',
    confirmedBy: 'Los',
  });
  const items = batch.items.map((item) =>
    `${item.trade}:${rosterUnits.find((unit) => unit.id === item.unitId)?.unitNumber}:${item.section}:${item.workType ?? ''}`);
  // Every clean unit keeps its common; paint tasks survive to the batch.
  assert.ok(items.includes('clean:1404:common:'));
  assert.ok(items.includes('clean:1209:common:'));
  assert.ok(items.includes('paint:1002:A:cut-in'));
  assert.ok(items.includes('paint:1002:D:touch-up'));
  assert.equal(batch.items.length, roomPlan.length);
});
