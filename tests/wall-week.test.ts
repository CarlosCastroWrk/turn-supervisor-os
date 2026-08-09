import assert from 'node:assert/strict';
import test from 'node:test';
import { payWeekNumberOf, wallWeekColor, WALL_WORKTYPE_ABBR } from '../src/features/wave2a2-track-c/wallWeek.ts';

// Los's model (Moon Tower): pay week = Sunday → Saturday, DATE ONLY, no
// time-of-day cutoff — the app week matches his physical wall board (Sun–Sat).
// Week 1 was the short week (~2 clean units); the Turn's main week started Sun
// Aug 2 2026 = WEEK 2. The wall board, Home, and Crews all read this one source.

test('the week of Sun Aug 2 2026 is week 2 (not week 1)', () => {
  assert.equal(payWeekNumberOf('2026-08-02T09:00:00'), 2); // Sunday
  assert.equal(payWeekNumberOf('2026-08-06T16:00:00'), 2); // Thursday (today in the field)
  assert.equal(payWeekNumberOf('2026-08-08T12:00:00'), 2); // Saturday midday
});

test('the week before Aug 2 is week 1', () => {
  assert.equal(payWeekNumberOf('2026-07-27T09:00:00'), 1); // Sunday Jul 27
  assert.equal(payWeekNumberOf('2026-08-01T12:00:00'), 1); // Saturday Aug 1
});

test('Aug 9 (Sunday) starts week 3', () => {
  assert.equal(payWeekNumberOf('2026-08-09T09:00:00'), 3);
  assert.equal(payWeekNumberOf('2026-08-15T12:00:00'), 3);
});

test('ALL of Saturday stays in the same week — no 5 PM rollover', () => {
  // Sat Aug 8, any time of day, is still week 2. Only Sunday Aug 9 flips to 3.
  assert.equal(payWeekNumberOf('2026-08-08T16:00:00'), 2); // 4 PM
  assert.equal(payWeekNumberOf('2026-08-08T18:00:00'), 2); // 6 PM
  assert.equal(payWeekNumberOf('2026-08-08T23:59:00'), 2); // just before midnight
  assert.equal(payWeekNumberOf('2026-08-09T00:01:00'), 3); // Sunday flips
});

test('color stays locked to the week: w1 amber(0), w2 green(1), w3 pink(2), w4 amber(0)', () => {
  assert.equal(wallWeekColor(1), 0);
  assert.equal(wallWeekColor(2), 1);
  assert.equal(wallWeekColor(3), 2);
  assert.equal(wallWeekColor(4), 0);
});

test('paint task tags are the short forms shown on the wall', () => {
  assert.equal(WALL_WORKTYPE_ABBR.full, 'F');
  assert.equal(WALL_WORKTYPE_ABBR['cut-in'], 'CI');
  assert.equal(WALL_WORKTYPE_ABBR['touch-up'], 'TU');
  assert.equal(WALL_WORKTYPE_ABBR['full-cut-in'], 'F+CI');
  assert.equal(WALL_WORKTYPE_ABBR['touch-up-cut-in'], 'TU+CI');
});
