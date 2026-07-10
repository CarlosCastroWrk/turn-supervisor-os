import type { AiModelClass, AiUsageEvent } from '../../types.js';
import type { AgentParseResult } from './types.js';

export const AI_PRICING_VERSION = '2026-07-10';
export const DEFAULT_TURN_AI_BUDGET_USD = 10;

interface ModelPricing {
  cachedInputPerMillion: number;
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface AiCostEstimate {
  cachedInputCostUsd: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-5.4-nano': {
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.25,
  },
  'gpt-5.4-mini': {
    inputPerMillion: 0.75,
    cachedInputPerMillion: 0.075,
    outputPerMillion: 4.5,
  },
  'gpt-5.4': {
    inputPerMillion: 2.5,
    cachedInputPerMillion: 0.25,
    outputPerMillion: 15,
  },
  'gpt-5.5': {
    inputPerMillion: 5,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 30,
  },
};

const roundUsd = (value: number) => Math.round(value * 100_000_000) / 100_000_000;

const pricingForModel = (model: string) => {
  const matchingId = Object.keys(MODEL_PRICING)
    .sort((left, right) => right.length - left.length)
    .find((id) => model === id || model.startsWith(`${id}-20`));
  return matchingId ? MODEL_PRICING[matchingId] : undefined;
};

export const estimateAiTextCost = (
  model: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): AiCostEstimate | null => {
  const pricing = pricingForModel(model);
  if (!pricing) return null;

  const safeInputTokens = Math.max(0, inputTokens);
  const safeCachedTokens = Math.min(safeInputTokens, Math.max(0, cachedInputTokens));
  const uncachedInputTokens = safeInputTokens - safeCachedTokens;
  const inputCostUsd = (uncachedInputTokens / 1_000_000) * pricing.inputPerMillion;
  const cachedInputCostUsd = (safeCachedTokens / 1_000_000) * pricing.cachedInputPerMillion;
  const outputCostUsd = (Math.max(0, outputTokens) / 1_000_000) * pricing.outputPerMillion;

  return {
    inputCostUsd: roundUsd(inputCostUsd),
    cachedInputCostUsd: roundUsd(cachedInputCostUsd),
    outputCostUsd: roundUsd(outputCostUsd),
    totalCostUsd: roundUsd(inputCostUsd + cachedInputCostUsd + outputCostUsd),
  };
};

export const formatAiUsd = (value: number) => {
  const safeValue = Math.max(0, value);
  if (safeValue === 0) return '$0.00';
  if (safeValue < 0.0001) return '<$0.0001';
  if (safeValue < 1) return `$${safeValue.toFixed(4)}`;
  return `$${safeValue.toFixed(2)}`;
};

export const aiUsageEventFromResult = (
  result: AgentParseResult,
  projectId: string,
  createdAt = new Date().toISOString(),
): AiUsageEvent | null => {
  const usage = result.usage;
  if (
    result.provider !== 'openai' ||
    !result.model ||
    !usage?.requestId ||
    typeof usage.estimatedCostUsd !== 'number'
  ) {
    return null;
  }

  return {
    id: `ai_usage_${usage.requestId}`,
    projectId,
    task: 'capture',
    model: result.model,
    modelClass: usage.modelClass ?? 'override',
    routeReason: usage.routeReason ?? 'Model selected by server policy.',
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    pricingVersion: usage.pricingVersion ?? AI_PRICING_VERSION,
    createdAt,
    updatedAt: createdAt,
  };
};

export const summarizeAiUsage = (events: AiUsageEvent[], budgetUsd: number) => {
  const totalCostUsd = roundUsd(events.reduce((sum, event) => sum + Math.max(0, event.estimatedCostUsd), 0));
  const safeBudgetUsd = Math.max(0, budgetUsd);
  const remainingUsd = roundUsd(Math.max(0, safeBudgetUsd - totalCostUsd));
  const averageCostUsd = events.length > 0 ? roundUsd(totalCostUsd / events.length) : 0;
  const percentUsed = safeBudgetUsd > 0
    ? Math.min(100, Math.round((totalCostUsd / safeBudgetUsd) * 10_000) / 100)
    : 0;
  const modelCounts = events.reduce<Partial<Record<AiModelClass, number>>>((counts, event) => {
    counts[event.modelClass] = (counts[event.modelClass] ?? 0) + 1;
    return counts;
  }, {});

  return {
    averageCostUsd,
    callCount: events.length,
    modelCounts,
    percentUsed,
    remainingUsd,
    totalCostUsd,
    totalTokens: events.reduce((sum, event) => sum + Math.max(0, event.totalTokens), 0),
  };
};
