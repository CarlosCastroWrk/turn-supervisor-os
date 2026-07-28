import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  createSyntheticTrackCState,
  createTrackCScaleState,
} from '../src/features/wave2a2-track-c/fixtures.ts';
import {
  TRACK_C_OPERATION_BOUNDARY,
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
  endTrackCWalk,
  recordTrackCPersonalPdsMirror,
  startTrackCWalk,
} from '../src/features/wave2a2-track-c/operations.ts';
import {
  TRACK_C_PROJECTION_INVARIANTS,
  projectTrackCCrewDetail,
  projectTrackCUnitWork,
  projectTrackCWalkCandidates,
  projectTrackCWork,
  searchTrackCCompactUnits,
} from '../src/features/wave2a2-track-c/projections.ts';

const target = (unitNumber, trade, section) => ({
  unitId: `unit-${unitNumber}`,
  trade,
  section,
});

const proposalInput = (overrides = {}) => ({
  proposalId: 'proposal-test',
  trade: 'paint',
  crewId: 'crew-bluebird-paint',
  unitIds: ['unit-707'],
  sectionMode: 'specific',
  sections: ['A'],
  createdAt: '2026-07-28T20:00:00.000Z',
  createdBy: 'Los',
  ...overrides,
});

const confirmInput = (prefix = 'confirm-test') => ({
  recordedAt: '2026-07-28T20:05:00.000Z',
  recordedBy: 'Los',
  eventIdPrefix: prefix,
  confirmed: true,
});

test('Track C preserves every field-truth layer and has no whole-Unit completion state', () => {
  const state = createSyntheticTrackCState();
  const work = projectTrackCWork(state, target('301', 'paint', 'B'));

  assert.ok(work);
  assert.equal(work.release, 'released');
  assert.equal(work.responsibleCrewId, 'crew-bluebird-paint');
  assert.equal(work.execution, 'crew-reported-complete');
  assert.equal(work.inspection, 'needs-los-inspection');
  assert.equal(work.property, 'not-ready');
  assert.equal(work.personalPdsMirror, false);
  assert.deepEqual(TRACK_C_PROJECTION_INVARIANTS, {
    authoritativePaperChanged: false,
    payrollCalculated: false,
    wholeUnitDoneState: false,
    statsSource: 'confirmed-events-only',
    trades: ['paint', 'clean'],
  });
  assert.deepEqual(TRACK_C_OPERATION_BOUNDARY, {
    recordAuthority: 'personal-turn-os-only',
    officialPaperAuthority: 'unchanged',
    payrollEffect: 'none',
    automaticApproval: false,
    legalSignature: false,
    wholeUnitDone: false,
  });
});

test('Unit detail projections contain only structurally applicable Common/A-E and keep Paint/Clean independent', () => {
  const state = createSyntheticTrackCState();
  const work = projectTrackCUnitWork(state, 'unit-707');
  assert.deepEqual(
    work.filter((item) => item.trade === 'paint').map((item) => item.section),
    ['common', 'A', 'B'],
  );
  assert.deepEqual(
    work.filter((item) => item.trade === 'clean').map((item) => item.section),
    ['common', 'A', 'B'],
  );
  assert.equal(
    projectTrackCWork(state, target('707', 'paint', 'C')),
    undefined,
  );
  assert.equal(
    projectTrackCWork(state, target('301', 'paint', 'common'))?.inspection,
    'los-passed',
  );
  assert.equal(
    projectTrackCWork(state, target('301', 'clean', 'common'))?.inspection,
    'needs-los-inspection',
  );
});

test('crew stats ignore draft events and derive confirmed current/complete/pass/callback/accepted counts', () => {
  const state = createSyntheticTrackCState();
  const draftOnly = projectTrackCWork(state, target('707', 'paint', 'A'));
  const detail = projectTrackCCrewDetail(state, 'crew-bluebird-paint');

  assert.ok(draftOnly);
  assert.deepEqual(draftOnly.activeCrewIds, []);
  assert.ok(detail);
  assert.equal(
    detail.currentWork.some(
      (item) =>
        item.unitId === 'unit-707' &&
        item.trade === 'paint' &&
        item.section === 'A',
    ),
    false,
  );
  assert.ok(detail.stats.currentAssignments > 0);
  assert.ok(detail.stats.crewReportedComplete > 0);
  assert.ok(detail.stats.needsLosInspection > 0);
  assert.ok(detail.stats.losPassed > 0);
  assert.ok(detail.stats.openCallbacks > 0);
  assert.ok(detail.stats.propertyAccepted > 0);
});

test('bulk assignment reviews released scope and warns on duplicate, access, occupancy, and source conflicts', () => {
  const state = createSyntheticTrackCState();
  const duplicate = createTrackCBulkAssignmentProposal(state, {
    ...proposalInput(),
    proposalId: 'proposal-duplicate',
    unitIds: ['unit-401'],
    sections: ['A'],
  });
  assert.equal(duplicate.items[0]?.eligible, false);
  assert.ok(
    duplicate.items[0]?.warnings.some(
      (warning) =>
        warning.code === 'duplicate-active-crew' ||
        warning.code === 'assignment-source-conflict',
    ),
  );

  const occupancy = createTrackCBulkAssignmentProposal(state, {
    ...proposalInput(),
    proposalId: 'proposal-occupancy',
    unitIds: ['unit-501'],
    sections: ['C'],
  });
  assert.ok(
    occupancy.items[0]?.warnings.some(
      (warning) => warning.code === 'occupancy-restriction',
    ),
  );

  const source = createTrackCBulkAssignmentProposal(state, {
    ...proposalInput(),
    proposalId: 'proposal-source',
    unitIds: ['unit-501'],
    sections: ['common'],
  });
  assert.ok(
    source.items[0]?.warnings.some(
      (warning) => warning.code === 'source-uncertain',
    ),
  );
});

test('bulk confirmation rejects a stale reviewed proposal after a newer assignment, access restriction, or source conflict', () => {
  const initial = createSyntheticTrackCState();

  const reviewedBeforeAssignment = createTrackCBulkAssignmentProposal(
    initial,
    proposalInput({ proposalId: 'reviewed-before-assignment' }),
  );
  assert.equal(reviewedBeforeAssignment.items[0]?.eligible, true);
  const newerAssignment = createTrackCBulkAssignmentProposal(initial, {
    ...proposalInput(),
    proposalId: 'newer-assignment',
    crewId: 'crew-atlas-paint',
  });
  const newerAssignmentResult = confirmTrackCBulkAssignmentProposal(
    initial,
    newerAssignment,
    confirmInput('newer-assignment-event'),
  );
  assert.equal(newerAssignmentResult.ok, true);
  assert.equal(
    confirmTrackCBulkAssignmentProposal(
      newerAssignmentResult.value.state,
      reviewedBeforeAssignment,
      confirmInput('stale-assignment-event'),
    ).ok,
    false,
  );

  const reviewedBeforeAccess = createTrackCBulkAssignmentProposal(initial, {
    ...proposalInput(),
    proposalId: 'reviewed-before-access',
    sections: ['B'],
  });
  const accessChanged = {
    ...initial,
    units: initial.units.map((unit) =>
      unit.id !== 'unit-707'
        ? unit
        : {
            ...unit,
            workFacts: unit.workFacts.map((fact) =>
              fact.trade === 'paint' && fact.section === 'B'
                ? {
                    ...fact,
                    access: 'occupied-restricted',
                    restrictionLabel: 'New occupied-room restriction.',
                  }
                : fact,
            ),
          },
    ),
  };
  const staleAccessResult = confirmTrackCBulkAssignmentProposal(
    accessChanged,
    reviewedBeforeAccess,
    confirmInput('stale-access-event'),
  );
  assert.equal(staleAccessResult.ok, false);
  assert.match(staleAccessResult.error.message, /stale/i);

  const reviewedBeforeSource = createTrackCBulkAssignmentProposal(initial, {
    ...proposalInput(),
    proposalId: 'reviewed-before-source',
    trade: 'clean',
    crewId: 'crew-cedar-clean',
  });
  const sourceChanged = {
    ...initial,
    units: initial.units.map((unit) =>
      unit.id !== 'unit-707'
        ? unit
        : {
            ...unit,
            workFacts: unit.workFacts.map((fact) =>
              fact.trade === 'clean' && fact.section === 'A'
                ? {
                    ...fact,
                    release: 'source-uncertain',
                    sourceConfidence: 'uncertain',
                    sourceLabel: 'New source conflict.',
                  }
                : fact,
            ),
          },
    ),
  };
  const staleSourceResult = confirmTrackCBulkAssignmentProposal(
    sourceChanged,
    reviewedBeforeSource,
    confirmInput('stale-source-event'),
  );
  assert.equal(staleSourceResult.ok, false);
  assert.match(staleSourceResult.error.message, /stale/i);
});

test('bulk confirmation atomically rejects a multi-item proposal when a later item becomes stale', () => {
  const initial = createSyntheticTrackCState();
  const reviewed = createTrackCBulkAssignmentProposal(initial, {
    ...proposalInput(),
    proposalId: 'reviewed-multi-item',
    sectionMode: 'all-released',
    sections: undefined,
  });
  assert.equal(reviewed.items.length, 3);
  assert.equal(reviewed.items.every((item) => item.eligible), true);

  const laterTarget = reviewed.items[2]?.target;
  assert.ok(laterTarget);
  const sourceChanged = {
    ...initial,
    units: initial.units.map((unit) =>
      unit.id !== laterTarget.unitId
        ? unit
        : {
            ...unit,
            workFacts: unit.workFacts.map((fact) =>
              fact.trade === laterTarget.trade &&
              fact.section === laterTarget.section
                ? {
                    ...fact,
                    sourceConfidence: 'conflicting',
                    sourceLabel: 'Later-item source conflict after proposal review.',
                  }
                : fact,
            ),
          },
    ),
  };

  const result = confirmTrackCBulkAssignmentProposal(
    sourceChanged,
    reviewed,
    confirmInput('atomic-stale-event'),
  );
  assert.equal(result.ok, false);
  assert.match(result.error.message, /stale/i);
  assert.equal(
    sourceChanged.events.some((event) =>
      event.id.startsWith('atomic-stale-event')
    ),
    false,
  );
  assert.equal(
    projectTrackCWork(sourceChanged, reviewed.items[0].target)?.activeCrewIds
      .length,
    0,
  );
});

test('walk candidates require Los pass, pending property walk, and no blockers', () => {
  const candidates = projectTrackCWalkCandidates(createSyntheticTrackCState());
  const keys = candidates.map((candidate) =>
    `${candidate.unitNumber}:${candidate.target.trade}:${candidate.target.section}`
  );
  assert.ok(keys.includes('301:paint:common'));
  assert.ok(keys.includes('606:clean:A'));
  assert.equal(keys.includes('301:paint:B'), false);
  assert.equal(keys.includes('401:paint:A'), false);
  assert.equal(keys.includes('410:paint:A'), false);
});

test('walk correction preserves crew while acceptance and personal paper mirror remain separate explicit events', () => {
  const initial = createSyntheticTrackCState();
  const correctionTarget = target('301', 'paint', 'common');
  const acceptedTarget = target('301', 'paint', 'A');
  const responsibleCrew = projectTrackCWork(initial, correctionTarget)?.responsibleCrewId;

  const started = startTrackCWalk(initial, {
    walkSessionId: 'walk-test',
    propertyContact: 'Synthetic property contact',
    selectedTargets: [correctionTarget, acceptedTarget],
    startedAt: '2026-07-28T21:00:00.000Z',
    startedBy: 'Los',
    confirmedLosInspection: true,
  });
  assert.equal(started.ok, true);

  const ended = endTrackCWalk(started.value, {
    endedAt: '2026-07-28T21:10:00.000Z',
    recordedBy: 'Los',
    eventIdPrefix: 'walk-outcome',
    outcomes: [
      { target: correctionTarget, outcome: 'correction-requested' },
      { target: acceptedTarget, outcome: 'accepted' },
    ],
  });
  assert.equal(ended.ok, true);

  const correction = projectTrackCWork(ended.value, correctionTarget);
  const accepted = projectTrackCWork(ended.value, acceptedTarget);
  assert.equal(correction?.responsibleCrewId, responsibleCrew);
  assert.equal(correction?.callbackOpen, true);
  assert.equal(correction?.property, 'not-ready');
  assert.equal(accepted?.property, 'property-accepted');
  assert.equal(accepted?.personalPdsMirror, false);

  const unconfirmedMirror = recordTrackCPersonalPdsMirror(ended.value, {
    eventId: 'mirror-unconfirmed',
    target: acceptedTarget,
    recordedAt: '2026-07-28T21:11:00.000Z',
    recordedBy: 'Los',
    confirmed: false,
  });
  assert.equal(unconfirmedMirror.ok, false);

  const mirrored = recordTrackCPersonalPdsMirror(ended.value, {
    eventId: 'mirror-confirmed',
    target: acceptedTarget,
    recordedAt: '2026-07-28T21:12:00.000Z',
    recordedBy: 'Los',
    confirmed: true,
  });
  assert.equal(mirrored.ok, true);
  assert.equal(
    projectTrackCWork(mirrored.value, acceptedTarget)?.personalPdsMirror,
    true,
  );
});

test('500-Unit compact projection and search remain bounded', () => {
  const state = createTrackCScaleState(500);
  const start = performance.now();
  const all = searchTrackCCompactUnits(state);
  const search = searchTrackCCompactUnits(state, '1499');
  const elapsedMs = performance.now() - start;

  assert.equal(all.length, 500);
  assert.equal(search.length, 1);
  assert.equal(search[0]?.unitNumber, '1499');
  assert.ok(
    elapsedMs < 1_500,
    `500-Unit projection/search took ${elapsedMs.toFixed(2)}ms.`,
  );
});
