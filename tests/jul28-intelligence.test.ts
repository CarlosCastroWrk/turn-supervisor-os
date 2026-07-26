import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerDeterministicTurnQuestion,
  buildPersonalActivitySummary,
  createMemoryCandidate,
  exportPersonalActivitySummary,
  projectActivityEvents,
  reviewMemoryCandidate,
  summarizeModelApiCosts,
  summarizeUsageLedger,
  syntheticPropertyScope,
  syntheticTurnContextSnapshot,
} from '../src/features/jul28-intelligence/index.ts';
import type {
  ModelApiCostReceipt,
  TurnContextSnapshot,
  UsageLedgerEvent,
} from '../src/features/jul28-intelligence/index.ts';

const cloneSnapshot = (): TurnContextSnapshot =>
  JSON.parse(JSON.stringify(syntheticTurnContextSnapshot)) as TurnContextSnapshot;

test('memory records remain pending until Los explicitly reviews them', () => {
  const candidate = createMemoryCandidate({
    id: 'memory-test',
    propertyScope: syntheticPropertyScope,
    statement: '  Keep Paint and Clean separate.  ',
    source: {
      kind: 'synthetic-fixture',
      label: 'Deterministic memory fixture',
      sourceDate: '2026-07-28',
      reference: 'fixture://memory-test',
    },
    confidence: 0.9,
    capturedAt: '2026-07-28T12:00:00.000Z',
  });

  assert.equal(candidate.statement, 'Keep Paint and Clean separate.');
  assert.equal(candidate.approvalStatus, 'pending');
  assert.equal(candidate.source.sourceDate, '2026-07-28');
  assert.equal(candidate.propertyScope.redactedRef, 'property-synthetic-01');

  const approved = reviewMemoryCandidate(candidate, 'approved', '2026-07-28T12:05:00.000Z');
  assert.equal(approved.approvalStatus, 'approved');
  assert.equal(approved.reviewedBy, 'Los');
  assert.equal(reviewMemoryCandidate(approved, 'rejected', '2026-07-28T12:06:00.000Z'), approved);
  assert.throws(
    () => createMemoryCandidate({ ...candidate, id: 'bad-confidence', confidence: 1.1 }),
    /between 0 and 1/,
  );
});

test('inspection answers require explicit crew completion and preserve access restrictions', () => {
  const result = answerDeterministicTurnQuestion(
    syntheticTurnContextSnapshot,
    'What needs my inspection?',
  );

  assert.equal(result.status, 'answered');
  if (result.status !== 'answered') return;
  assert.deepEqual(result.records.map((record) => `${record.unitRef}${record.section}-${record.trade}`), ['603C-Paint']);
  assert.deepEqual(result.records[0].facts, [
    { layer: 'crew-execution', value: 'crew-reported-complete' },
    { layer: 'los-inspection', value: 'inspection-pending' },
    { layer: 'access', value: 'occupied-or-restricted' },
  ]);
});

test('callbacks and property-walk readiness remain distinct explicit layers', () => {
  const callbacks = answerDeterministicTurnQuestion(syntheticTurnContextSnapshot, 'Which Units have callbacks?');
  assert.equal(callbacks.status, 'answered');
  if (callbacks.status !== 'answered') return;
  assert.deepEqual(callbacks.records.map((record) => `${record.unitRef}${record.section}-${record.trade}`), ['602A-Clean']);

  const walk = answerDeterministicTurnQuestion(
    syntheticTurnContextSnapshot,
    'Which Units are ready for a property walkthrough?',
  );
  assert.equal(walk.status, 'answered');
  if (walk.status !== 'answered') return;
  assert.deepEqual(walk.records.map((record) => `${record.unitRef}${record.section}-${record.trade}`), [
    '1305B-Paint',
    '1305B-Clean',
  ]);
  assert.equal(walk.records.some((record) => record.unitRef === '603'), false);
});

test('Unit history reports each authority layer without resolving the 604C conflict', () => {
  const snapshot = cloneSnapshot();
  snapshot.activityEvents.reverse();
  const result = answerDeterministicTurnQuestion(snapshot, 'What happened with Unit 604C?');

  assert.equal(result.status, 'answered');
  if (result.status !== 'answered') return;
  const current = result.records.find((record) => record.recordKind === 'current-scope');
  assert.ok(current);
  assert.equal(current.facts.some((fact) => fact.layer === 'authorization' && fact.value === 'assignment-conflict'), true);
  assert.equal(current.facts.some((fact) => fact.layer === 'access' && fact.value === 'occupied-or-restricted'), true);
  assert.equal(current.facts.some((fact) => fact.value === 'property-accepted'), false);
  assert.deepEqual(
    result.records
      .filter((record) => record.recordKind === 'activity-event')
      .map((record) => record.facts[0].value),
    ['assignment-released', 'assignment-conflict-recorded', 'access-restriction-recorded'],
  );
});

test('unsupported, missing-evidence, and payroll questions fail closed', () => {
  const unsupported = answerDeterministicTurnQuestion(syntheticTurnContextSnapshot, 'Who should I text right now?');
  assert.deepEqual(unsupported, {
    status: 'not-answered',
    reason: 'unsupported-question',
    message: 'This deterministic foundation does not support that question.',
  });

  const unknownUnit = answerDeterministicTurnQuestion(syntheticTurnContextSnapshot, 'What happened with Unit 999C?');
  assert.equal(unknownUnit.status, 'not-answered');
  if (unknownUnit.status === 'not-answered') assert.equal(unknownUnit.reason, 'insufficient-evidence');

  const empty = cloneSnapshot();
  empty.units = [];
  const noEvidence = answerDeterministicTurnQuestion(empty, 'What needs my inspection?');
  assert.equal(noEvidence.status, 'not-answered');
  if (noEvidence.status === 'not-answered') assert.equal(noEvidence.reason, 'insufficient-evidence');

  const payroll = answerDeterministicTurnQuestion(syntheticTurnContextSnapshot, 'What is payroll eligible?');
  assert.deepEqual(payroll, {
    status: 'not-answered',
    reason: 'payroll-unavailable',
    message: 'Payroll is unavailable and is never calculated or inferred from this snapshot.',
  });

  const accessSensitive = answerDeterministicTurnQuestion(
    syntheticTurnContextSnapshot,
    'Which Units are ready for my inspection?',
  );
  assert.equal(accessSensitive.status, 'not-answered');
  if (accessSensitive.status === 'not-answered') assert.equal(accessSensitive.reason, 'unsupported-question');
});

test('property acceptance never silently becomes paper reconciliation', () => {
  const snapshot = cloneSnapshot();
  const scope = snapshot.units.find((unit) => unit.unitRef === '603')?.scopes[0];
  assert.ok(scope);
  scope.propertyWalk = 'property-accepted';
  scope.paperReconciliation = 'needs-paper-review';

  const paper = answerDeterministicTurnQuestion(snapshot, 'What needs paper reconciliation?');
  assert.equal(paper.status, 'answered');
  if (paper.status !== 'answered') return;
  const record = paper.records.find((item) => item.unitRef === '603');
  assert.ok(record);
  assert.deepEqual(record.facts, [{ layer: 'paper-reconciliation', value: 'needs-paper-review' }]);
});

test('activity projection is stable, deduplicated, and authority-layered', () => {
  const duplicate = syntheticTurnContextSnapshot.activityEvents[0];
  const projection = projectActivityEvents([
    syntheticTurnContextSnapshot.activityEvents[2],
    duplicate,
    duplicate,
    syntheticTurnContextSnapshot.activityEvents[1],
  ]);

  assert.deepEqual(projection.timeline.map((event) => event.id), [
    'event-602-release',
    'event-602-added',
    'event-603-complete',
  ]);
  assert.equal(projection.countsByLayer.authorization, 2);
  assert.equal(projection.countsByLayer['crew-execution'], 1);
  assert.equal(projection.countsByLayer['property-walk'], 0);
});

test('usage metrics calculate capture methods, proposal outcomes, and confirm duration deterministically', () => {
  const events: UsageLedgerEvent[] = [
    { id: '1', propertyScopeRef: 'property-synthetic-01', captureId: 'c1', eventType: 'capture-started', method: 'typed', occurredAt: '2026-07-28T10:00:00.000Z' },
    { id: '2', propertyScopeRef: 'property-synthetic-01', captureId: 'c1', eventType: 'source-preserved', method: 'typed', occurredAt: '2026-07-28T10:00:00.500Z' },
    { id: '3', propertyScopeRef: 'property-synthetic-01', captureId: 'c1', eventType: 'proposal-created', proposalId: 'p1', occurredAt: '2026-07-28T10:00:01.000Z' },
    { id: '4', propertyScopeRef: 'property-synthetic-01', captureId: 'c1', eventType: 'proposal-resolved', proposalId: 'p1', outcome: 'confirmed', occurredAt: '2026-07-28T10:00:05.000Z' },
    { id: '5', propertyScopeRef: 'property-synthetic-01', captureId: 'c2', eventType: 'capture-started', method: 'browser-speech', occurredAt: '2026-07-28T10:01:00.000Z' },
    { id: '6', propertyScopeRef: 'property-synthetic-01', captureId: 'c2', eventType: 'proposal-created', proposalId: 'p2', occurredAt: '2026-07-28T10:01:01.000Z' },
    { id: '7', propertyScopeRef: 'property-synthetic-01', captureId: 'c2', eventType: 'proposal-resolved', proposalId: 'p2', outcome: 'edited-and-confirmed', occurredAt: '2026-07-28T10:01:11.000Z' },
    { id: '8', propertyScopeRef: 'property-synthetic-01', captureId: 'c3', eventType: 'capture-started', method: 'keyboard-dictation', occurredAt: '2026-07-28T10:02:00.000Z' },
    { id: '9', propertyScopeRef: 'property-synthetic-01', captureId: 'c3', eventType: 'proposal-created', proposalId: 'p3', occurredAt: '2026-07-28T10:02:01.000Z' },
    { id: '10', propertyScopeRef: 'property-synthetic-01', captureId: 'c4', eventType: 'capture-started', method: 'manual', occurredAt: '2026-07-28T10:03:00.000Z' },
    { id: '11', propertyScopeRef: 'property-synthetic-01', captureId: 'c4', eventType: 'proposal-created', proposalId: 'p4', occurredAt: '2026-07-28T10:03:01.000Z' },
    { id: '12', propertyScopeRef: 'property-synthetic-01', captureId: 'c4', eventType: 'proposal-resolved', proposalId: 'p4', outcome: 'rejected', occurredAt: '2026-07-28T10:03:05.000Z' },
    { id: '13', propertyScopeRef: 'property-synthetic-01', captureId: 'orphan', eventType: 'proposal-resolved', proposalId: 'orphan-proposal', outcome: 'rejected', occurredAt: '2026-07-28T10:04:00.000Z' },
    { id: '1', propertyScopeRef: 'property-synthetic-01', captureId: 'c1', eventType: 'capture-started', method: 'typed', occurredAt: '2026-07-28T10:00:00.000Z' },
  ];

  const summary = summarizeUsageLedger(events);
  assert.equal(summary.captureCount, 4);
  assert.deepEqual(summary.captureMethodCounts, {
    typed: 1,
    'browser-speech': 1,
    'keyboard-dictation': 1,
    attachment: 0,
    manual: 1,
  });
  assert.deepEqual(summary.captureToConfirm, {
    sampleCount: 2,
    averageMs: 8_000,
    medianMs: 8_000,
    minimumMs: 5_000,
    maximumMs: 11_000,
  });
  assert.deepEqual(summary.proposalOutcomes, {
    confirmed: 1,
    'edited-and-confirmed': 1,
    rejected: 1,
    ambiguous: 0,
    pending: 1,
  });
  assert.equal(summary.preservedSourceCount, 1);
  assert.equal(summary.orphanResolutionCount, 1);
});

test('model/API cost summary uses receipts only and does not select or call a model', () => {
  const receipts: ModelApiCostReceipt[] = [
    {
      id: 'cost-1',
      propertyScopeRef: 'property-synthetic-01',
      providerRef: 'provider-a',
      modelRef: 'model-a',
      inputUnits: 100,
      cachedInputUnits: 20,
      outputUnits: 40,
      occurredAt: '2026-07-28T10:00:00.000Z',
      costSource: 'provider-reported',
      totalCostUsd: 0.002,
      pricingVersion: 'provider-receipt',
    },
    {
      id: 'cost-2',
      propertyScopeRef: 'property-synthetic-01',
      providerRef: 'provider-b',
      modelRef: 'model-b',
      inputUnits: 50,
      cachedInputUnits: 0,
      outputUnits: 10,
      occurredAt: '2026-07-28T10:01:00.000Z',
      costSource: 'configured-estimate',
    },
  ];

  assert.deepEqual(summarizeModelApiCosts(receipts), {
    receiptCount: 2,
    pricedReceiptCount: 1,
    unpricedReceiptCount: 1,
    totalCostUsd: 0.002,
    inputUnits: 150,
    cachedInputUnits: 20,
    outputUnits: 50,
  });
});

test('personal activity export is redacted and keeps payroll unavailable', () => {
  const snapshot = cloneSnapshot();
  snapshot.activityEvents.push({
    ...snapshot.activityEvents[0],
    id: 'other-property-activity',
    propertyScopeRef: 'property-other',
  });
  snapshot.memoryCandidates.push({
    ...snapshot.memoryCandidates[0],
    id: 'other-property-memory',
    propertyScope: { ...snapshot.propertyScope, id: 'other-property', redactedRef: 'property-other' },
  });
  const usageEvents: UsageLedgerEvent[] = [
    {
      id: 'usage-current',
      propertyScopeRef: 'property-synthetic-01',
      captureId: 'capture-current',
      eventType: 'capture-started',
      method: 'typed',
      occurredAt: '2026-07-28T17:00:00.000Z',
    },
    {
      id: 'usage-other',
      propertyScopeRef: 'property-other',
      captureId: 'capture-other',
      eventType: 'capture-started',
      method: 'manual',
      occurredAt: '2026-07-28T17:01:00.000Z',
    },
  ];
  const costReceipts: ModelApiCostReceipt[] = [
    {
      id: 'cost-current',
      propertyScopeRef: 'property-synthetic-01',
      providerRef: 'provider-a',
      modelRef: 'model-a',
      inputUnits: 10,
      cachedInputUnits: 0,
      outputUnits: 5,
      occurredAt: '2026-07-28T17:00:00.000Z',
      costSource: 'provider-reported',
      totalCostUsd: 0.001,
    },
    {
      id: 'cost-other',
      propertyScopeRef: 'property-other',
      providerRef: 'provider-b',
      modelRef: 'model-b',
      inputUnits: 100,
      cachedInputUnits: 0,
      outputUnits: 50,
      occurredAt: '2026-07-28T17:01:00.000Z',
      costSource: 'provider-reported',
      totalCostUsd: 1,
    },
  ];
  const summary = buildPersonalActivitySummary(snapshot, usageEvents, costReceipts);
  const exported = exportPersonalActivitySummary(summary);

  assert.equal(summary.propertyScopeRef, 'property-synthetic-01');
  assert.equal(summary.memoryCandidateCounts.pending, 1);
  assert.equal(summary.usage.captureCount, 1);
  assert.equal(summary.modelApiCost.totalCostUsd, 0.001);
  assert.equal(summary.activityCounts.authorization, 4);
  assert.equal(summary.payroll.availability, 'unavailable-not-inferred');
  assert.match(exported, /official-paper-turnboard/);
  assert.doesNotMatch(exported, /Synthetic July 28 property/);
  assert.doesNotMatch(exported, /A property-walk result must be recorded manually/);
  assert.doesNotMatch(exported, /"unitRef"|"statement"|"phone"|"transcript"/);
});

test('synthetic fixtures stay inside Paint/Clean and Common plus A-E', () => {
  const allowedSections = new Set(['Common', 'A', 'B', 'C', 'D', 'E']);
  const allowedTrades = new Set(['Paint', 'Clean']);

  syntheticTurnContextSnapshot.units.forEach((unit) => {
    unit.applicableSections.forEach((section) => assert.equal(allowedSections.has(section), true));
    unit.scopes.forEach((scope) => assert.equal(allowedTrades.has(scope.trade), true));
  });
});
