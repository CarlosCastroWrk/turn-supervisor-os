import type { ApprovedMemoryCandidate, MemoryApprovalStatus } from './contracts.js';

export type NewMemoryCandidate = Omit<
  ApprovedMemoryCandidate,
  'approvalStatus' | 'reviewedAt' | 'reviewedBy'
>;

const assertConfidence = (confidence: number) => {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RangeError('Memory candidate confidence must be between 0 and 1.');
  }
};

export const createMemoryCandidate = (input: NewMemoryCandidate): ApprovedMemoryCandidate => {
  assertConfidence(input.confidence);
  if (!input.statement.trim()) {
    throw new Error('Memory candidate statement is required.');
  }

  return {
    ...input,
    statement: input.statement.trim(),
    approvalStatus: 'pending',
  };
};

export const reviewMemoryCandidate = (
  candidate: ApprovedMemoryCandidate,
  decision: Exclude<MemoryApprovalStatus, 'pending'>,
  reviewedAt: string,
): ApprovedMemoryCandidate => {
  if (candidate.approvalStatus !== 'pending') {
    return candidate;
  }

  return {
    ...candidate,
    approvalStatus: decision,
    reviewedAt,
    reviewedBy: 'Los',
  };
};
