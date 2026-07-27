import {
  intelligenceDiagnosticsSchema,
  turnIntelligenceRequestSchema,
  type IntelligenceStreamEvent,
  type ProviderVisualInput,
  type TurnIntelligenceClient,
  type TurnIntelligenceProvider,
  type TurnIntelligenceRequest,
} from './contracts';
import { buildTurnIntelligenceSystemPrompt } from './promptSecurity';
import {
  createDisabledDeterministicRuntime,
  routeTurnIntelligence,
  type DeterministicTurnRuntime,
} from './router';

interface TurnIntelligenceServiceOptions {
  provider: TurnIntelligenceProvider;
  deterministic?: DeterministicTurnRuntime;
  resolveVisuals?: (request: TurnIntelligenceRequest) => Promise<readonly ProviderVisualInput[]>;
}

export const createTurnIntelligenceService = (
  options: TurnIntelligenceServiceOptions,
): TurnIntelligenceClient => ({
  async *stream(input, signal) {
    const request = turnIntelligenceRequestSchema.parse(input);
    const route = routeTurnIntelligence(request);
    yield { type: 'route', decision: route } satisfies IntelligenceStreamEvent;

    if (route.tier === 'no-model') {
      const startedAt = performance.now();
      try {
        const result = await (options.deterministic ?? createDisabledDeterministicRuntime())
          .answer(route.task, request);
        yield { type: 'text-delta', text: result.text };
        for (const source of result.sources) yield { type: 'source', source };
        yield {
          type: 'diagnostics',
          diagnostics: intelligenceDiagnosticsSchema.parse({
            requestId: request.requestId,
            provider: {
              provider: 'turn-os-deterministic',
              modelId: 'none',
              mode: 'mock',
              displayName: 'Deterministic Turn OS rule',
            },
            route,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              estimatedCostUsd: 0,
              costSource: 'unknown',
            },
            latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
            success: true,
            proposalOutcome: 'none',
            sourceCount: result.sources.length,
          }),
        };
        yield { type: 'done', cancelled: false };
      } catch {
        yield {
          type: 'error',
          code: 'DISABLED',
          message: 'This deterministic answer needs the host field repository, which is not connected in Track C.',
          retryable: false,
        };
        yield { type: 'done', cancelled: false };
      }
      return;
    }

    const health = await options.provider.health();
    if (!['available', 'degraded'].includes(health.status)) {
      yield {
        type: 'error',
        code: health.status === 'disabled' ? 'DISABLED' : 'UNAVAILABLE',
        message: health.detail,
        retryable: health.status === 'unavailable',
      };
      yield { type: 'done', cancelled: false };
      return;
    }

    const visuals = await (options.resolveVisuals?.(request) ?? Promise.resolve([]));
    yield* options.provider.stream({
      request,
      route,
      systemPrompt: buildTurnIntelligenceSystemPrompt(request),
      visuals,
    }, signal);
  },
});
