import {
  Output,
  generateText,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
} from 'ai';
import type { z } from 'zod';
import {
  intelligenceDiagnosticsSchema,
  type IntelligenceSource,
  type ProviderIdentity,
  type ProviderRequest,
  type TurnIntelligenceProvider,
} from '../../src/features/turn-intelligence/contracts.js';
import { wrapUntrustedSourceForPrompt } from '../../src/features/turn-intelligence/promptSecurity.js';
import {
  PROPOSAL_TOOL_INPUTS,
  PROPOSAL_TOOL_NAMES,
  READ_TOOL_INPUTS,
  READ_TOOL_NAMES,
  TOOL_DESCRIPTIONS,
  executeProposalTool,
  executeReadTool,
  isProposalToolResult,
  type ReadToolRuntime,
} from '../../src/features/turn-intelligence/tools.js';

interface GatewayProviderOptions {
  configured: boolean;
  readRuntime: ReadToolRuntime;
  now?: () => number;
}

const gatewayIdentity = (modelId: string): ProviderIdentity => ({
  provider: 'vercel-ai-gateway',
  modelId,
  mode: 'gateway',
  displayName: 'Vercel AI Gateway',
});

const lastUserText = (request: ProviderRequest) =>
  [...request.request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';

const modelMessages = (request: ProviderRequest): ModelMessage[] => {
  const sources = request.request.sources.map(wrapUntrustedSourceForPrompt).join('\n\n');
  const history = request.request.messages.slice(0, -1).map((message): ModelMessage => ({
    role: message.role,
    content: message.content,
  }));
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: Uint8Array; mediaType: string }
  > = [{
    type: 'text',
    text: [lastUserText(request), sources ? `Reference material follows:\n${sources}` : ''].filter(Boolean).join('\n\n'),
  }];
  for (const visual of request.visuals) {
    content.push({ type: 'image', image: visual.data, mediaType: visual.mediaType });
  }
  history.push({ role: 'user', content });
  return history;
};

const createGatewayTools = (request: ProviderRequest, readRuntime: ReadToolRuntime) => {
  const readTools = Object.fromEntries(READ_TOOL_NAMES.map((name) => [name, tool({
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: READ_TOOL_INPUTS[name],
    execute: (input) => executeReadTool(readRuntime, name, input),
  })]));
  const proposalTools = Object.fromEntries(PROPOSAL_TOOL_NAMES.map((name) => [name, tool({
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: PROPOSAL_TOOL_INPUTS[name],
    execute: (input) => executeProposalTool(
      name,
      input,
      request.request.context,
      lastUserText(request),
    ),
  })]));
  return { ...readTools, ...proposalTools };
};

const sourceForProviderSource = (
  source: { id: string; title?: string; url?: string },
): IntelligenceSource => ({
  id: source.id,
  label: source.title ?? 'Provider citation',
  kind: 'record-reference',
  trust: 'untrusted',
  authorization: 'none',
  excerpt: source.url ? `Citation URL: ${source.url}` : undefined,
});

export const createGatewayIntelligenceProvider = (
  options: GatewayProviderOptions,
): TurnIntelligenceProvider => ({
  identity: gatewayIdentity('routed-by-turn-os'),
  async health() {
    return {
      status: options.configured ? 'available' : 'disabled',
      checkedAt: new Date().toISOString(),
      detail: options.configured
        ? 'Server-side Gateway credentials are configured.'
        : 'Gateway mode is disabled because no server-side Gateway credential is configured.',
    };
  },
  async *stream(providerRequest, signal) {
    if (!providerRequest.route.modelId) {
      yield { type: 'error', code: 'INVALID_OUTPUT', message: 'A Gateway route requires a model identity.', retryable: false };
      yield { type: 'done', cancelled: false };
      return;
    }
    const startedAt = (options.now ?? performance.now.bind(performance))();
    const identity = gatewayIdentity(providerRequest.route.modelId);
    const result = streamText({
      model: providerRequest.route.modelId,
      system: providerRequest.systemPrompt,
      messages: modelMessages(providerRequest),
      tools: createGatewayTools(providerRequest, options.readRuntime),
      stopWhen: stepCountIs(3),
      maxOutputTokens: 1_200,
      temperature: 0.2,
      maxRetries: 1,
      abortSignal: signal,
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta' && part.text) {
        yield { type: 'text-delta', text: part.text };
      } else if (part.type === 'source' && part.sourceType === 'url') {
        yield { type: 'source', source: sourceForProviderSource(part) };
      } else if (part.type === 'tool-result' && isProposalToolResult(part.output)) {
        yield { type: 'proposal', proposal: part.output.proposal };
      } else if (part.type === 'error') {
        yield {
          type: 'error',
          code: 'UNAVAILABLE',
          message: 'The model stream failed. No proposal or record was applied.',
          retryable: true,
        };
      } else if (part.type === 'abort') {
        yield { type: 'error', code: 'CANCELLED', message: 'The model stream was cancelled.', retryable: true };
      } else if (part.type === 'finish') {
        const total = part.totalUsage.inputTokens === undefined || part.totalUsage.outputTokens === undefined
          ? null
          : part.totalUsage.inputTokens + part.totalUsage.outputTokens;
        yield {
          type: 'diagnostics',
          diagnostics: intelligenceDiagnosticsSchema.parse({
            requestId: providerRequest.request.requestId,
            provider: identity,
            route: providerRequest.route,
            usage: {
              inputTokens: part.totalUsage.inputTokens ?? null,
              outputTokens: part.totalUsage.outputTokens ?? null,
              totalTokens: total,
              estimatedCostUsd: null,
              costSource: 'unknown',
            },
            latencyMs: Math.max(0, Math.round((options.now ?? performance.now.bind(performance))() - startedAt)),
            success: true,
            proposalOutcome: 'none',
            sourceCount: providerRequest.request.sources.length,
          }),
        };
      }
    }
    yield { type: 'done', cancelled: signal?.aborted ?? false };
  },
  async structured<T>(providerRequest: ProviderRequest, schema: z.ZodType<T>, signal?: AbortSignal) {
    if (!providerRequest.route.modelId) throw new Error('A Gateway route requires a model identity.');
    const result = await generateText({
      model: providerRequest.route.modelId,
      system: providerRequest.systemPrompt,
      messages: modelMessages(providerRequest),
      output: Output.object({ schema }),
      maxOutputTokens: 1_200,
      temperature: 0.1,
      maxRetries: 1,
      abortSignal: signal,
    });
    return schema.parse(result.output);
  },
});
