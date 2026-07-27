import {
  healthReceiptSchema,
  type HealthReceipt,
  type TurnIntelligenceProvider,
} from './contracts';

export const unavailableHealth = (detail: string): HealthReceipt => healthReceiptSchema.parse({
  status: 'unavailable',
  checkedAt: new Date().toISOString(),
  detail,
});

export const createUnavailableProvider = (detail: string): TurnIntelligenceProvider => ({
  identity: {
    provider: 'none',
    modelId: 'none',
    mode: 'unavailable',
    displayName: 'Turn intelligence unavailable',
  },
  async health() {
    return unavailableHealth(detail);
  },
  async *stream() {
    yield { type: 'error', code: 'UNAVAILABLE', message: detail, retryable: false };
    yield { type: 'done', cancelled: false };
  },
  async structured<T>(): Promise<T> {
    throw new Error(detail);
  },
});
