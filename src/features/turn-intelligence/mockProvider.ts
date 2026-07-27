import type { z } from 'zod';
import {
  MOCK_MODEL_ID,
  intelligenceDiagnosticsSchema,
  type IntelligenceStreamEvent,
  type ProviderRequest,
  type TurnIntelligenceProvider,
} from './contracts';
import { createPendingProposal } from './proposals';

const chunks = (text: string) => text.match(/.{1,34}(?:\s|$)/g) ?? [text];

const mockAnswer = (request: ProviderRequest) => {
  const context = request.request.context.unitNumber
    ? `Unit ${request.request.context.unitNumber}`
    : request.request.context.propertyName ?? 'the current field context';
  return `Mock response for ${context}. This preview can demonstrate streaming and proposals, but it is not using a live model or production records.`;
};

export const createMockIntelligenceProvider = (): TurnIntelligenceProvider => ({
  identity: {
    provider: 'turn-os-mock',
    modelId: MOCK_MODEL_ID,
    mode: 'mock',
    displayName: 'Synthetic mock intelligence',
  },
  async health() {
    return {
      status: 'available',
      checkedAt: new Date().toISOString(),
      detail: 'Synthetic mock provider is available. No external model is connected.',
    };
  },
  async *stream(providerRequest, signal) {
    const startedAt = performance.now();
    const request = providerRequest.request;
    const lastUserMessage = [...request.messages].reverse().find((message) => message.role === 'user');
    for (const text of chunks(mockAnswer(providerRequest))) {
      if (signal?.aborted) {
        yield { type: 'error', code: 'CANCELLED', message: 'Mock response was cancelled.', retryable: true };
        yield { type: 'done', cancelled: true };
        return;
      }
      yield { type: 'text-delta', text } satisfies IntelligenceStreamEvent;
      await Promise.resolve();
    }
    for (const source of request.sources) yield { type: 'source', source };

    const wantsProposal = /\b(propose|draft|note|message|update)\b/i.test(lastUserMessage?.content ?? '');
    if (wantsProposal && lastUserMessage) {
      yield {
        type: 'proposal',
        proposal: createPendingProposal({
          toolName: /spanish|español/i.test(lastUserMessage.content)
            ? 'draft_spanish_message'
            : 'propose_note',
          title: 'Editable mock proposal',
          exactSourceText: lastUserMessage.content,
          editableDraft: lastUserMessage.content,
          context: request.context,
          evidenceSourceIds: request.sources.map((source) => source.id),
        }),
      };
    }

    yield {
      type: 'diagnostics',
      diagnostics: intelligenceDiagnosticsSchema.parse({
        requestId: request.requestId,
        provider: this.identity,
        route: providerRequest.route,
        usage: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedCostUsd: 0,
          costSource: 'unknown',
        },
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        success: true,
        proposalOutcome: wantsProposal ? 'pending' : 'none',
        sourceCount: request.sources.length,
      }),
    };
    yield { type: 'done', cancelled: false };
  },
  async structured<T>(_request: ProviderRequest, schema: z.ZodType<T>) {
    return schema.parse({
      answer: 'Synthetic structured response.',
      confidence: 'mock',
      warnings: ['No live provider or production records were used.'],
    });
  },
});
