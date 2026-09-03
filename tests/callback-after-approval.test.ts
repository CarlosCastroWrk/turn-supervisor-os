import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import type { AppData, DaySession } from '../src/types.ts';
import {
  appendManualReleaseBatchOnce,
  createManualReleaseBatch,
  projectPropertyRoster,
  projectTrackCState,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import {
  applyTrackCSectionAction,
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
  recordTrackCDirectPropertyAcceptance,
} from '../src/features/wave2a2-track-c/operations.ts';
import { projectTrackCWork } from '../src/features/wave2a2-track-c/projections.ts';

// Los walked 1607 with Joseph, Joseph APPROVED a room, then wanted a different
// task, so Los opened a CALLBACK on the approved room. It correctly went to
// callbacks — but it must ALSO leave "approved". A room can't be both.
const DATE = '2026-08-07';
let seq = 0;
const at = () => `2026-08-07T13:00:${String(seq++).padStart(2, '0')}.000Z`;

const setup = (): { state: ReturnType<typeof projectTrackCState>; crewId: string } => {
  let data = structuredClone(seedData) as AppData;
  const batch = createManualReleaseBatch({
    actor: 'Los', date: DATE, id: 'r1', propertyContact: 'PM', recordedAt: at(),
    roster: projectPropertyRoster(data),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selections: [{ section: 'A', trade: 'paint', unitId: 'unit_101' }] as any,
  });
  data = appendManualReleaseBatchOnce(data, batch);
  const session: DaySession = {
    activeCleanCrewIds: [], activePaintCrewIds: [], createdAt: at(), date: DATE,
    id: 's1', keyStatus: 'yes', morningNote: '', projectId: data.activeProjectId,
    propertyContact: 'PM', releaseBatchIds: ['r1'], startedAt: at(), startedBy: 'Los',
    status: 'active', updatedAt: at(),
  };
  data = { ...data, daySessions: [...data.daySessions, session] };
  const state = projectTrackCState(data);
  const crewId = state.crews.find((c) => c.trade === 'paint')!.id;
  return { state, crewId };
};

test('a callback on an APPROVED room pulls it out of approved (not both)', () => {
  const initial = setup();
  let { state } = initial;
  const { crewId } = initial;
  const target = { section: 'A' as const, trade: 'paint' as const, unitId: 'unit_101' };

  // Assign + start.
  const proposal = createTrackCBulkAssignmentProposal(state, {
    createdAt: at(), createdBy: 'Los', crewId, proposalId: 'p', sectionMode: 'specific',
    sections: ['A'], trade: 'paint', unitIds: ['unit_101'],
  });
  const confirmed = confirmTrackCBulkAssignmentProposal(state, proposal, {
    confirmed: true, eventIdPrefix: 'a', recordedAt: at(), recordedBy: 'Los',
  });
  assert.ok(confirmed.ok);
  state = confirmed.value.state;

  const step = (action: 'start-work' | 'record-crew-complete' | 'record-los-pass' | 'open-callback') => {
    const result = applyTrackCSectionAction(state, {
      action, eventId: `e-${action}-${seq}`, recordedAt: at(), recordedBy: 'Los', target,
    });
    assert.ok(result.ok, `${action} should apply`);
    state = result.value;
  };
  step('start-work');
  step('record-crew-complete');
  step('record-los-pass');

  // Property accepts the room.
  const accepted = recordTrackCDirectPropertyAcceptance(state, {
    idFactory: (prefix) => `${prefix}-${seq++}`, recordedAt: at(), recordedBy: 'Los',
    trade: 'paint', unitId: 'unit_101',
  });
  assert.ok(accepted.ok);
  state = accepted.value;
  assert.equal(projectTrackCWork(state, target)?.property, 'property-accepted', 'accepted first');

  // Now the callback on the approved room.
  step('open-callback');

  const work = projectTrackCWork(state, target);
  assert.equal(work?.callbackOpen, true, 'it is in callbacks');
  assert.notEqual(work?.property, 'property-accepted', 'it is NO LONGER approved');
});
