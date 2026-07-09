import assert from 'node:assert/strict';
import test from 'node:test';
import { localISODateFromDateTime } from '../src/lib/constants.ts';

test('localISODateFromDateTime compares draft timestamps in local field time', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/Chicago';

  try {
    assert.equal(localISODateFromDateTime('2026-07-09T02:22:36.203Z'), '2026-07-08');
  } finally {
    process.env.TZ = previousTimezone;
  }
});

