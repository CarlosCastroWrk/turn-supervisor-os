import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAllCrewPayroll } from '../src/features/wave2a2-track-c/crewPayroll.ts';
import type { TrackCState } from '../src/features/wave2a2-track-c/model.ts';

// Los's pay rules (Aug 12): a room pays ONCE, to the FIRST crew that did it;
// redos never add a second pay; and a DELETED / un-released room pays nobody.
// These pin buildAllCrewPayroll's release-gate + single-pay dedup.

const NOW = new Date('2026-08-12T18:00:00.000Z');

// Minimal state builder — only the fields buildAllCrewPayroll reads.
const stateWith = (
  facts: { unitId: string; unitNumber: string; section: string; trade: 'paint' | 'clean'; release: 'released' | 'unreleased'; workType?: string }[],
  events: { unitId: string; section: string; trade: 'paint' | 'clean'; crewId: string; at: string }[],
): TrackCState => ({
  units: [...new Map(facts.map((f) => [f.unitId, f.unitNumber])).entries()].map(([unitId, unitNumber]) => ({
    id: unitId,
    unitNumber,
    workFacts: facts
      .filter((f) => f.unitId === unitId)
      .map((f) => ({ unitId, section: f.section, trade: f.trade, release: f.release, workType: f.workType })),
  })),
  events: events.map((e, index) => ({
    id: `evt-${index}`,
    eventType: 'crew-reported-complete',
    confirmation: 'confirmed',
    crewId: e.crewId,
    recordedAt: e.at,
    target: { unitId: e.unitId, section: e.section, trade: e.trade },
  })),
  crews: [],
} as unknown as TrackCState);

test('a released, crew-done room pays the crew once', () => {
  const state = stateWith(
    [{ unitId: 'u1', unitNumber: '801', section: 'A', trade: 'paint', release: 'released', workType: 'full' }],
    [{ unitId: 'u1', section: 'A', trade: 'paint', crewId: 'rocky', at: '2026-08-11T15:00:00.000Z' }],
  );
  const payroll = buildAllCrewPayroll(state, NOW);
  assert.equal(payroll.get('rocky')?.rooms.length, 1);
  assert.equal(payroll.get('rocky')?.turn.beds, 1);
});

test('a DELETED (un-released) room pays NOBODY, even with a stale done event', () => {
  const state = stateWith(
    // The section is now un-released (Los deleted it, or it went texture-only).
    [{ unitId: 'u1', unitNumber: '801', section: 'A', trade: 'paint', release: 'unreleased' }],
    // …but the crew's old "done" event still sits in the ledger.
    [{ unitId: 'u1', section: 'A', trade: 'paint', crewId: 'rocky', at: '2026-08-11T15:00:00.000Z' }],
  );
  const payroll = buildAllCrewPayroll(state, NOW);
  assert.equal(payroll.get('rocky'), undefined, 'deleted room must not pay');
});

test('a redo does not double-pay the same crew: called back, same crew reports again → paid once', () => {
  const state = stateWith(
    [{ unitId: 'u1', unitNumber: '801', section: 'B', trade: 'paint', release: 'released', workType: 'cut-in' }],
    [
      { unitId: 'u1', section: 'B', trade: 'paint', crewId: 'rocky', at: '2026-08-10T14:00:00.000Z' },
      // Called back; Rocky comes back and does the same room he did — no extra pay.
      { unitId: 'u1', section: 'B', trade: 'paint', crewId: 'rocky', at: '2026-08-11T14:00:00.000Z' },
    ],
  );
  const payroll = buildAllCrewPayroll(state, NOW);
  assert.equal(payroll.get('rocky')?.rooms.length, 1, 'the redo pays Rocky once, not twice');
});

test('unrelated rooms each pay once; a mix of released and deleted only pays the released', () => {
  const state = stateWith(
    [
      { unitId: 'u1', unitNumber: '801', section: 'A', trade: 'paint', release: 'released', workType: 'full' },
      { unitId: 'u1', unitNumber: '801', section: 'B', trade: 'paint', release: 'unreleased' },
      { unitId: 'u2', unitNumber: '802', section: 'common', trade: 'clean', release: 'released' },
    ],
    [
      { unitId: 'u1', section: 'A', trade: 'paint', crewId: 'rocky', at: '2026-08-11T15:00:00.000Z' },
      { unitId: 'u1', section: 'B', trade: 'paint', crewId: 'rocky', at: '2026-08-11T15:05:00.000Z' },
      { unitId: 'u2', section: 'common', trade: 'clean', crewId: 'graciela', at: '2026-08-11T16:00:00.000Z' },
    ],
  );
  const payroll = buildAllCrewPayroll(state, NOW);
  assert.equal(payroll.get('rocky')?.rooms.length, 1, 'A pays, deleted B does not');
  assert.equal(payroll.get('graciela')?.rooms.length, 1);
});
