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
  buildDailyReportData,
} from '../src/features/wave2a2-track-c/dailyReport.ts';
import {
  buildWalkReceiptText,
} from '../src/features/wave2a2-track-c/walkReceipt.ts';
import {
  TRACK_C_PROJECTION_INVARIANTS,
  projectTrackCAssignmentEligibility,
  projectTrackCAssignmentEligibleUnits,
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
        id: `ready-${unitNumber}-${trade}-${targetIndex}-${eventIndex}`,
        eventType,
        confirmation: 'confirmed',
        target: workTarget,
        crewId,
        recordedAt: `2026-07-28T22:${String(
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

test('assignment eligibility exposes only released exact section-trades and excludes unresolved work', () => {
  const state = createSyntheticTrackCState();

  assert.deepEqual(
    projectTrackCAssignmentEligibility(state, target('707', 'paint', 'A')),
    {
      eligible: true,
      projection: projectTrackCWork(state, target('707', 'paint', 'A')),
      reasons: [],
    },
  );
  assert.equal(
    projectTrackCAssignmentEligibility(state, target('304', 'clean', 'A')).eligible,
    false,
  );
  assert.match(
    projectTrackCAssignmentEligibility(state, target('304', 'clean', 'A')).reasons.join(' '),
    /not confirmed released/iu,
  );
  assert.equal(
    projectTrackCAssignmentEligibility(state, target('501', 'paint', 'common')).eligible,
    false,
  );
  assert.equal(
    projectTrackCAssignmentEligibility(state, target('501', 'paint', 'C')).eligible,
    false,
  );
  assert.equal(
    projectTrackCAssignmentEligibility(state, target('707', 'clean', 'E')).eligible,
    false,
  );

  const eligibleCleanUnits = projectTrackCAssignmentEligibleUnits(state, 'clean')
    .map((unit) => unit.id);
  assert.equal(eligibleCleanUnits.includes('unit-304'), false);

  const allReleased = createTrackCBulkAssignmentProposal(state, {
    ...proposalInput(),
    crewId: 'crew-cedar-clean',
    proposalId: 'proposal-unreleased-exclusion',
    sectionMode: 'all-released',
    sections: undefined,
    trade: 'clean',
    unitIds: ['unit-304'],
  });
  assert.deepEqual(allReleased.items, []);
  assert.ok(allReleased.warnings.some(
    (warning) => warning.code === 'unreleased' && warning.severity === 'caution',
  ));
  assert.ok(allReleased.warnings.some(
    (warning) => warning.code === 'no-applicable-released-sections',
  ));
});

test('assignment confirmation rechecks current eligibility and duplicate confirmation appends nothing', () => {
  const state = createSyntheticTrackCState();
  const proposal = createTrackCBulkAssignmentProposal(state, {
    ...proposalInput(),
    proposalId: 'proposal-final-eligibility',
  });
  assert.equal(proposal.items.length, 1);
  assert.equal(proposal.items[0]?.eligible, true);

  const first = confirmTrackCBulkAssignmentProposal(
    state,
    proposal,
    confirmInput('final-eligibility-event'),
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(
    first.value.state.events.filter((event) =>
      event.id.startsWith('final-eligibility-event')).length,
    1,
  );

  const duplicate = confirmTrackCBulkAssignmentProposal(
    first.value.state,
    proposal,
    confirmInput('duplicate-final-eligibility-event'),
  );
  assert.equal(duplicate.ok, false);
  assert.equal(
    first.value.state.events.some((event) =>
      event.id.startsWith('duplicate-final-eligibility-event')),
    false,
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
  const partial = createSyntheticTrackCState();
  assert.equal(
    projectTrackCWalkCandidates(partial).some(
      (candidate) =>
        candidate.unitNumber === '301' && candidate.trade === 'paint',
    ),
    false,
    'Partial Los-passed sections must not create a walk candidate.',
  );

  const ready = makePackageReady(
    partial,
    '301',
    'paint',
    'crew-bluebird-paint',
  );
  const candidate = projectTrackCWalkCandidates(ready).find(
    (item) => item.unitNumber === '301' && item.trade === 'paint',
  );
  assert.ok(candidate);
  assert.deepEqual(
    candidate.targets.map((item) => item.section),
    ['common', 'A', 'B', 'C'],
  );
  assert.equal(candidate.sectionCount, 4);
  assert.equal(
    projectTrackCWalkCandidates(ready).some(
      (item) => item.unitNumber === '401' && item.trade === 'paint',
    ),
    false,
  );
});

test('End Walk atomically rejects callback, access, assignment, or prior-acceptance changes on any reviewed target', () => {
  const startWalk = () => {
    const initial = makePackageReady(
      createSyntheticTrackCState(),
      '301',
      'paint',
      'crew-bluebird-paint',
    );
    const selectedTargets = packageTargets(initial, '301', 'paint');
    const started = startTrackCWalk(initial, {
      walkSessionId: 'walk-stale-review',
      propertyContact: 'Synthetic property contact',
      selectedTargets,
      startedAt: '2026-07-28T21:00:00.000Z',
      startedBy: 'Los',
      confirmedLosInspection: true,
    });
    assert.equal(started.ok, true);
    return {
      firstTarget: selectedTargets[0],
      staleTarget: selectedTargets[1],
      state: started.value,
    };
  };
  const confirmedEvent = (staleTarget, overrides) => ({
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

  const callbackStart = startWalk();
  const callbackState = applyTrackCSectionAction(callbackStart.state, {
    eventId: 'stale-walk-callback',
    action: 'open-callback',
    target: callbackStart.staleTarget,
    recordedAt: '2026-07-28T21:05:00.000Z',
    recordedBy: 'Los',
  });
  assert.equal(callbackState.ok, true);

  const reworkState = applyTrackCSectionAction(callbackState.value, {
    eventId: 'stale-walk-rework',
    action: 'record-correction-ready',
    target: callbackStart.staleTarget,
    recordedAt: '2026-07-28T21:06:00.000Z',
    recordedBy: 'Los',
  });
  assert.equal(reworkState.ok, true);

  const accessStart = startWalk();
  const accessState = {
    ...accessStart.state,
    units: accessStart.state.units.map((unit) =>
      unit.id !== accessStart.staleTarget.unitId
        ? unit
        : {
            ...unit,
            workFacts: unit.workFacts.map((fact) =>
              fact.trade === accessStart.staleTarget.trade &&
              fact.section === accessStart.staleTarget.section
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
    ...assignmentStart.state,
    events: [
      ...assignmentStart.state.events,
      confirmedEvent(assignmentStart.staleTarget, {
        id: 'stale-walk-assignment',
      }),
    ],
  };
  const acceptanceStart = startWalk();
  const priorAcceptanceState = {
    ...acceptanceStart.state,
    events: [
      ...acceptanceStart.state.events,
      confirmedEvent(acceptanceStart.staleTarget, {
        id: 'stale-walk-acceptance',
        eventType: 'property-accepted',
        crewId: 'crew-bluebird-paint',
      }),
    ],
  };

  for (const [label, state, firstTarget] of [
    ['callback', callbackState.value, callbackStart.firstTarget],
    ['rework', reworkState.value, callbackStart.firstTarget],
    ['access', accessState, accessStart.firstTarget],
    ['assignment', assignmentState, assignmentStart.firstTarget],
    ['prior acceptance', priorAcceptanceState, acceptanceStart.firstTarget],
  ]) {
    const result = endTrackCWalk(state, {
      endedAt: '2026-07-28T21:10:00.000Z',
      recordedBy: 'Los',
      eventIdPrefix: `rejected-${label.replaceAll(' ', '-')}`,
      outcomes: state.activeWalk.selectedTargets.map((target) => ({
        target,
        outcome: 'accepted',
      })),
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
  const correctionTarget = paintTargets[0];
  const acceptedTarget = cleanTargets[0];
  const responsibleCrew = projectTrackCWork(initial, correctionTarget)?.responsibleCrewId;

  const started = startTrackCWalk(initial, {
    walkSessionId: 'walk-test',
    propertyContact: 'Synthetic property contact',
    selectedTargets: [...paintTargets, ...cleanTargets],
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
      ...paintTargets.map((target, index) => ({
        target,
        outcome: index === 0 ? 'correction-requested' : 'accepted',
      })),
      ...cleanTargets.map((target) => ({ target, outcome: 'accepted' })),
    ],
  });
  assert.equal(ended.ok, true);

  const correction = projectTrackCWork(ended.value, correctionTarget);
  const accepted = projectTrackCWork(ended.value, acceptedTarget);
  assert.equal(correction?.responsibleCrewId, responsibleCrew);
  assert.equal(correction?.callbackOpen, true);
  assert.equal(correction?.property, 'not-ready');
  assert.equal(
    projectTrackCWork(ended.value, paintTargets[1])?.property,
    'pending-property-walk',
    'A correction must keep the entire Paint package from becoming accepted.',
  );
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

test('walk receipt reads at Unit + Trade grain with contact, acceptance, and paper boundary', () => {
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

  const started = startTrackCWalk(initial, {
    walkSessionId: 'walk-receipt-test',
    propertyContact: 'Joseph',
    selectedTargets: [...paintTargets, ...cleanTargets],
    startedAt: '2026-07-28T21:00:00.000Z',
    startedBy: 'Los',
    confirmedLosInspection: true,
  });
  assert.equal(started.ok, true);
  const ended = endTrackCWalk(started.value, {
    endedAt: '2026-07-28T21:10:00.000Z',
    recordedBy: 'Los',
    eventIdPrefix: 'walk-receipt-outcome',
    outcomes: [
      ...paintTargets.map((target, index) => ({
        target,
        outcome: index === 0 ? 'correction-requested' : 'accepted',
      })),
      ...cleanTargets.map((target) => ({ target, outcome: 'accepted' })),
    ],
  });
  assert.equal(ended.ok, true);

  const walk = ended.value.completedWalks[ended.value.completedWalks.length - 1];
  const receipt = buildWalkReceiptText(ended.value, walk);
  const lines = receipt.split('\n');

  assert.match(lines[0], /walk receipt$/u);
  assert.match(lines[1], /^Walked with Joseph · /u);
  const paintLine = lines.find((line) => line.includes('Unit 301 · Paint'));
  const cleanLine = lines.find((line) => line.includes('Unit 606 · Clean'));
  assert.ok(paintLine, 'receipt has a Unit 301 Paint line');
  assert.ok(cleanLine, 'receipt has a Unit 606 Clean line');
  assert.match(paintLine, /needs work/u);
  assert.match(paintLine, new RegExp(`${paintTargets.length - 1}/${paintTargets.length} accepted`, 'u'));
  assert.match(cleanLine, new RegExp(`all ${cleanTargets.length} sections accepted`, 'u'));
  assert.equal(
    lines[lines.length - 1],
    'Paper TurnBoard remains the official record.',
  );
});

test('daily report data counts accepted units, open callbacks, and walked-with from the ledger', () => {
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
  const started = startTrackCWalk(initial, {
    walkSessionId: 'walk-report-test',
    propertyContact: 'Joseph',
    selectedTargets: [...paintTargets, ...cleanTargets],
    startedAt: '2026-07-28T21:00:00.000Z',
    startedBy: 'Los',
    confirmedLosInspection: true,
  });
  assert.equal(started.ok, true);
  const ended = endTrackCWalk(started.value, {
    endedAt: '2026-07-28T21:10:00.000Z',
    recordedBy: 'Los',
    eventIdPrefix: 'walk-report-outcome',
    outcomes: [
      ...paintTargets.map((target, index) => ({
        target,
        outcome: index === 0 ? 'correction-requested' : 'accepted',
      })),
      ...cleanTargets.map((target) => ({ target, outcome: 'accepted' })),
    ],
  });
  assert.equal(ended.ok, true);

  const toLocalDate = (iso) => {
    const date = new Date(iso);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
  };
  const reportDate = toLocalDate('2026-07-28T21:10:00.000Z');
  const baselineAccepted = initial.events.filter((event) =>
    event.eventType === 'property-accepted'
    && toLocalDate(event.recordedAt) === reportDate);
  const baselineUnits = new Set(baselineAccepted.map((event) => event.target.unitId));
  const report = buildDailyReportData({
    date: reportDate,
    dayNumber: 3,
    state: ended.value,
  });

  assert.equal(report.propertyName, ended.value.propertyName);
  assert.equal(report.dayNumber, 3);
  assert.equal(report.supervisor, 'Los');
  assert.equal(
    report.stats.unitsAccepted,
    new Set([...baselineUnits, 'unit-606']).size,
    'only the fully accepted clean package adds acceptance — the corrected paint package defers',
  );
  assert.equal(
    report.stats.sectionsAccepted,
    baselineAccepted.length + cleanTargets.length,
  );
  assert.equal(report.stats.callbacksStillOpen >= 1, true, 'the paint correction stays open');
  const cleanUnit = report.unitsDone.find((unit) => unit.unitNumber === '606');
  assert.ok(cleanUnit, 'the fully accepted clean unit is listed');
  assert.equal(cleanUnit.walkedWith, 'Joseph');
  assert.ok(cleanUnit.time, 'accepted units carry the walk time');
  assert.ok(
    report.openCallbacks.some((callback) => callback.unitNumber === '301'),
    'open callbacks list the corrected paint unit',
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
