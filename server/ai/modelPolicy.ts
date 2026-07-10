import type { ModelCaptureRequest } from '../../src/lib/ai/modelCapture.js';
import type { AiModelClass } from '../../src/types.js';
import { CaptureRouteError } from './captureHandler.js';

const DEFAULT_FAST_MODEL = 'gpt-5.4-nano';
const DEFAULT_COMPLEX_MODEL = 'gpt-5.4-mini';
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,80}$/i;

export interface CaptureModelSelection {
  model: string;
  modelClass: AiModelClass;
  maxOutputTokens: number;
  reasoningEffort: 'none' | 'low';
  routeReason: string;
}

const configuredModel = (value: string | undefined, fallback: string) => {
  const model = value?.trim() || fallback;
  if (!MODEL_ID_PATTERN.test(model)) {
    throw new CaptureRouteError(503, 'SERVER_CONFIG', 'Secure AI assist is not configured.');
  }
  return model;
};

const mentionedNumericUnits = (input: string) =>
  Array.from(new Set(Array.from(input.matchAll(/\b(?:unit\s*#?\s*)?(\d{3,4})\b/gi), (match) => match[1])));

const actionSegmentCount = (input: string) =>
  input
    .split(/(?:[.;\n]+|\b(?:and then|then|also)\b)/i)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 4).length;

const workflowDomainCount = (input: string) => {
  const domains = [
    /\b(?:done|complete|ready|blocked|started|progress|inspection|paint|cleaning)\b/i,
    /\b(?:leak(?:s|ing|y)?|broken|missing|damage|issue|repair|keys?|access|material)\b/i,
    /\b(?:move|moved|assign|reassign|crew|team|painter|cleaner)\b/i,
    /\b(?:ask|call|confirm|follow[ -]?up|check with|remind)\b/i,
  ];
  return domains.filter((domain) => domain.test(input)).length;
};

const complexRouteReason = (request: ModelCaptureRequest) => {
  const input = request.input;
  const knownUnits = new Set(request.referencedUnits.map((unit) => unit.unitNumber));
  const unknownNumericUnit = mentionedNumericUnits(input).some((unitNumber) => !knownUnits.has(unitNumber));

  if (/\[Attached (?:file|note):/i.test(input)) return 'Attachment context needs stronger extraction.';
  if (input.length > 700) return 'Long field capture needs stronger extraction.';
  if (request.referencedUnits.length >= 3) return 'Multi-unit capture needs stronger separation.';
  if (actionSegmentCount(input) >= 4) return 'Multi-action capture needs stronger separation.';
  if (workflowDomainCount(input) >= 3) return 'Capture spans several workflow types.';
  if (unknownNumericUnit) return 'Unconfirmed Unit reference needs cautious interpretation.';
  if (/\b(?:maybe|probably|not sure|i think|might|unclear|could be)\b/i.test(input)) {
    return 'Ambiguous field language needs stronger interpretation.';
  }
  if (/\b(?:ready|done|final inspection|inspection passed|safety|fire|gas|electrical|flood)\b/i.test(input)) {
    return 'High-consequence status language needs stronger validation.';
  }
  return null;
};

export const selectCaptureModel = (
  request: ModelCaptureRequest,
  env: NodeJS.ProcessEnv = process.env,
): CaptureModelSelection => {
  if (env.OPENAI_MODEL?.trim()) {
    return {
      model: configuredModel(env.OPENAI_MODEL, DEFAULT_COMPLEX_MODEL),
      modelClass: 'override',
      maxOutputTokens: 3_000,
      reasoningEffort: 'low',
      routeReason: 'Server model override is active.',
    };
  }

  const complexReason = complexRouteReason(request);
  if (complexReason) {
    return {
      model: configuredModel(env.OPENAI_CAPTURE_COMPLEX_MODEL, DEFAULT_COMPLEX_MODEL),
      modelClass: 'complex',
      maxOutputTokens: 3_000,
      reasoningEffort: 'low',
      routeReason: complexReason,
    };
  }

  return {
    model: configuredModel(env.OPENAI_CAPTURE_FAST_MODEL, DEFAULT_FAST_MODEL),
    modelClass: 'fast',
    maxOutputTokens: 1_600,
    reasoningEffort: 'none',
    routeReason: 'Focused capture uses the lowest-cost capable model.',
  };
};
