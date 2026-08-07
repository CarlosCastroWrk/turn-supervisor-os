import assert from 'node:assert/strict';
import test from 'node:test';
import { formatClock, formatTime } from '../src/lib/constants.ts';

// Los's rule: every timestamp in the OS is 12-hour with AM/PM — never military.
test('formatClock is 12-hour with AM/PM, never 24-hour', () => {
  const out = formatClock('2026-08-06T13:05:00');
  assert.match(out, /(AM|PM)/i, `expected AM/PM, got "${out}"`);
  assert.match(out, /^\d{1,2}:\d{2}/, `expected h:mm, got "${out}"`);
  // A 12-hour clock never shows an hour above 12.
  const hour = Number(out.split(':')[0]);
  assert.ok(hour >= 1 && hour <= 12, `hour ${hour} is out of 12-hour range in "${out}"`);
});

test('formatClock handles empty input', () => {
  assert.equal(formatClock(''), '');
});

test('formatTime (date + time) is also 12-hour', () => {
  const out = formatTime('2026-08-06T18:45:00');
  assert.match(out, /(AM|PM)/i, `expected AM/PM, got "${out}"`);
});
