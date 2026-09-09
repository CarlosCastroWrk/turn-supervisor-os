import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrewPayroll, PayRoom } from '../src/features/wave2a2-track-c/crewPayroll.ts';
import {
  PAID_WEEKS_KEY,
  buildPaidWeekSnapshot,
  diffPaidWeek,
  readPaidWeeks,
  writePaidWeek,
} from '../src/features/wave2a2-track-c/paidWeekSnapshot.ts';
import { payWeekNumberOf } from '../src/lib/localDay.ts';

// Payroll reads each paint room's work type off the CURRENT release, so
// editing a task after payday silently rewrote the paid week on every
// surface. The snapshot remembers what Tony was handed; the diff says what
// moved. These pins keep that memory honest.

const WEEK_DAY = '2026-08-12'; // a Wednesday in pay week 3
const WEEK = payWeekNumberOf(`${WEEK_DAY}T12:00:00`);
const NEXT_WEEK_DAY = '2026-08-19';

const payroll = (crewId: string, rooms: PayRoom[]): CrewPayroll => ({
  crewId,
  today: { beds: 0, commons: 0 },
  week: { beds: 0, commons: 0 },
  turn: { beds: 0, commons: 0 },
  turnTypes: { full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0, 'touch-up-cut-in': 0 },
  perDay: [],
  rooms,
});
const room = (unitNumber: string, section: string, workType?: PayRoom['workType'], date = WEEK_DAY, trade: PayRoom['trade'] = 'paint'): PayRoom =>
  ({ date, section, trade, unitNumber, workType });
const names = (id: string) => ({ rocky: 'Rocky', karen: 'Karen' })[id] ?? id;

test('the snapshot counts only the asked week, beds vs common, and paint types', () => {
  const byCrew = new Map<string, CrewPayroll>([
    ['rocky', payroll('rocky', [
      room('801', 'A', 'cut-in'), room('801', 'B', 'full'), room('801', 'common', 'full-cut-in'),
      room('902', 'A', 'full', NEXT_WEEK_DAY), // next week — not in this snapshot
    ])],
    ['karen', payroll('karen', [room('801', 'A', undefined, WEEK_DAY, 'clean'), room('801', 'common', undefined, WEEK_DAY, 'clean')])],
  ]);
  const snap = buildPaidWeekSnapshot(byCrew, names, WEEK, '2026-08-15T20:00:00.000Z');
  assert.equal(snap.week, WEEK);
  assert.deepEqual(snap.crews.rocky, {
    beds: 2, commons: 1, name: 'Rocky',
    types: { full: 1, 'touch-up': 0, 'cut-in': 1, 'full-cut-in': 1, 'touch-up-cut-in': 0 },
  });
  assert.deepEqual(snap.crews.karen.types, { full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0, 'touch-up-cut-in': 0 });
  assert.equal(snap.crews.karen.beds, 1);
  assert.equal(snap.crews.karen.commons, 1);
});

test('nothing moved → no lines; a cut-in edited to full after payday → one plain line', () => {
  const sentMap = new Map([['rocky', payroll('rocky', [room('801', 'A', 'cut-in'), room('801', 'B', 'full')])]]);
  const sent = buildPaidWeekSnapshot(sentMap, names, WEEK, '2026-08-15T20:00:00.000Z');
  assert.deepEqual(diffPaidWeek(sent, sent), []);

  const liveMap = new Map([['rocky', payroll('rocky', [room('801', 'A', 'full'), room('801', 'B', 'full')])]]);
  const live = buildPaidWeekSnapshot(liveMap, names, WEEK, sent.sentAt);
  assert.deepEqual(diffPaidWeek(sent, live), ['Rocky — full 1 → 2 · cut-in 1 → 0']);
});

test('a crew dropped from or added to a paid week is called out by name', () => {
  const sent = buildPaidWeekSnapshot(new Map([['rocky', payroll('rocky', [room('801', 'A', 'full')])]]), names, WEEK, '2026-08-15T20:00:00.000Z');
  const live = buildPaidWeekSnapshot(new Map([['karen', payroll('karen', [room('801', 'A', undefined, WEEK_DAY, 'clean')])]]), names, WEEK, sent.sentAt);
  assert.deepEqual(diffPaidWeek(sent, live), [
    'Karen — new since sent: 1 bed · 0 common',
    'Rocky — was 1 bed · 0 common, now nothing',
  ]);
});

test('snapshots persist per week under one turn-os key and survive a bad payload', () => {
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  const snap = buildPaidWeekSnapshot(new Map([['rocky', payroll('rocky', [room('801', 'A', 'full')])]]), names, WEEK, '2026-08-15T20:00:00.000Z');
  writePaidWeek(snap, fake);
  writePaidWeek({ ...snap, week: WEEK + 1 }, fake);
  assert.ok(store.has(PAID_WEEKS_KEY));
  const read = readPaidWeeks(fake);
  assert.deepEqual(Object.keys(read).sort(), [String(WEEK), String(WEEK + 1)]);
  assert.equal(read[String(WEEK)].crews.rocky.name, 'Rocky');
  store.set(PAID_WEEKS_KEY, '{not json');
  assert.deepEqual(readPaidWeeks(fake), {});
  assert.deepEqual(readPaidWeeks(null), {});
});
