import assert from 'node:assert/strict';
import test from 'node:test';
import { componentTotals, formatTypeTally } from '../src/features/wave2a2-track-c/crewPayroll.ts';

// Los's pay rule (Aug 8): a room counts in EVERY task it contains. A full+cut-in
// is 1 full AND 1 cut-in; a touch-up+cut-in is 1 touch-up AND 1 cut-in. The three
// totals overlap — the sum can exceed the room count. This pins that the display
// never under-counts cut-ins by dropping the combos (the bug this fixed).

test('a full+cut-in room counts as both a full and a cut-in', () => {
  const totals = componentTotals({
    full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 1, 'touch-up-cut-in': 0,
  });
  assert.equal(totals.full, 1);
  assert.equal(totals.cutIn, 1);
  assert.equal(totals.touchUp, 0);
});

test('a touch-up+cut-in room counts as both a touch-up and a cut-in', () => {
  const totals = componentTotals({
    full: 0, 'touch-up': 0, 'cut-in': 0, 'full-cut-in': 0, 'touch-up-cut-in': 1,
  });
  assert.equal(totals.touchUp, 1);
  assert.equal(totals.cutIn, 1);
  assert.equal(totals.full, 0);
});

test('cut-in total = pure cut-ins + every combo that contains a cut-in', () => {
  // 34 pure cut-in + 11 full+cut-in + 3 touch-up+cut-in = 48 cut-ins.
  const totals = componentTotals({
    full: 13, 'touch-up': 9, 'cut-in': 34, 'full-cut-in': 11, 'touch-up-cut-in': 3,
  });
  assert.equal(totals.cutIn, 48, 'cut-ins include the combos — no under-count');
  assert.equal(totals.full, 24, '13 full + 11 full+cut-in');
  assert.equal(totals.touchUp, 12, '9 touch-up + 3 touch-up+cut-in');
});

test('formatTypeTally shows the 3 overlapping buckets, no full+cut / touch+cut lines', () => {
  const label = formatTypeTally({
    full: 13, 'touch-up': 9, 'cut-in': 34, 'full-cut-in': 11, 'touch-up-cut-in': 3,
  });
  assert.equal(label, '24 full · 12 touch-up · 48 cut-in');
  assert.doesNotMatch(label, /\+cut/);
});
