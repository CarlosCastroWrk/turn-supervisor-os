import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticTrackCState } from '../src/features/wave2a2-track-c/fixtures.ts';
import type {
  TrackCConfirmedEvent,
  TrackCState,
  TrackCWorkTarget,
} from '../src/features/wave2a2-track-c/model.ts';
import { confirmTrackCBulkAssignmentProposal } from '../src/features/wave2a2-track-c/operations.ts';
import {
  createPhase2AdditionalScopeRecord,
  createPhase2TrackBAssignmentProposal,
  phase2AdditionalScopeBlocksBaseCompletion,
  projectPhase2TrackBAssignmentUnits,
  projectPhase2TrackBCrewDetail,
} from '../src/features/wave2a2-track-c/phase2-track-b/contracts.ts';

const confirmation = {
  recordedAt: '2026-07-29T16:05:00.000Z',
  recordedBy: 'Los',
  eventIdPrefix: 'phase2-track-b-confirmed',
  confirmed: true,
} as const;

test('normal assignment exposes only fully eligible released Units and keeps all released sections implicit', () => {
  const state = createSyntheticTrackCState();
  const paint = projectPhase2TrackBAssignmentUnits(state, 'paint');
  const eligiblePaint = paint.filter((option) => option.eligible);

  assert.deepEqual(
    eligiblePaint.map((option) => option.unit.unitNumber),
    ['401', '707'],
  );
  assert.deepEqual(
    eligiblePaint
      .find((option) => option.unit.unitNumber === '707')
      ?.releasedTargets.map((target) => target.section),
    ['common', 'A', 'B'],
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
  const stale = confirmTrackCBulkAssignmentProposal(
    staleState,
    reviewed.value,
    confirmation,
  );
  assert.equal(stale.ok, false);
  assert.match(stale.error.message, /stale/iu);

  const first = confirmTrackCBulkAssignmentProposal(
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
