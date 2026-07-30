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

const makePackageReady = (state, unitNumber, trade, crewId) => {
  const unitId = `unit-${unitNumber}`;
  const releasedTargets = state.units
    .find((unit) => unit.id === unitId)
    ?.workFacts.filter(
      (fact) => fact.trade === trade && fact.release === 'released',
    )
    .map((fact) => target(unitNumber, trade, fact.section)) ?? [];
  const events = releasedTargets.flatMap((workTarget, targetIndex) =>
    ['assignment-confirmed', 'crew-reported-complete', 'los-passed'].map(
      (eventType, eventIndex) => ({
        id: `phase2-ready-${unitNumber}-${trade}-${targetIndex}-${eventIndex}`,
        eventType,
        confirmation: 'confirmed',
        target: workTarget,
        crewId,
        recordedAt: `2026-07-29T15:${String(
          targetIndex * 3 + eventIndex,
        ).padStart(2, '0')}:00.000Z`,
        recordedBy: 'Synthetic Los',
        sourceType: 'personal-confirmation',
        sourceLabel: 'Synthetic complete Unit+Trade package',
        summary: 'Synthetic package readiness event.',
        personalRecordOnly: true,
        officialPaperChanged: false,
        payrollChanged: false,
      }),
    ),
  );
  return { ...state, events: [...state.events, ...events] };
};

const packageTargets = (state, unitNumber, trade) => {
  const candidate = projectTrackCWalkCandidates(state).find(
    (item) => item.unitNumber === unitNumber && item.trade === trade,
  );
  assert.ok(candidate, `Unit ${unitNumber} ${trade} must be ready to walk.`);
  return candidate.targets;
};

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
  const initial = makePackageReady(
    createSyntheticTrackCState(),
    '301',
    'paint',
    'crew-bluebird-paint',
  );
  const selectedTargets = packageTargets(initial, '301', 'paint');
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
  for (const selectedTarget of selectedTargets.slice(2)) {
    draft = updateTrackCWalkDraft(
      draft,
      selectedTarget,
      { outcome: 'accepted' },
      '2026-07-29T16:03:30.000Z',
    );
  }
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
    accepted: selectedTargets.length - 1,
    correctionsRequested: 1,
    deferred: 0,
    notWalked: 0,
    notes: restored.outcomes.filter((outcome) => Boolean(outcome.note)),
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
  const paintReady = makePackageReady(
    createSyntheticTrackCState(),
    '301',
    'paint',
    'crew-bluebird-paint',
  );
  const initial = makePackageReady(
    paintReady,
    '606',
    'clean',
    'crew-bright-clean',
  );
  const deferredTargets = packageTargets(initial, '301', 'paint');
  const notWalkedTargets = packageTargets(initial, '606', 'clean');
  const started = startWalk(initial, [
    ...deferredTargets,
    ...notWalkedTargets,
  ]);
  const ended = endTrackCWalk(started, {
    endedAt: '2026-07-29T16:10:00.000Z',
    recordedBy: 'Los',
    eventIdPrefix: 'phase2-repeat-outcome',
    outcomes: [
      ...deferredTargets.map((target) => ({
        target,
        outcome: 'deferred',
        note: 'Property contact asked to return later.',
      })),
      ...notWalkedTargets.map((target) => ({
        target,
        outcome: 'not-walked',
      })),
    ],
  });
  assert.equal(ended.ok, true);
  assert.equal(
    projectTrackCWork(ended.value, deferredTargets[0])?.property,
    'pending-property-walk',
  );
  assert.equal(
    projectTrackCWork(ended.value, notWalkedTargets[0])?.property,
    'pending-property-walk',
  );
  const candidateKeys = projectTrackCWalkCandidates(ended.value).map(
    (candidate) => `${candidate.target.unitId}:${candidate.target.trade}`,
  );
  assert.ok(candidateKeys.includes('unit-301:paint'));
  assert.ok(candidateKeys.includes('unit-606:clean'));

  const repeated = startWalk(
    ended.value,
    [...deferredTargets, ...notWalkedTargets],
    'phase2-repeat-walk',
  );
  assert.equal(repeated.activeWalk?.id, 'phase2-repeat-walk');
});

test('Paint and Clean outcomes stay independent through End Walk', () => {
  const paintReady = makePackageReady(
    createSyntheticTrackCState(),
    '301',
    'paint',
    'crew-bluebird-paint',
  );
  const initial = makePackageReady(
    paintReady,
    '606',
    'clean',
    'crew-bright-clean',
  );
  const paintTargets = packageTargets(initial, '301', 'paint');
  const cleanTargets = packageTargets(initial, '606', 'clean');
  const started = startWalk(initial, [...paintTargets, ...cleanTargets]);
  const ended = endTrackCWalk(started, {
    endedAt: '2026-07-29T16:10:00.000Z',
    recordedBy: 'Los',
    eventIdPrefix: 'phase2-trade-outcome',
    outcomes: [
      ...paintTargets.map((target) => ({ target, outcome: 'accepted' })),
      ...cleanTargets.map((target) => ({ target, outcome: 'deferred' })),
    ],
  });
  assert.equal(ended.ok, true);
  assert.equal(
    projectTrackCWork(ended.value, paintTargets[0])?.property,
    'property-accepted',
  );
  assert.equal(
    projectTrackCWork(ended.value, cleanTargets[0])?.property,
    'pending-property-walk',
  );
});

test('Correction requested creates a callback and preserves the responsible crew', () => {
  const initial = makePackageReady(
    createSyntheticTrackCState(),
    '301',
    'paint',
    'crew-bluebird-paint',
  );
  const paintTargets = packageTargets(initial, '301', 'paint');
  const correctionTarget = paintTargets[0];
  const responsibleCrewId = projectTrackCWork(
    initial,
    correctionTarget,
  )?.responsibleCrewId;
  const started = startWalk(initial, paintTargets);
  const ended = endTrackCWalk(started, {
    endedAt: '2026-07-29T16:10:00.000Z',
    recordedBy: 'Los',
    eventIdPrefix: 'phase2-correction-outcome',
    outcomes: paintTargets.map((target, index) =>
      index === 0
        ? {
        target: correctionTarget,
        outcome: 'correction-requested',
        note: 'Paint touch-up required.',
          }
        : { target, outcome: 'accepted' }),
  });
  assert.equal(ended.ok, true);
  const correction = projectTrackCWork(ended.value, correctionTarget);
  assert.equal(correction?.callbackOpen, true);
  assert.equal(correction?.responsibleCrewId, responsibleCrewId);
  assert.equal(correction?.inspection, 'callback-open');
  assert.equal(correction?.property, 'not-ready');
});
