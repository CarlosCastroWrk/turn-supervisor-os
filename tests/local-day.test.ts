import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  WALL_WEEK_EPOCH,
  localDayOf,
  localEventDate,
  mostRecentWeekday,
  payWeekNumberOf,
  payWeekSaturday,
  payWeekSunday,
  payWeekSundayOfNumber,
  shiftLocalDay,
  wallWeekColor,
} from '../src/lib/localDay.ts';

// Timestamps are UTC, days are LOCAL — an evening tap in Texas is still "today"
// even though its ISO string already reads tomorrow.
test('local day comes from the local calendar, never from the ISO string', () => {
  const eveningLocal = new Date(2026, 7, 12, 23, 30); // Aug 12, 11:30 PM local
  assert.equal(localDayOf(eveningLocal), '2026-08-12');
  assert.equal(localDayOf(eveningLocal.toISOString()), '2026-08-12');
  assert.equal(localEventDate(eveningLocal.toISOString()), '2026-08-12');
  assert.equal(localDayOf('not a date'), '', 'garbage never throws in a render path');
});

test('pay week is Sunday → Saturday, date only, numbered from the wall epoch', () => {
  const wed = new Date(2026, 7, 12, 17, 5); // Wed Aug 12 2026, after 5 PM
  assert.equal(payWeekSunday(wed), '2026-08-09');
  assert.equal(payWeekSaturday(wed), '2026-08-15');
  const satNight = new Date(2026, 7, 15, 23, 59);
  assert.equal(payWeekSunday(satNight), '2026-08-09', 'Saturday 11:59 PM still belongs to the week — no 5 PM cutoff');
  const sunMidnight = new Date(2026, 7, 16, 0, 0);
  assert.equal(payWeekSunday(sunMidnight), '2026-08-16', 'Sunday 00:00 starts the next week');

  assert.equal(localDayOf(WALL_WEEK_EPOCH), '2026-08-02');
  assert.equal(payWeekNumberOf(new Date(2026, 7, 2)), 2);
  assert.equal(payWeekNumberOf(new Date(2026, 6, 30)), 1);
  assert.equal(payWeekNumberOf(wed), 3);
  assert.equal(payWeekSundayOfNumber(3), '2026-08-09');
  assert.equal(payWeekSundayOfNumber(1), '2026-07-26');
  assert.equal(wallWeekColor(2), wallWeekColor(5), 'colors stay locked to the number every 3 weeks');
  assert.equal(shiftLocalDay('2026-08-09', -7), '2026-08-02');
});

test('most recent weekday counts today as a hit', () => {
  const wed = new Date(2026, 7, 12, 9, 0);
  assert.equal(localDayOf(mostRecentWeekday(wed, 3)), '2026-08-12', 'Wednesday asked on Wednesday = today');
  assert.equal(localDayOf(mostRecentWeekday(wed, 1)), '2026-08-10', 'Monday asked on Wednesday');
  assert.equal(localDayOf(mostRecentWeekday(wed, 4)), '2026-08-06', 'Thursday asked on Wednesday = last week');
});

// The pin: this module is the ONLY place the day template or getDay() may
// live. Twelve copies used to be scattered across the app and they drifted.
const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/u.test(name) ? [path] : [];
});
test('no surface keeps its own copy of the local-day or week math', () => {
  const root = new URL('../src', import.meta.url).pathname;
  const offenders = walk(root)
    .filter((path) => !path.endsWith('/lib/localDay.ts'))
    .filter((path) => {
      const source = readFileSync(path, 'utf8');
      return source.includes('getFullYear()}-') || source.includes('.getDay()')
        || /recordedAt\.slice\(0, 10\)|occurredAt\.slice\(0, 10\)/u.test(source);
    })
    .map((path) => path.slice(root.length + 1));
  assert.deepEqual(offenders, [], 'import localDayOf / payWeekSunday from src/lib/localDay instead');
});
