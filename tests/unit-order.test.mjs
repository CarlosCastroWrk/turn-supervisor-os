import assert from 'node:assert/strict';
import test from 'node:test';
import { compareUnitTopFloorFirst } from '../src/lib/unitOrder.ts';

test('units sort top floor first, then in order within a floor', () => {
  const units = ['301', '1505', '1501', '900', '1509', '304', '1200'];
  const sorted = [...units].sort(compareUnitTopFloorFirst);
  // Highest floor first (15, 12, 9, 3); within a floor, unit order ascending.
  assert.deepEqual(sorted, ['1501', '1505', '1509', '1200', '900', '301', '304']);
});

test('higher floor always beats lower even with bigger unit numbers on the low floor', () => {
  assert.ok(compareUnitTopFloorFirst('1000', '909') < 0, 'floor 10 before floor 9');
  assert.ok(compareUnitTopFloorFirst('301', '304') < 0, 'within a floor, 301 before 304');
});
