export interface IntegerDraftOptions {
  min?: number;
  max?: number;
  fallback?: number;
}

export const sanitizeIntegerDraft = (value: string) => value.replace(/[^\d]/g, '');

export const clampIntegerValue = (value: number, options: IntegerDraftOptions = {}) => {
  const min = options.min ?? 0;
  const max = options.max;
  const withMin = Math.max(min, value);
  return typeof max === 'number' ? Math.min(max, withMin) : withMin;
};

export const integerValueFromDraft = (draft: string, options: IntegerDraftOptions = {}) => {
  const sanitized = sanitizeIntegerDraft(draft);
  const fallback = options.fallback ?? options.min ?? 0;

  if (!sanitized) {
    return clampIntegerValue(fallback, options);
  }

  const parsed = Number.parseInt(sanitized, 10);
  return clampIntegerValue(Number.isFinite(parsed) ? parsed : fallback, options);
};

export const canonicalIntegerDraft = (draft: string, options: IntegerDraftOptions = {}) =>
  String(integerValueFromDraft(draft, options));
