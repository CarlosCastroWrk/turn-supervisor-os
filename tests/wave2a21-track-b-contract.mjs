import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  TRACK_B_ADDITIONAL_SCOPE_BOUNDARY,
  createTrackBAdditionalScopeDraft,
} from '../src/features/wave2a21-track-b/additionalScope.ts';
import {
  createTrackBOfficialFormRequest,
  resolveTrackBActiveCrewIds,
  trackBAssignmentConfirmationPrefix,
} from '../src/features/wave2a21-track-b/contracts.ts';
import {
  acquireTrackBOneShot,
  releaseTrackBOneShot,
} from '../src/features/wave2a21-track-b/oneShot.ts';
import { createSyntheticTrackCState } from '../src/features/wave2a2-track-c/fixtures.ts';
import {
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
  startTrackCWalk,
  updateTrackCActiveWalkOutcomes,
} from '../src/features/wave2a2-track-c/operations.ts';
import {
  projectTrackCCrewDetail,
  projectTrackCReleasedUnitsForTrade,
  projectTrackCUnitWork,
  projectTrackCWalkCandidates,
  projectTrackCWork,
} from '../src/features/wave2a2-track-c/projections.ts';

const featureRoot = new URL(
  '../src/features/wave2a2-track-c/',
  import.meta.url,
);
const readFeature = (name) => readFile(new URL(name, featureRoot), 'utf8');

const target = (unitNumber, trade, section) => ({
  unitId: `unit-${unitNumber}`,
  trade,
  section,
});

const proposalInput = (overrides = {}) => ({
  proposalId: 'track-b-proposal',
  trade: 'paint',
  crewId: 'crew-bluebird-paint',
  activeCrewIds: ['crew-bluebird-paint'],
  unitIds: ['unit-707'],
  sectionMode: 'specific',
  sections: ['A'],
  createdAt: '2026-07-29T17:00:00.000Z',
  createdBy: 'Los',
  ...overrides,
});

test('normal assignment inputs expose only released Units for the selected trade', () => {
  const initial = createSyntheticTrackCState();
  const state = {
    ...initial,
    units: initial.units.map((unit) =>
      unit.id !== 'unit-707'
        ? unit
        : {
            ...unit,
            workFacts: unit.workFacts.map((fact) =>
              fact.trade === 'paint'
                ? { ...fact, release: 'unreleased' }
                : fact,
            ),
          },
    ),
  };

  assert.equal(
    projectTrackCReleasedUnitsForTrade(state, 'paint').some(
      (unit) => unit.id === 'unit-707',
    ),
    false,
  );
  assert.equal(
    projectTrackCReleasedUnitsForTrade(state, 'clean').some(
      (unit) => unit.id === 'unit-707',
    ),
    true,
  );
});

test('assignment proposal requires a compatible crew active today', () => {
  const state = createSyntheticTrackCState();
  const activeCrewIds = resolveTrackBActiveCrewIds(state.crews, [
    'crew-atlas-paint',
  ]);
  const blocked = createTrackCBulkAssignmentProposal(
    state,
    proposalInput({ activeCrewIds }),
  );

  assert.equal(blocked.items[0]?.eligible, false);
  assert.ok(
    blocked.items[0]?.warnings.some(
      (warning) => warning.code === 'crew-not-active-today',
    ),
  );

  const allowed = createTrackCBulkAssignmentProposal(
    state,
    proposalInput(),
  );
  assert.equal(allowed.items[0]?.eligible, true);
});

test('assignment confirmation revalidates the crew against the current active source', () => {
  const initial = createSyntheticTrackCState();
  const proposal = createTrackCBulkAssignmentProposal(
    initial,
    proposalInput(),
  );
  assert.equal(proposal.items[0]?.eligible, true);
  const crewBecameInactive = {
    ...initial,
    crews: initial.crews.map((crew) =>
      crew.id === proposal.crewId ? { ...crew, activeToday: false } : crew
    ),
  };

  const result = confirmTrackCBulkAssignmentProposal(
    crewBecameInactive,
    proposal,
    {
      confirmed: true,
      eventIdPrefix: trackBAssignmentConfirmationPrefix(proposal.id),
      recordedAt: '2026-07-29T17:00:30.000Z',
      recordedBy: 'Los',
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'invalid-proposal');
  assert.match(result.error.message, /no longer active/i);
  assert.match(result.error.message, /review and choose/i);
  assert.equal(
    crewBecameInactive.events.some((event) =>
      event.id.startsWith(trackBAssignmentConfirmationPrefix(proposal.id))
    ),
    false,
  );

  const currentSourceResult = confirmTrackCBulkAssignmentProposal(
    initial,
    proposal,
    {
      confirmed: true,
      currentActiveCrewIds: ['crew-atlas-paint'],
      eventIdPrefix: trackBAssignmentConfirmationPrefix(proposal.id),
      recordedAt: '2026-07-29T17:00:31.000Z',
      recordedBy: 'Los',
    },
  );
  assert.equal(currentSourceResult.ok, false);
  assert.equal(currentSourceResult.error.code, 'invalid-proposal');
  assert.match(currentSourceResult.error.message, /no longer active/i);
});

test('assignment confirmation is deterministic and exact replay adds no event', () => {
  const state = createSyntheticTrackCState();
  const proposal = createTrackCBulkAssignmentProposal(
    state,
    proposalInput(),
  );
  const eventIdPrefix = trackBAssignmentConfirmationPrefix(proposal.id);
  const first = confirmTrackCBulkAssignmentProposal(state, proposal, {
    confirmed: true,
    currentActiveCrewIds: ['crew-bluebird-paint'],
    eventIdPrefix,
    recordedAt: '2026-07-29T17:01:00.000Z',
    recordedBy: 'Los',
  });
  assert.equal(first.ok, true);
  assert.equal(first.value.receipt.idempotentReplay, false);

  const replay = confirmTrackCBulkAssignmentProposal(
    first.value.state,
    proposal,
    {
      confirmed: true,
      currentActiveCrewIds: ['crew-bluebird-paint'],
      eventIdPrefix,
      recordedAt: '2026-07-29T17:02:00.000Z',
      recordedBy: 'Los',
    },
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.value.receipt.idempotentReplay, true);
  assert.equal(replay.value.state.events.length, first.value.state.events.length);
  assert.equal(
    replay.value.receipt.recordedAt,
    first.value.receipt.recordedAt,
  );
});

test('assignment confirmation rejects duplicate deterministic rows and semantic ID collisions', () => {
  const initial = createSyntheticTrackCState();
  const proposal = createTrackCBulkAssignmentProposal(
    initial,
    proposalInput({ proposalId: 'track-b-id-cardinality' }),
  );
  const input = {
    confirmed: true,
    currentActiveCrewIds: ['crew-bluebird-paint'],
    eventIdPrefix: trackBAssignmentConfirmationPrefix(proposal.id),
    recordedAt: '2026-07-29T17:02:30.000Z',
    recordedBy: 'Los',
  };
  const first = confirmTrackCBulkAssignmentProposal(initial, proposal, input);
  assert.equal(first.ok, true);
  const savedEvent = first.value.state.events.find(
    (event) => event.sourceLabel === `Confirmed personal proposal ${proposal.id}`,
  );
  assert.ok(savedEvent);

  const duplicateState = {
    ...first.value.state,
    events: [
      ...first.value.state.events,
      { ...savedEvent },
    ],
  };
  const duplicateResult = confirmTrackCBulkAssignmentProposal(
    duplicateState,
    proposal,
    { ...input, recordedAt: '2026-07-29T17:02:31.000Z' },
  );
  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.error.code, 'idempotency-conflict');
  assert.match(duplicateResult.error.message, /duplicate|conflicting/i);

  const collisionState = {
    ...initial,
    events: [
      ...initial.events,
      {
        ...savedEvent,
        sourceLabel: 'A different proposal using the same deterministic ID.',
      },
    ],
  };
  const collisionResult = confirmTrackCBulkAssignmentProposal(
    collisionState,
    proposal,
    { ...input, recordedAt: '2026-07-29T17:02:32.000Z' },
  );
  assert.equal(collisionResult.ok, false);
  assert.equal(collisionResult.error.code, 'idempotency-conflict');
  assert.match(collisionResult.error.message, /conflicting/i);
});

test('duplicate Unit/trade/section responsibility fails closed', () => {
  const initial = createSyntheticTrackCState();
  const state = {
    ...initial,
    units: initial.units.map((unit) =>
      unit.id !== 'unit-707'
        ? unit
        : {
            ...unit,
            workFacts: [
              ...unit.workFacts,
              {
                ...unit.workFacts.find(
                  (fact) =>
                    fact.trade === 'paint' && fact.section === 'A',
                ),
                id: 'duplicate-unit-707-paint-A',
              },
            ],
          },
    ),
  };
  const proposal = createTrackCBulkAssignmentProposal(
    state,
    proposalInput(),
  );
  assert.ok(
    proposal.items.some((item) =>
      item.warnings.some(
        (warning) => warning.code === 'duplicate-release-responsibility',
      ),
    ),
  );
  assert.equal(
    confirmTrackCBulkAssignmentProposal(state, proposal, {
      confirmed: true,
      eventIdPrefix: trackBAssignmentConfirmationPrefix(proposal.id),
      recordedAt: '2026-07-29T17:03:00.000Z',
      recordedBy: 'Los',
    }).ok,
    false,
  );
});

test('duplicate target facts surface one conflict and cannot inflate crew work or stats', () => {
  const initial = createSyntheticTrackCState();
  const duplicateTarget = target('301', 'paint', 'B');
  const unit = initial.units.find((candidate) => candidate.id === 'unit-301');
  const fact = unit?.workFacts.find(
    (candidate) =>
      candidate.trade === duplicateTarget.trade &&
      candidate.section === duplicateTarget.section,
  );
  assert.ok(fact);

  const duplicateState = {
    ...initial,
    units: initial.units.map((candidate) =>
      candidate.id !== 'unit-301'
        ? candidate
        : {
            ...candidate,
            workFacts: [
              ...candidate.workFacts,
              {
                ...fact,
                id: 'duplicate-unit-301-paint-B-z',
                sourceLabel: 'Adversarial duplicate release fact.',
              },
            ],
          }
    ),
  };
  const withoutTarget = {
    ...initial,
    units: initial.units.map((candidate) =>
      candidate.id !== 'unit-301'
        ? candidate
        : {
            ...candidate,
            workFacts: candidate.workFacts.filter(
              (candidateFact) =>
                candidateFact.trade !== duplicateTarget.trade ||
                candidateFact.section !== duplicateTarget.section,
            ),
          }
    ),
  };

  const surfaced = projectTrackCUnitWork(duplicateState, 'unit-301').filter(
    (projection) =>
      projection.trade === duplicateTarget.trade &&
      projection.section === duplicateTarget.section,
  );
  assert.equal(surfaced.length, 1);
  assert.equal(surfaced[0].assignmentConflict, true);
  assert.equal(surfaced[0].release, 'assignment-conflict');
  assert.equal(surfaced[0].sourceConfidence, 'conflicting');
  assert.match(surfaced[0].sourceLabel, /duplicate responsibility facts/i);
  const reorderedState = {
    ...duplicateState,
    units: duplicateState.units.map((candidate) =>
      candidate.id !== 'unit-301'
        ? candidate
        : { ...candidate, workFacts: [...candidate.workFacts].reverse() }
    ),
  };
  const reorderedSurface = projectTrackCUnitWork(
    reorderedState,
    'unit-301',
  ).filter(
    (projection) =>
      projection.trade === duplicateTarget.trade &&
      projection.section === duplicateTarget.section,
  );
  assert.deepEqual(reorderedSurface, surfaced);

  const duplicateCrew = projectTrackCCrewDetail(
    duplicateState,
    'crew-bluebird-paint',
  );
  const expectedCrew = projectTrackCCrewDetail(
    withoutTarget,
    'crew-bluebird-paint',
  );
  assert.ok(duplicateCrew);
  assert.ok(expectedCrew);
  assert.deepEqual(duplicateCrew.stats, expectedCrew.stats);
  assert.deepEqual(
    duplicateCrew.currentWork.map(
      (work) => `${work.unitId}:${work.trade}:${work.section}`,
    ),
    expectedCrew.currentWork.map(
      (work) => `${work.unitId}:${work.trade}:${work.section}`,
    ),
  );
});

test('provisional walk outcomes persist on the active walk and remain exact', () => {
  const initial = createSyntheticTrackCState();
  const candidates = projectTrackCWalkCandidates(initial);
  assert.ok(candidates.length > 0);
  const selected = candidates.slice(0, 2).map((candidate) => candidate.target);
  const started = startTrackCWalk(initial, {
    confirmedLosInspection: true,
    propertyContact: 'Synthetic property contact',
    selectedTargets: selected,
    startedAt: '2026-07-29T17:04:00.000Z',
    startedBy: 'Los',
    walkSessionId: 'track-b-walk',
  });
  assert.equal(started.ok, true);

  const updated = updateTrackCActiveWalkOutcomes(started.value, [
    { outcome: 'accepted', target: selected[0] },
  ]);
  assert.equal(updated.ok, true);
  assert.deepEqual(updated.value.activeWalk?.outcomes, [
    { outcome: 'accepted', target: selected[0] },
  ]);
  assert.equal(
    projectTrackCWork(updated.value, selected[0])?.property,
    'pending-property-walk',
    'A provisional outcome must not become property acceptance.',
  );
});

test('one-shot guard rejects a rapid second submission until released', () => {
  const guard = { current: false };
  assert.equal(acquireTrackBOneShot(guard), true);
  assert.equal(acquireTrackBOneShot(guard), false);
  releaseTrackBOneShot(guard);
  assert.equal(acquireTrackBOneShot(guard), true);
});

test('Additional Scope stays a non-blocking personal draft', () => {
  const result = createTrackBAdditionalScopeDraft({
    createdAt: '2026-07-29T17:05:00.000Z',
    createdBy: 'Los',
    description: 'Patch a small wall area behind the door.',
    id: 'scope-1',
    scopeType: 'drywall-repair',
    relatedTrade: 'paint',
    sections: ['A', 'A'],
    sourceContact: 'Joseph — onsite walk',
    sourceRecordedAt: '2026-07-29T17:04:30.000Z',
    changeOrderCandidate: 'uncertain',
    status: 'needs-clarification',
    unitId: 'unit-707',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.sections, ['A']);
  assert.equal(result.value.description, 'Patch a small wall area behind the door.');
  assert.equal(result.value.scopeType, 'drywall-repair');
  assert.equal(result.value.sourceContact, 'Joseph — onsite walk');
  assert.equal(result.value.changeOrderCandidate, 'uncertain');
  assert.equal(result.value.status, 'needs-clarification');
  assert.equal(result.value.personalDraftOnly, true);
  assert.equal(result.value.blocksStandardWork, false);
  assert.equal(result.value.officialChangeOrderCreated, false);
  assert.equal(result.value.officialFormSubmitted, false);
  assert.deepEqual(TRACK_B_ADDITIONAL_SCOPE_BOUNDARY, {
    blocksPaintOrClean: false,
    officialChangeOrder: false,
    officialSubmission: false,
    persistence: 'integration-owned',
  });
});

test('personal PDS mirror may request the reviewed form but cannot prefill or submit', () => {
  assert.deepEqual(
    createTrackBOfficialFormRequest([
      target('301', 'paint', 'A'),
      target('301', 'clean', 'A'),
    ]),
    {
      form: 'turn-sign-off',
      personalRecordOnly: true,
      prefill: false,
      source: 'property-accepted-context',
      submit: false,
      targets: [
        target('301', 'paint', 'A'),
        target('301', 'clean', 'A'),
      ],
    },
  );
});

test('Track B UI contracts keep normal assignment, true walk empty state, and navigation callbacks explicit', async () => {
  const [assignmentSource, walkSource, crewSource, additionalScopeSource] =
    await Promise.all([
    readFeature('AssignmentView.tsx'),
    readFeature('WalkView.tsx'),
    readFeature('CrewView.tsx'),
    readFile(
      new URL(
        '../src/features/wave2a21-track-b/AdditionalScopeHelper.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  assert.match(assignmentSource, /<legend>Released Units<\/legend>/u);
  assert.match(assignmentSource, /<summary>Exceptions<\/summary>/u);
  assert.match(assignmentSource, /All released sections/u);
  assert.match(additionalScopeSource, /Add additional scope/u);
  assert.match(
    assignmentSource,
    /trackBAssignmentConfirmationPrefix\(proposal\.id\)/u,
  );
  assert.match(walkSource, /No work is ready to walk/u);
  assert.match(walkSource, /propertyContacts/u);
  assert.match(walkSource, /updateTrackCActiveWalkOutcomes/u);
  assert.match(walkSource, /I inspected every selected item/u);
  assert.match(crewSource, /onOpenWork/u);
  assert.match(crewSource, /source: 'crew-detail'/u);
});
