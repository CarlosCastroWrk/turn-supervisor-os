import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticTrackCState } from '../src/features/wave2a2-track-c/fixtures.ts';
import type {
  TrackCConfirmedEvent,
  TrackCState,
  TrackCWorkTarget,
} from '../src/features/wave2a2-track-c/model.ts';
import {
  confirmPhase2TrackBAssignmentProposal,
  createPhase2AdditionalScopeRecord,
  createPhase2TrackBAssignmentProposal,
  phase2AdditionalScopeBlocksBaseCompletion,
  projectPhase2AdditionalScopeActionBlockers,
  projectPhase2AdditionalScopeCompletion,
  projectPhase2TrackBAssignmentUnits,
  projectPhase2TrackBCrewDetail,
} from '../src/features/wave2a2-track-c/phase2-track-b/contracts.ts';

const confirmation = {
  recordedAt: '2026-07-29T16:05:00.000Z',
  recordedBy: 'Los',
  eventIdPrefix: 'phase2-track-b-confirmed',
  confirmed: true,
} as const;

const assignmentEvent = (
  id: string,
  target: TrackCWorkTarget,
  crewId: string,
): TrackCConfirmedEvent => ({
  id,
  eventType: 'assignment-confirmed',
  confirmation: 'confirmed',
  target,
  crewId,
  recordedAt: '2026-07-29T16:04:00.000Z',
  recordedBy: 'Synthetic test',
  sourceType: 'personal-confirmation',
  sourceLabel: 'Synthetic adversarial responsibility',
  summary: 'Synthetic confirmed responsibility.',
  personalRecordOnly: true,
  officialPaperChanged: false,
  payrollChanged: false,
});

test('normal assignment exposes only fully eligible released Units and keeps all released sections implicit', () => {
  const state = createSyntheticTrackCState();
  const paint = projectPhase2TrackBAssignmentUnits(state, 'paint');
  const eligiblePaint = paint.filter((option) => option.eligible);

  assert.deepEqual(
    eligiblePaint.map((option) => option.unit.unitNumber),
    ['707'],
  );
  assert.deepEqual(
    eligiblePaint
      .find((option) => option.unit.unitNumber === '707')
      ?.releasedTargets.map((target) => target.section),
    ['common', 'A', 'B'],
  );
  assert.equal(
    paint.find((option) => option.unit.unitNumber === '401')?.eligible,
    false,
    'A conflict on any applicable section must reject the entire Unit and trade.',
  );
  assert.match(
    paint
      .find((option) => option.unit.unitNumber === '401')
      ?.reasons.join(' ') ?? '',
    /conflicting paint responsibility/iu,
  );
  assert.equal(
    paint.find((option) => option.unit.unitNumber === '501')?.eligible,
    false,
    'A Unit with a restricted released section must not become a partial normal assignment.',
  );

  const proposal = createPhase2TrackBAssignmentProposal(state, {
    proposalId: 'phase2-normal-assignment',
    trade: 'paint',
    crewId: 'crew-bluebird-paint',
    unitIds: ['unit-707'],
    createdAt: '2026-07-29T16:00:00.000Z',
    createdBy: 'Los',
  });
  assert.equal(proposal.ok, true);
  if (!proposal.ok) return;
  assert.equal(proposal.value.sectionMode, 'all-released');
  assert.deepEqual(
    proposal.value.items.map((item) => item.target.section),
    ['common', 'A', 'B'],
  );
  assert.equal(proposal.value.items.every((item) => item.eligible), true);
});

test('Unit-level responsibility rejects the whole Paint or Clean Unit even when other released sections remain eligible', () => {
  const state = createSyntheticTrackCState();
  const paintConflictState: TrackCState = {
    ...state,
    events: [
      ...state.events,
      assignmentEvent(
        'phase2-paint-existing-responsibility',
        { unitId: 'unit-707', trade: 'paint', section: 'A' },
        'crew-bluebird-paint',
      ),
    ],
  };
  const cleanConflictState: TrackCState = {
    ...state,
    events: [
      ...state.events,
      assignmentEvent(
        'phase2-clean-existing-responsibility',
        { unitId: 'unit-707', trade: 'clean', section: 'common' },
        'crew-cedar-clean',
      ),
    ],
  };

  for (const [trade, conflictState, crewId] of [
    ['paint', paintConflictState, 'crew-atlas-paint'],
    ['clean', cleanConflictState, 'crew-bright-clean'],
  ] as const) {
    const option = projectPhase2TrackBAssignmentUnits(
      conflictState,
      trade,
    ).find((candidate) => candidate.unit.id === 'unit-707');
    assert.equal(option?.eligible, false, `${trade} Unit must fail closed.`);
    assert.match(option?.reasons.join(' ') ?? '', /already has confirmed/iu);

    const proposal = createPhase2TrackBAssignmentProposal(conflictState, {
      proposalId: `phase2-${trade}-whole-unit-conflict`,
      trade,
      crewId,
      unitIds: ['unit-707'],
      createdAt: '2026-07-29T16:05:00.000Z',
      createdBy: 'Los',
    });
    assert.equal(proposal.ok, false);
    assert.match(proposal.error, /already has confirmed/iu);
  }
});

test('normal assignment fails closed for trade mismatch, stale eligibility, and duplicate responsibility', () => {
  const state = createSyntheticTrackCState();
  const mismatch = createPhase2TrackBAssignmentProposal(state, {
    proposalId: 'phase2-trade-mismatch',
    trade: 'paint',
    crewId: 'crew-cedar-clean',
    unitIds: ['unit-707'],
    createdAt: '2026-07-29T16:00:00.000Z',
    createdBy: 'Los',
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /compatible paint crew/iu);

  const reviewed = createPhase2TrackBAssignmentProposal(state, {
    proposalId: 'phase2-stale-review',
    trade: 'paint',
    crewId: 'crew-bluebird-paint',
    unitIds: ['unit-707'],
    createdAt: '2026-07-29T16:00:00.000Z',
    createdBy: 'Los',
  });
  assert.equal(reviewed.ok, true);
  if (!reviewed.ok) return;

  const staleState: TrackCState = {
    ...state,
    units: state.units.map((unit) =>
      unit.id !== 'unit-707'
        ? unit
        : {
            ...unit,
            workFacts: unit.workFacts.map((fact) =>
              fact.trade === 'paint' && fact.section === 'B'
                ? {
                    ...fact,
                    access: 'occupied-restricted',
                    restrictionLabel: 'Synthetic restriction after review.',
                  }
                : fact,
            ),
          },
    ),
  };
  const stale = confirmPhase2TrackBAssignmentProposal(
    staleState,
    reviewed.value,
    confirmation,
  );
  assert.equal(stale.ok, false);
  assert.match(stale.error.message, /stale/iu);

  const first = confirmPhase2TrackBAssignmentProposal(
    state,
    reviewed.value,
    confirmation,
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const duplicate = createPhase2TrackBAssignmentProposal(first.value.state, {
    proposalId: 'phase2-duplicate-responsibility',
    trade: 'paint',
    crewId: 'crew-atlas-paint',
    unitIds: ['unit-707'],
    createdAt: '2026-07-29T16:06:00.000Z',
    createdBy: 'Los',
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /already responsible|eligible/iu);
});

test('final confirmation revalidates Unit-level responsibility outside the reviewed released sections', () => {
  const initial = createSyntheticTrackCState();
  const reviewState: TrackCState = {
    ...initial,
    units: initial.units.map((unit) =>
      unit.id !== 'unit-707'
        ? unit
        : {
            ...unit,
            workFacts: unit.workFacts.map((fact) =>
              fact.trade === 'paint' && fact.section === 'B'
                ? { ...fact, release: 'unreleased' }
                : fact,
            ),
          },
    ),
  };
  const reviewed = createPhase2TrackBAssignmentProposal(reviewState, {
    proposalId: 'phase2-hidden-section-final-revalidation',
    trade: 'paint',
    crewId: 'crew-bluebird-paint',
    unitIds: ['unit-707'],
    createdAt: '2026-07-29T16:00:00.000Z',
    createdBy: 'Los',
  });
  assert.equal(reviewed.ok, true);
  if (!reviewed.ok) return;
  assert.deepEqual(
    reviewed.value.items.map((item) => item.target.section),
    ['common', 'A'],
  );

  const changedState: TrackCState = {
    ...reviewState,
    events: [
      ...reviewState.events,
      assignmentEvent(
        'phase2-hidden-section-responsibility',
        { unitId: 'unit-707', trade: 'paint', section: 'B' },
        'crew-atlas-paint',
      ),
    ],
  };
  const confirmed = confirmPhase2TrackBAssignmentProposal(
    changedState,
    reviewed.value,
    confirmation,
  );
  assert.equal(confirmed.ok, false);
  assert.match(confirmed.error.message, /Unit-level responsibility changed/iu);
});

test('additional scope preserves source and uncertainty without pricing, approval, form submission, or section F', () => {
  const state = createSyntheticTrackCState();
  const result = createPhase2AdditionalScopeRecord(state, {
    id: 'scope-full-paint-707',
    unitId: 'unit-707',
    category: 'full-paint',
    description: 'Full paint requested after the original release.',
    sections: ['common', 'A'],
    sourceContact: 'Synthetic property contact — wording preserved',
    sourceConfidence: 'uncertain',
    occurredAt: '2026-07-29T11:15',
    recordedAt: '2026-07-29T16:15:00.000Z',
    requiredForBaseCompletion: false,
    changeOrderCandidate: 'uncertain',
    status: 'recorded',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.trade, 'paint');
  assert.deepEqual(result.value.sections, ['common', 'A']);
  assert.equal(
    result.value.sourceContact,
    'Synthetic property contact — wording preserved',
  );
  assert.equal(result.value.sourceConfidence, 'uncertain');
  assert.equal(result.value.status, 'recorded');
  assert.equal(result.value.personalRecordOnly, true);
  assert.equal(result.value.pricingCalculated, false);
  assert.equal(result.value.approvalGranted, false);
  assert.equal(result.value.officialFormSubmitted, false);
  assert.equal(phase2AdditionalScopeBlocksBaseCompletion(result.value), false);

  const invalidSection = createPhase2AdditionalScopeRecord(state, {
    ...result.value,
    id: 'scope-invalid-section',
    sections: ['F' as never],
  });
  assert.equal(invalidSection.ok, false);
  assert.match(invalidSection.error, /Common\/A-E/iu);

  const required = {
    ...result.value,
    id: 'scope-required',
    requiredForBaseCompletion: true,
  };
  assert.equal(phase2AdditionalScopeBlocksBaseCompletion(required), true);
  assert.equal(
    phase2AdditionalScopeBlocksBaseCompletion({
      ...required,
      status: 'reported-complete',
    }),
    false,
  );

  const completion = projectPhase2AdditionalScopeCompletion([
    result.value,
    required,
    { ...required, id: 'scope-required-complete', status: 'reported-complete' },
  ]);
  assert.deepEqual(completion, {
    blocked: true,
    optionalCount: 1,
    requiredCompleteCount: 1,
    requiredUnresolvedCount: 1,
  });
  assert.equal(
    projectPhase2AdditionalScopeCompletion([result.value]).blocked,
    false,
    'Optional scope must not block base completion.',
  );
  assert.equal(
    projectPhase2AdditionalScopeCompletion([
      { ...required, status: 'reported-complete' },
    ]).blocked,
    false,
    'A durably represented required scope reported complete can stop blocking.',
  );
});

test('required unfinished Additional Scope blocks only matching Los completion actions', () => {
  const state = createSyntheticTrackCState();
  const required = createPhase2AdditionalScopeRecord(state, {
    id: 'scope-required-unit-301-paint',
    unitId: 'unit-301',
    category: 'full-paint',
    description: 'Synthetic required full paint.',
    trade: 'paint',
    sections: ['B', 'C'],
    sourceContact: 'Synthetic property contact',
    sourceConfidence: 'confirmed',
    occurredAt: '2026-07-29T15:30:00.000Z',
    recordedAt: '2026-07-29T15:31:00.000Z',
    requiredForBaseCompletion: true,
    changeOrderCandidate: 'yes',
    status: 'in-progress',
  });
  assert.equal(required.ok, true);
  if (!required.ok) return;

  const optional = {
    ...required.value,
    id: 'scope-optional-unit-301-paint',
    requiredForBaseCompletion: false,
  };
  const complete = {
    ...required.value,
    id: 'scope-complete-unit-301-paint',
    status: 'reported-complete' as const,
  };
  const scopes = [required.value, optional, complete];
  const matchingTarget = {
    unitId: 'unit-301',
    trade: 'paint',
    section: 'B',
  } as const;

  for (const action of [
    'record-los-pass',
    'record-reinspection-pass',
  ] as const) {
    assert.deepEqual(
      projectPhase2AdditionalScopeActionBlockers(
        scopes,
        matchingTarget,
        action,
      ).map((scope) => scope.id),
      ['scope-required-unit-301-paint'],
    );
  }

  assert.deepEqual(
    projectPhase2AdditionalScopeActionBlockers(
      scopes,
      matchingTarget,
      'record-crew-complete',
    ),
    [],
    'Crew-reported completion remains separate evidence.',
  );
  assert.deepEqual(
    projectPhase2AdditionalScopeActionBlockers(
      scopes,
      { ...matchingTarget, trade: 'clean' },
      'record-los-pass',
    ),
    [],
  );
  assert.deepEqual(
    projectPhase2AdditionalScopeActionBlockers(
      scopes,
      { ...matchingTarget, section: 'A' },
      'record-los-pass',
    ),
    [],
  );
  assert.deepEqual(
    projectPhase2AdditionalScopeActionBlockers(
      scopes,
      { ...matchingTarget, unitId: 'unit-606' },
      'record-los-pass',
    ),
    [],
  );

  const unresolvedUnitWide = {
    ...required.value,
    id: 'scope-required-unit-wide',
    sections: [],
    trade: undefined,
  };
  assert.deepEqual(
    projectPhase2AdditionalScopeActionBlockers(
      [unresolvedUnitWide],
      { ...matchingTarget, trade: 'clean', section: 'common' },
      'record-los-pass',
    ).map((scope) => scope.id),
    ['scope-required-unit-wide'],
    'A required scope with unresolved trade/section applies conservatively across the Unit.',
  );
});

const confirmedEvent = (
  id: string,
  eventType: TrackCConfirmedEvent['eventType'],
  target: TrackCWorkTarget,
): TrackCConfirmedEvent => ({
  id,
  eventType,
  confirmation: 'confirmed',
  target,
  crewId: 'crew-bluebird-paint',
  recordedAt: `2026-07-29T16:${String(Number.parseInt(id, 10) % 60).padStart(2, '0')}:00.000Z`,
  recordedBy: 'Synthetic test',
  sourceType: 'personal-confirmation',
  sourceLabel: 'Synthetic confirmed Track B event',
  summary: `Synthetic ${eventType}`,
  personalRecordOnly: true,
  officialPaperChanged: false,
  payrollChanged: false,
});

test('Crew Detail derives assigned Units, open/resolved callbacks, inspection, acceptance, and activity from confirmed events only', () => {
  const initial = createSyntheticTrackCState();
  const target: TrackCWorkTarget = {
    unitId: 'unit-707',
    trade: 'paint',
    section: 'A',
  };
  const eventTypes: readonly TrackCConfirmedEvent['eventType'][] = [
    'assignment-confirmed',
    'work-started',
    'crew-reported-complete',
    'los-passed',
    'callback-opened',
    'callback-correction-reported',
    'callback-resolved',
  ];
  const state: TrackCState = {
    ...initial,
    events: [
      ...initial.events,
      ...eventTypes.map((eventType, index) =>
        confirmedEvent(`${index + 20}`, eventType, target),
      ),
      {
        ...confirmedEvent('99', 'callback-opened', {
          ...target,
          section: 'B',
        }),
        confirmation: 'draft',
      },
    ],
  };
  const detail = projectPhase2TrackBCrewDetail(
    state,
    'crew-bluebird-paint',
  );

  assert.ok(detail);
  assert.equal(detail.currentAssignedUnitIds.includes('unit-707'), true);
  assert.equal(
    detail.resolvedCallbackWork.some(
      (work) =>
        work.unitId === 'unit-707' &&
        work.trade === 'paint' &&
        work.section === 'A',
    ),
    true,
  );
  assert.ok(detail.stats.resolvedCallbacks >= 1);
  assert.equal(
    detail.recentActivity.some((event) => event.confirmation !== 'confirmed'),
    false,
  );
  assert.equal('ranking' in detail, false);
  assert.equal('blame' in detail, false);
  assert.equal('payrollAmount' in detail, false);
  assert.equal('paymentEligibility' in detail, false);
  assert.equal(
    detail.recentActivity.every((event) => event.payrollChanged === false),
    true,
  );
});
