import assert from 'node:assert/strict';
import test from 'node:test';
import { detectWorkType, parseDictatedRelease, type DictationRosterUnit } from '../src/features/wave2a2-core/dictationParse.ts';

// Roster mirroring Los's real units: 800 is a 5-bed, others smaller. Every unit
// has a common area.
const ROSTER: DictationRosterUnit[] = [
  { beds: ['A', 'B', 'C', 'D', 'E'], hasCommon: true, id: 'u800', unitNumber: '800' },
  { beds: ['A', 'B'], hasCommon: true, id: 'u1806', unitNumber: '1806' },
  { beds: ['A', 'B', 'C', 'D'], hasCommon: true, id: 'u1707', unitNumber: '1707' },
  { beds: ['A', 'B', 'C', 'D'], hasCommon: true, id: 'u504', unitNumber: '504' },
];

const sectionsOf = (result: ReturnType<typeof parseDictatedRelease>, unitNumber: string) =>
  result.rows.find((row) => row.unitNumber === unitNumber)?.sections ?? [];

test('work-phrase mapping — combos win over singles', () => {
  assert.equal(detectWorkType('cut in'), 'cut-in');
  assert.equal(detectWorkType('touch up'), 'touch-up');
  assert.equal(detectWorkType('full'), 'full');
  assert.equal(detectWorkType('touch plus cut'), 'touch-up-cut-in');
  assert.equal(detectWorkType('touch up and cut in'), 'touch-up-cut-in');
  assert.equal(detectWorkType('full plus cut'), 'full-cut-in');
  assert.equal(detectWorkType('staff'), undefined);
});

test("Los's real paint line parses room-by-room with the right tasks", () => {
  const result = parseDictatedRelease('1806 A B cut in, 1707 A touch plus cut, 800 full unit', 'paint', ROSTER);
  assert.deepEqual(sectionsOf(result, '1806'), [
    { section: 'A', workType: 'cut-in' },
    { section: 'B', workType: 'cut-in' },
  ]);
  assert.deepEqual(sectionsOf(result, '1707'), [
    { section: 'A', workType: 'touch-up-cut-in' },
  ]);
  // "full unit" on 800 (5-bed) → all beds, full.
  assert.deepEqual(sectionsOf(result, '800'), [
    { section: 'A', workType: 'full' },
    { section: 'B', workType: 'full' },
    { section: 'C', workType: 'full' },
    { section: 'D', workType: 'full' },
    { section: 'E', workType: 'full' },
  ]);
});

test('clean auto-adds common to every unit (Los’s rule)', () => {
  const result = parseDictatedRelease('504 C D, 1806 A B', 'clean', ROSTER);
  assert.deepEqual(sectionsOf(result, '504'), [
    { section: 'common' },
    { section: 'C' },
    { section: 'D' },
  ]);
  assert.deepEqual(sectionsOf(result, '1806'), [
    { section: 'common' },
    { section: 'A' },
    { section: 'B' },
  ]);
});

test('paint does NOT auto-add common unless said', () => {
  const plain = parseDictatedRelease('1806 A B cut', 'paint', ROSTER);
  assert.ok(!sectionsOf(plain, '1806').some((s) => s.section === 'common'));
  const withCommon = parseDictatedRelease('1806 common A B cut', 'paint', ROSTER);
  assert.ok(sectionsOf(withCommon, '1806').some((s) => s.section === 'common'));
});

test('commas are optional and ranges work', () => {
  const result = parseDictatedRelease('800 A-C full 1806 A B touch', 'paint', ROSTER);
  assert.deepEqual(sectionsOf(result, '800').map((s) => s.section), ['A', 'B', 'C']);
  assert.deepEqual(sectionsOf(result, '1806').map((s) => s.section), ['A', 'B']);
});

test('unknown units are surfaced, not silently dropped', () => {
  const result = parseDictatedRelease('9999 A B, 1806 A', 'paint', ROSTER);
  assert.deepEqual(result.unmatched, ['9999']);
  assert.ok(result.rows.some((row) => row.unitNumber === '1806'));
});

test('a unit with no rooms heard warns instead of guessing', () => {
  const result = parseDictatedRelease('1806', 'paint', ROSTER);
  assert.equal(result.rows.length, 0);
  assert.ok(result.warnings.some((w) => w.includes('1806')));
});
