import type {
  CaptureMethod,
  ModelApiCostReceipt,
  ProposalOutcome,
  UsageLedger,
  UsageLedgerEvent,
} from './contracts.js';

const CAPTURE_METHODS: CaptureMethod[] = [
  'typed',
  'browser-speech',
  'keyboard-dictation',
  'attachment',
  'manual',
];
const PROPOSAL_OUTCOMES: ProposalOutcome[] = ['confirmed', 'edited-and-confirmed', 'rejected', 'ambiguous'];

const eventTime = (occurredAt: string) => {
  const parsed = Date.parse(occurredAt);
  return Number.isFinite(parsed) ? parsed : null;
};

const round = (value: number, places = 4) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

export const createUsageLedger = (events: UsageLedgerEvent[]): UsageLedger => {
  const seenIds = new Set<string>();
  const entries = [...events]
    .sort((left, right) => {
      const leftTime = eventTime(left.occurredAt) ?? 0;
      const rightTime = eventTime(right.occurredAt) ?? 0;
      return leftTime - rightTime || left.id.localeCompare(right.id);
    })
    .filter((event) => {
      if (seenIds.has(event.id)) return false;
      seenIds.add(event.id);
      return true;
    });

  return { entries };
};

export interface DurationMetrics {
  sampleCount: number;
  averageMs: number;
  medianMs: number;
  minimumMs: number;
  maximumMs: number;
}

export interface UsageLedgerSummary {
  captureCount: number;
  preservedSourceCount: number;
  captureMethodCounts: Record<CaptureMethod, number>;
  captureToConfirm: DurationMetrics;
  proposalOutcomes: Record<ProposalOutcome | 'pending', number>;
  orphanResolutionCount: number;
}

const summarizeDurations = (durations: number[]): DurationMetrics => {
  if (durations.length === 0) {
    return { sampleCount: 0, averageMs: 0, medianMs: 0, minimumMs: 0, maximumMs: 0 };
  }

  const ordered = [...durations].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];

  return {
    sampleCount: ordered.length,
    averageMs: Math.round(ordered.reduce((sum, value) => sum + value, 0) / ordered.length),
    medianMs: Math.round(median),
    minimumMs: ordered[0],
    maximumMs: ordered[ordered.length - 1],
  };
};

export const summarizeUsageLedger = (events: UsageLedgerEvent[]): UsageLedgerSummary => {
  const ledger = createUsageLedger(events);
  const starts = new Map<string, Extract<UsageLedgerEvent, { eventType: 'capture-started' }>>();
  const preservedCaptures = new Set<string>();
  const createdProposals = new Set<string>();
  const resolvedProposals = new Map<string, Extract<UsageLedgerEvent, { eventType: 'proposal-resolved' }>>();

  ledger.entries.forEach((event) => {
    if (event.eventType === 'capture-started' && !starts.has(event.captureId)) {
      starts.set(event.captureId, event);
    } else if (event.eventType === 'source-preserved') {
      preservedCaptures.add(event.captureId);
    } else if (event.eventType === 'proposal-created') {
      createdProposals.add(event.proposalId);
    } else if (event.eventType === 'proposal-resolved' && !resolvedProposals.has(event.proposalId)) {
      resolvedProposals.set(event.proposalId, event);
    }
  });

  const captureMethodCounts = Object.fromEntries(CAPTURE_METHODS.map((method) => [method, 0])) as Record<
    CaptureMethod,
    number
  >;
  starts.forEach((event) => {
    captureMethodCounts[event.method] += 1;
  });

  const proposalOutcomes = Object.fromEntries([
    ...PROPOSAL_OUTCOMES.map((outcome) => [outcome, 0] as const),
    ['pending', 0] as const,
  ]) as Record<ProposalOutcome | 'pending', number>;
  let orphanResolutionCount = 0;
  const confirmDurations: number[] = [];

  resolvedProposals.forEach((resolution, proposalId) => {
    if (!createdProposals.has(proposalId)) {
      orphanResolutionCount += 1;
      return;
    }
    proposalOutcomes[resolution.outcome] += 1;

    if (resolution.outcome !== 'confirmed' && resolution.outcome !== 'edited-and-confirmed') return;
    const started = starts.get(resolution.captureId);
    const startedAt = started ? eventTime(started.occurredAt) : null;
    const resolvedAt = eventTime(resolution.occurredAt);
    if (startedAt === null || resolvedAt === null || resolvedAt < startedAt) return;
    confirmDurations.push(resolvedAt - startedAt);
  });

  proposalOutcomes.pending = [...createdProposals].filter((proposalId) => !resolvedProposals.has(proposalId)).length;

  return {
    captureCount: starts.size,
    preservedSourceCount: preservedCaptures.size,
    captureMethodCounts,
    captureToConfirm: summarizeDurations(confirmDurations),
    proposalOutcomes,
    orphanResolutionCount,
  };
};

export interface ModelApiCostSummary {
  receiptCount: number;
  pricedReceiptCount: number;
  unpricedReceiptCount: number;
  totalCostUsd: number;
  inputUnits: number;
  cachedInputUnits: number;
  outputUnits: number;
}

export const summarizeModelApiCosts = (receipts: ModelApiCostReceipt[]): ModelApiCostSummary => {
  const uniqueReceipts = [...new Map(receipts.map((receipt) => [receipt.id, receipt])).values()];
  const pricedReceipts = uniqueReceipts.filter(
    (receipt) => typeof receipt.totalCostUsd === 'number' && Number.isFinite(receipt.totalCostUsd) && receipt.totalCostUsd >= 0,
  );

  return {
    receiptCount: uniqueReceipts.length,
    pricedReceiptCount: pricedReceipts.length,
    unpricedReceiptCount: uniqueReceipts.length - pricedReceipts.length,
    totalCostUsd: round(pricedReceipts.reduce((sum, receipt) => sum + (receipt.totalCostUsd ?? 0), 0), 8),
    inputUnits: uniqueReceipts.reduce((sum, receipt) => sum + Math.max(0, receipt.inputUnits), 0),
    cachedInputUnits: uniqueReceipts.reduce((sum, receipt) => sum + Math.max(0, receipt.cachedInputUnits), 0),
    outputUnits: uniqueReceipts.reduce((sum, receipt) => sum + Math.max(0, receipt.outputUnits), 0),
  };
};
