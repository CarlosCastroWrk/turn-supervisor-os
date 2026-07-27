import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPLEX_MODEL_ID,
  ROUTINE_MODEL_ID,
  type TurnIntelligenceProvider,
} from '../src/features/turn-intelligence/contracts.ts';
import { createTurnIntelligenceService } from '../src/features/turn-intelligence/service.ts';
import { routeTurnIntelligence } from '../src/features/turn-intelligence/router.ts';
import { syntheticRequest } from './turn-intelligence-fixtures.ts';

test('router selects no model, routine K2.6, and complex K3 deterministically', () => {
  const noModel = routeTurnIntelligence(syntheticRequest('Count the synthetic Units.', { task: 'count' }));
  const routine = routeTurnIntelligence(syntheticRequest('Draft a Spanish note.', { task: 'spanish_draft' }));
  const complex = routeTurnIntelligence(syntheticRequest('Resolve conflicting evidence.', { task: 'conflict_analysis' }));

  assert.deepEqual(
    { tier: noModel.tier, modelId: noModel.modelId, deterministic: noModel.deterministic },
    { tier: 'no-model', modelId: null, deterministic: true },
  );
  assert.equal(routine.tier, 'routine');
  assert.equal(routine.modelId, ROUTINE_MODEL_ID);
  assert.equal(complex.tier, 'complex');
  assert.equal(complex.modelId, COMPLEX_MODEL_ID);
});

test('auto routing keeps deterministic counts model-free and escalates difficult visuals', () => {
  const count = routeTurnIntelligence(syntheticRequest('How many Units are ready for my walk?'));
  const difficultVisual = routeTurnIntelligence(syntheticRequest(
    'This image has conflicting marks and is hard to read.',
    { attachments: [{
      id: 'attachment-image',
      name: 'synthetic-board.jpg',
      kind: 'image',
      mediaType: 'image/jpeg',
      sizeBytes: 1_000,
      availability: 'reference-only',
    }] },
  ));
  assert.equal(count.tier, 'no-model');
  assert.equal(difficultVisual.tier, 'complex');
  assert.equal(difficultVisual.modelId, COMPLEX_MODEL_ID);
});

test('no-model tasks do not call provider health or stream', async () => {
  let providerCalls = 0;
  const provider: TurnIntelligenceProvider = {
    identity: { provider: 'test', modelId: ROUTINE_MODEL_ID, mode: 'mock', displayName: 'Test' },
    async health() {
      providerCalls += 1;
      return { status: 'available', checkedAt: new Date().toISOString(), detail: 'Test' };
    },
    async *stream() {
      providerCalls += 1;
      yield { type: 'done', cancelled: false };
    },
    async structured() {
      providerCalls += 1;
      throw new Error('Not expected');
    },
  };
  const client = createTurnIntelligenceService({
    provider,
    deterministic: {
      async answer() {
        return { text: '3 synthetic Units.', sources: [] };
      },
    },
  });
  const events = [];
  for await (const event of client.stream(syntheticRequest('Count Units.', { task: 'count' }))) {
    events.push(event);
  }
  assert.equal(providerCalls, 0);
  assert.equal(events.some((event) => event.type === 'text-delta'), true);
  assert.equal(events.some((event) => event.type === 'diagnostics' && event.diagnostics.usage.totalTokens === 0), true);
});
