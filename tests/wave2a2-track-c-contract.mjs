import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  createSyntheticTrackCState,
  createTrackCScaleState,
} from '../src/features/wave2a2-track-c/fixtures.ts';
import {
  TRACK_C_OPERATION_BOUNDARY,
  applyTrackCSectionAction,
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

test('bulk confirmation atomically rejects reviewed identity, crew, trade, Unit, and section tampering', () => {
  const initial = createSyntheticTrackCState();
  const reviewed = createTrackCBulkAssignmentProposal(
    initial,
    proposalInput({ proposalId: 'reviewed-immutable-identity' }),
  );
  assert.equal(reviewed.items.length, 1);
  assert.equal(reviewed.items[0]?.eligible, true);

  const tamperedProposals = [
    {
      label: 'identity',
      proposal: { ...reviewed, id: 'tampered-identity' },
    },
    {
      label: 'crew',
      proposal: { ...reviewed, crewId: 'crew-atlas-paint' },
    },
    {
      label: 'trade',
      proposal: { ...reviewed, trade: 'clean' },
    },
    {
      label: 'Unit',
      proposal: { ...reviewed, unitIds: ['unit-606'] },
    },
    {
      label: 'section',
      proposal: {
        ...reviewed,
        items: reviewed.items.map((item, index) =>
          index === 0
            ? { ...item, target: { ...item.target, section: 'B' } }
            : item
        ),
      },
    },
  ];

  for (const { label, proposal } of tamperedProposals) {
    const result = confirmTrackCBulkAssignmentProposal(
      initial,
      proposal,
      confirmInput(`tampered-${label}`),
    );
    assert.equal(result.ok, false, `${label} tampering must be rejected.`);
    assert.equal(result.error.code, 'invalid-proposal');
    assert.match(result.error.message, /identity changed/i);
    assert.equal(
      initial.events.some((event) => event.id.startsWith(`tampered-${label}`)),
      false,
      `${label} tampering must not append any assignment event.`,
    );
  }
});

test('crew-complete evidence remains recordable when access blocks Los inspection', () => {
  const initial = createSyntheticTrackCState();
  const blockedTarget = target('401', 'clean', 'B');
  const before = projectTrackCWork(initial, blockedTarget);
  assert.equal(before?.access, 'access-blocked');
  assert.equal(before?.execution, 'assigned');

  const recorded = applyTrackCSectionAction(initial, {
    eventId: 'blocked-access-crew-report',
    action: 'record-crew-complete',
    target: blockedTarget,
    recordedAt: '2026-07-28T20:30:00.000Z',
    recordedBy: 'Los',
  });
  assert.equal(recorded.ok, true);
  const after = projectTrackCWork(recorded.value, blockedTarget);
  assert.equal(after?.execution, 'crew-reported-complete');
  assert.equal(after?.inspection, 'needs-los-inspection');
  assert.equal(after?.access, 'access-blocked');

  const inspection = applyTrackCSectionAction(recorded.value, {
    eventId: 'blocked-access-los-pass',
    action: 'record-los-pass',
    target: blockedTarget,
    recordedAt: '2026-07-28T20:31:00.000Z',
    recordedBy: 'Los',
  });
  assert.equal(inspection.ok, false);
  assert.equal(inspection.error.code, 'blocked');
  assert.match(inspection.error.message, /access is blocked/i);
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

test('End Walk atomically rejects callback, access, assignment, or prior-acceptance changes on any reviewed target', () => {
  const firstTarget = target('301', 'paint', 'common');
  const staleTarget = target('301', 'paint', 'A');
  const startWalk = () => {
    const initial = createSyntheticTrackCState();
    const started = startTrackCWalk(initial, {
      walkSessionId: 'walk-stale-review',
      propertyContact: 'Synthetic property contact',
      selectedTargets: [firstTarget, staleTarget],
      startedAt: '2026-07-28T21:00:00.000Z',
      startedBy: 'Los',
      confirmedLosInspection: true,
    });
    assert.equal(started.ok, true);
    return started.value;
  };
  const confirmedEvent = (overrides) => ({
    id: 'stale-walk-event',
    eventType: 'assignment-confirmed',
    confirmation: 'confirmed',
    target: staleTarget,
    crewId: 'crew-atlas-paint',
    recordedAt: '2026-07-28T21:05:00.000Z',
    recordedBy: 'Synthetic test',
    sourceType: 'personal-confirmation',
    sourceLabel: 'Adversarial Track C test',
    summary: 'State changed after walk review.',
    personalRecordOnly: true,
    officialPaperChanged: false,
    payrollChanged: false,
    ...overrides,
  });

  const callbackState = applyTrackCSectionAction(startWalk(), {
    eventId: 'stale-walk-callback',
    action: 'open-callback',
    target: staleTarget,
    recordedAt: '2026-07-28T21:05:00.000Z',
    recordedBy: 'Los',
  });
  assert.equal(callbackState.ok, true);

  const reworkState = applyTrackCSectionAction(callbackState.value, {
    eventId: 'stale-walk-rework',
    action: 'record-correction-ready',
    target: staleTarget,
    recordedAt: '2026-07-28T21:06:00.000Z',
    recordedBy: 'Los',
  });
  assert.equal(reworkState.ok, true);

  const accessStart = startWalk();
  const accessState = {
    ...accessStart,
    units: accessStart.units.map((unit) =>
      unit.id !== staleTarget.unitId
        ? unit
        : {
            ...unit,
            workFacts: unit.workFacts.map((fact) =>
              fact.trade === staleTarget.trade &&
              fact.section === staleTarget.section
                ? {
                    ...fact,
                    access: 'access-blocked',
                    restrictionLabel: 'Access changed during the walk.',
                  }
                : fact
            ),
          }
    ),
  };
  const assignmentStart = startWalk();
  const assignmentState = {
    ...assignmentStart,
    events: [
      ...assignmentStart.events,
      confirmedEvent({ id: 'stale-walk-assignment' }),
    ],
  };
  const acceptanceStart = startWalk();
  const priorAcceptanceState = {
    ...acceptanceStart,
    events: [
      ...acceptanceStart.events,
      confirmedEvent({
        id: 'stale-walk-acceptance',
        eventType: 'property-accepted',
        crewId: 'crew-bluebird-paint',
      }),
    ],
  };

  for (const [label, state] of [
    ['callback', callbackState.value],
    ['rework', reworkState.value],
    ['access', accessState],
    ['assignment', assignmentState],
    ['prior acceptance', priorAcceptanceState],
  ]) {
    const result = endTrackCWalk(state, {
      endedAt: '2026-07-28T21:10:00.000Z',
      recordedBy: 'Los',
      eventIdPrefix: `rejected-${label.replaceAll(' ', '-')}`,
      outcomes: [
        { target: firstTarget, outcome: 'accepted' },
        { target: staleTarget, outcome: 'accepted' },
      ],
    });
    assert.equal(result.ok, false, `${label} change must reject End Walk.`);
    assert.equal(result.error.code, 'not-walk-candidate');
    assert.match(result.error.message, /stale/i);
    assert.equal(
      state.events.some((event) =>
        event.id.startsWith(`rejected-${label.replaceAll(' ', '-')}`)
      ),
      false,
      `${label} rejection must append no property-acceptance events.`,
    );
    assert.equal(
      projectTrackCWork(state, firstTarget)?.property,
      'pending-property-walk',
      `${label} rejection must leave the otherwise-valid first target pending.`,
    );
    assert.equal(state.activeWalk?.status, 'active');
  }
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
