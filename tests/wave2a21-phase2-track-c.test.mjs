import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticTrackCState } from '../src/features/wave2a2-track-c/fixtures.ts';
import {
  applyTrackCWalkDraft,
  isTrackCWalkDraftComplete,
  restoreTrackCWalkDraft,
  setTrackCWalkDraftStage,
  summarizeTrackCWalkDraft,
  updateTrackCWalkDraft,
} from '../src/features/wave2a2-track-c/phase2WalkWorkflow.ts';
import {
  endTrackCWalk,
  startTrackCWalk,
} from '../src/features/wave2a2-track-c/operations.ts';
import {
  projectTrackCWalkCandidates,
  projectTrackCWork,
} from '../src/features/wave2a2-track-c/projections.ts';

const target = (unitNumber, trade, section) => ({
  unitId: `unit-${unitNumber}`,
  trade,
  section,
});

const startWalk = (state, selectedTargets, walkSessionId = 'phase2-walk') => {
  const result = startTrackCWalk(state, {
    walkSessionId,
    propertyContact: 'Jordan Lee',
    selectedTargets,
    startedAt: '2026-07-29T16:00:00.000Z',
    startedBy: 'Los',
    confirmedLosInspection: true,
  });
  assert.equal(result.ok, true);
  return result.value;
};

test('active Walk draft is serializable, session-bound, and restorable with exact notes and stage', () => {
  const initial = createSyntheticTrackCState();
  const selectedTargets = [
    target('301', 'paint', 'common'),
    target('301', 'paint', 'A'),
  ];
  const started = startWalk(initial, selectedTargets);
  const session = started.activeWalk;
  assert.ok(session);

  let draft = restoreTrackCWalkDraft(
    session,
    undefined,
    '2026-07-29T16:01:00.000Z',
  );
  draft = updateTrackCWalkDraft(
    draft,
    selectedTargets[0],
    { outcome: 'accepted', note: 'Accepted during the property walk.' },
    '2026-07-29T16:02:00.000Z',
  );
  draft = updateTrackCWalkDraft(
    draft,
    selectedTargets[1],
    {
      outcome: 'correction-requested',
      note: 'Touch up behind the door.',
    },
    '2026-07-29T16:03:00.000Z',
  );
  draft = setTrackCWalkDraftStage(
    draft,
    'end-review',
    '2026-07-29T16:04:00.000Z',
  );

  const serialized = JSON.stringify(draft);
  const restored = restoreTrackCWalkDraft(
    session,
    JSON.parse(serialized),
    '2026-07-29T16:05:00.000Z',
  );
  assert.equal(restored.stage, 'end-review');
  assert.deepEqual(restored.outcomes, draft.outcomes);
  assert.equal(isTrackCWalkDraftComplete(session, restored), true);
  assert.deepEqual(summarizeTrackCWalkDraft(restored), {
    accepted: 1,
    correctionsRequested: 1,
    deferred: 0,
    notWalked: 0,
    notes: restored.outcomes,
    openCallbacks: 1,
  });

  const durableState = applyTrackCWalkDraft(started, restored);
  assert.deepEqual(durableState.activeWalk?.outcomes, restored.outcomes);

  const stale = restoreTrackCWalkDraft(
    session,
    { ...restored, walkSessionId: 'older-walk' },
    '2026-07-29T16:06:00.000Z',
  );
  assert.equal(stale.stage, 'active');
  assert.deepEqual(stale.outcomes, []);
  assert.equal(isTrackCWalkDraftComplete(session, stale), false);
});

test('Deferred and Not walked remain eligible for a later repeat Walk', () => {
  const initial = createSyntheticTrackCState();
  const deferredTarget = target('301', 'paint', 'common');
  const notWalkedTarget = target('301', 'paint', 'A');
  const started = startWalk(initial, [deferredTarget, notWalkedTarget]);
  const ended = endTrackCWalk(started, {
    endedAt: '2026-07-29T16:10:00.000Z',
    recordedBy: 'Los',
    eventIdPrefix: 'phase2-repeat-outcome',
    outcomes: [
      {
        target: deferredTarget,
        outcome: 'deferred',
        note: 'Property contact asked to return later.',
      },
      { target: notWalkedTarget, outcome: 'not-walked' },
    ],
  });
  assert.equal(ended.ok, true);
  assert.equal(
    projectTrackCWork(ended.value, deferredTarget)?.property,
    'pending-property-walk',
  );
  assert.equal(
    projectTrackCWork(ended.value, notWalkedTarget)?.property,
    'pending-property-walk',
  );
  const candidateKeys = projectTrackCWalkCandidates(ended.value).map(
    (candidate) =>
      `${candidate.target.unitId}:${candidate.target.trade}:${candidate.target.section}`,
  );
  assert.ok(candidateKeys.includes('unit-301:paint:common'));
  assert.ok(candidateKeys.includes('unit-301:paint:A'));

  const repeated = startWalk(
    ended.value,
    [deferredTarget, notWalkedTarget],
    'phase2-repeat-walk',
  );
  assert.equal(repeated.activeWalk?.id, 'phase2-repeat-walk');
});

test('Paint and Clean outcomes stay independent through End Walk', () => {
  const initial = createSyntheticTrackCState();
  const paintTarget = target('301', 'paint', 'common');
  const cleanTarget = target('606', 'clean', 'common');
  const started = startWalk(initial, [paintTarget, cleanTarget]);
  const ended = endTrackCWalk(started, {
    endedAt: '2026-07-29T16:10:00.000Z',
    recordedBy: 'Los',
    eventIdPrefix: 'phase2-trade-outcome',
    outcomes: [
      { target: paintTarget, outcome: 'accepted' },
      { target: cleanTarget, outcome: 'deferred' },
    ],
  });
  assert.equal(ended.ok, true);
  assert.equal(
    projectTrackCWork(ended.value, paintTarget)?.property,
    'property-accepted',
  );
  assert.equal(
    projectTrackCWork(ended.value, cleanTarget)?.property,
    'pending-property-walk',
  );
});

test('Correction requested creates a callback and preserves the responsible crew', () => {
  const initial = createSyntheticTrackCState();
  const correctionTarget = target('301', 'paint', 'common');
  const responsibleCrewId = projectTrackCWork(
    initial,
    correctionTarget,
  )?.responsibleCrewId;
  const started = startWalk(initial, [correctionTarget]);
  const ended = endTrackCWalk(started, {
    endedAt: '2026-07-29T16:10:00.000Z',
    recordedBy: 'Los',
    eventIdPrefix: 'phase2-correction-outcome',
    outcomes: [
      {
        target: correctionTarget,
        outcome: 'correction-requested',
        note: 'Paint touch-up required.',
      },
    ],
  });
  assert.equal(ended.ok, true);
  const correction = projectTrackCWork(ended.value, correctionTarget);
  assert.equal(correction?.callbackOpen, true);
  assert.equal(correction?.responsibleCrewId, responsibleCrewId);
  assert.equal(correction?.inspection, 'callback-open');
  assert.equal(correction?.property, 'not-ready');
});
