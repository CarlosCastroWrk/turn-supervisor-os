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
  mismatchedResolutionCount: number;
}

const captureKey = (event: Pick<UsageLedgerEvent, 'propertyScopeRef' | 'captureId'>) =>
  JSON.stringify([event.propertyScopeRef, event.captureId]);

const proposalKey = (
  event: Pick<UsageLedgerEvent, 'propertyScopeRef' | 'captureId'> & { proposalId: string },
) => JSON.stringify([event.propertyScopeRef, event.captureId, event.proposalId]);

const proposalIdentityKey = (
  event: Pick<UsageLedgerEvent, 'propertyScopeRef'> & { proposalId: string },
) => JSON.stringify([event.propertyScopeRef, event.proposalId]);

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
  const createdProposals = new Map<string, Extract<UsageLedgerEvent, { eventType: 'proposal-created' }>>();
  const createdCapturesByProposal = new Map<string, Set<string>>();
  const resolvedProposals = new Map<string, Extract<UsageLedgerEvent, { eventType: 'proposal-resolved' }>>();

  ledger.entries.forEach((event) => {
    if (event.eventType === 'capture-started' && !starts.has(captureKey(event))) {
      starts.set(captureKey(event), event);
    } else if (event.eventType === 'source-preserved') {
      preservedCaptures.add(captureKey(event));
    } else if (event.eventType === 'proposal-created') {
      const key = proposalKey(event);
      if (!createdProposals.has(key)) createdProposals.set(key, event);
      const identityKey = proposalIdentityKey(event);
      const captures = createdCapturesByProposal.get(identityKey) ?? new Set<string>();
      captures.add(event.captureId);
      createdCapturesByProposal.set(identityKey, captures);
    } else if (event.eventType === 'proposal-resolved' && !resolvedProposals.has(proposalKey(event))) {
      resolvedProposals.set(proposalKey(event), event);
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
  let mismatchedResolutionCount = 0;
  const confirmDurations: number[] = [];

  resolvedProposals.forEach((resolution, key) => {
    const creation = createdProposals.get(key);
    if (!creation) {
      const knownCaptures = createdCapturesByProposal.get(proposalIdentityKey(resolution));
      if (knownCaptures?.size) mismatchedResolutionCount += 1;
      else orphanResolutionCount += 1;
      return;
    }
    proposalOutcomes[resolution.outcome] += 1;

    if (resolution.outcome !== 'confirmed' && resolution.outcome !== 'edited-and-confirmed') return;
    const started = starts.get(captureKey(creation));
    const startedAt = started ? eventTime(started.occurredAt) : null;
    const resolvedAt = eventTime(resolution.occurredAt);
    if (startedAt === null || resolvedAt === null || resolvedAt < startedAt) return;
    confirmDurations.push(resolvedAt - startedAt);
  });

  proposalOutcomes.pending = [...createdProposals.keys()].filter((key) => !resolvedProposals.has(key)).length;

  return {
    captureCount: starts.size,
    preservedSourceCount: preservedCaptures.size,
    captureMethodCounts,
    captureToConfirm: summarizeDurations(confirmDurations),
    proposalOutcomes,
    orphanResolutionCount,
    mismatchedResolutionCount,
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
