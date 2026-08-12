import assert from 'node:assert/strict';
import test from 'node:test';
import { projectTrackCWork } from '../src/features/wave2a2-track-c/projections.ts';
import { buildAllCrewPayroll } from '../src/features/wave2a2-track-c/crewPayroll.ts';
import type { TrackCState } from '../src/features/wave2a2-track-c/model.ts';

// The resurrection bug (Aug 12): a room that was passed/approved, then
// removed, then RE-released came back instantly "Passed" — its old events
// replayed into the new round, so Los's release tap looked like it did
// nothing. A re-release mints a fresh batch stamped now; events from the
// room's previous life must not replay. Pay from round one SURVIVES.

const target = { section: 'common', trade: 'paint' as const, unitId: 'u1' };

const stateWith = (releasedAt: string): TrackCState => ({
  units: [{
    id: 'u1',
    unitNumber: '803',
    workFacts: [{
      id: 'f1',
      unitId: 'u1',
      trade: 'paint',
      section: 'common',
      release: 'released',
      access: 'clear',
      sourceConfidence: 'confirmed',
      sourceLabel: 'test',
      releasedAt,
    }],
  }],
  crews: [{ id: 'rocky', name: 'Rocky', trade: 'paint', active: true }],
  events: [
    // Round one: assigned, done, passed by Los — then the room was removed.
    { confirmation: 'confirmed', crewId: 'rocky', eventType: 'assignment-confirmed', id: 'e1', recordedAt: '2026-08-10T14:00:00.000Z', target },
    { confirmation: 'confirmed', crewId: 'rocky', eventType: 'crew-reported-complete', id: 'e2', recordedAt: '2026-08-10T18:00:00.000Z', target },
    { confirmation: 'confirmed', eventType: 'los-passed', id: 'e3', recordedAt: '2026-08-10T19:00:00.000Z', target },
  ],
} as unknown as TrackCState);

test('a re-released room comes back FRESH — old passed state does not replay', () => {
  // Re-released Aug 12: the round-one events are older than the new stamp.
  const work = projectTrackCWork(stateWith('2026-08-12T15:00:00.000Z'), target);
  assert.ok(work);
  assert.equal(work.execution, 'unassigned', 'no ghost crew on the new round');
  assert.equal(work.inspection, 'not-ready', 'not pre-passed');
  assert.equal(work.property, 'not-ready');
});

test('a normal release (events after the stamp) keeps its state', () => {
  const work = projectTrackCWork(stateWith('2026-08-10T07:00:00.000Z'), target);
  assert.ok(work);
  assert.equal(work.inspection, 'los-passed', 'same-round pass stands');
});

test('round-one pay survives the re-release', () => {
  const payroll = buildAllCrewPayroll(stateWith('2026-08-12T15:00:00.000Z'), new Date('2026-08-12T18:00:00.000Z'));
  assert.equal(payroll.get('rocky')?.rooms.length, 1, 'Rocky keeps the pay for the work he did');
});
