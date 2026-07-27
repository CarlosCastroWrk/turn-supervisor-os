import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createGatewayIntelligenceProvider } from '../api/intelligence/gatewayProvider.ts';
import { createMockIntelligenceProvider } from '../src/features/turn-intelligence/mockProvider.ts';
import { createTurnIntelligenceService } from '../src/features/turn-intelligence/service.ts';
import { syntheticRequest } from './turn-intelligence-fixtures.ts';

test('gateway adapter is loudly disabled when no server credential is configured', async () => {
  const provider = createGatewayIntelligenceProvider({
    configured: false,
    readRuntime: {
      async read() {
        return {
          available: true,
          data: { synthetic: true },
          sourceIds: [],
          synthetic: true,
          authorization: 'none',
        };
      },
    },
  });
  const health = await provider.health();
  assert.equal(health.status, 'disabled');
  assert.match(health.detail, /server-side Gateway credential/i);

  const events = [];
  const service = createTurnIntelligenceService({ provider });
  for await (const event of service.stream(syntheticRequest('Draft a note.', { task: 'general_chat' }))) {
    events.push(event);
  }
  assert.equal(events.some((event) => event.type === 'error' && event.code === 'DISABLED'), true);
});

test('mock provider needs no credential and exposes synthetic identity and structured validation', async () => {
  const provider = createMockIntelligenceProvider();
  assert.equal(provider.identity.mode, 'mock');
  assert.match(provider.identity.modelId, /mock/);
  const request = syntheticRequest('Draft a note.', { task: 'general_chat' });
  const route = { tier: 'routine' as const, task: 'general_chat' as const, modelId: 'moonshotai/kimi-k2.6' as const, reason: 'test', deterministic: false };
  const output = await provider.structured({
    request,
    route,
    systemPrompt: 'Synthetic test prompt.',
    visuals: [],
  }, z.object({
    answer: z.string(),
    confidence: z.literal('mock'),
    warnings: z.array(z.string()),
  }));
  assert.equal(output.confidence, 'mock');
});
