export interface OperationalScope {
  readonly accountId: string;
  readonly projectId: string;
}

export interface ScopedRecord extends OperationalScope {
  readonly id: string;
}

export type OperationalTrade = 'paint' | 'clean';

export interface OperationalTarget {
  readonly unitId?: string;
  readonly trade?: OperationalTrade;
  readonly section?: string;
}

export type OperationalSourceKind =
  | 'personal-capture'
  | 'app-data-record'
  | 'source-document'
  | 'approved-knowledge'
  | 'operational-event';

export interface OperationalSourceReference {
  readonly kind: OperationalSourceKind;
  readonly id: string;
  readonly label: string;
  readonly excerpt?: string;
}

export const OPERATIONAL_EVENT_KINDS = [
  'note-recorded',
  'voice-transcript-recorded',
  'assignment-recorded',
  'crew-report-recorded',
  'inspection-recorded',
  'callback-recorded',
  'blocker-recorded',
  'property-walk-recorded',
  'import-recorded',
  'proposal-confirmed',
  'proposal-edited',
  'proposal-rejected',
  'undo-recorded',
  'reconciliation-recorded',
] as const;

export type OperationalEventKind = (typeof OPERATIONAL_EVENT_KINDS)[number];

export interface OperationalEventPayloadMap {
  readonly 'note-recorded': {
    readonly note: string;
  };
  readonly 'voice-transcript-recorded': {
    readonly transcript: string;
    readonly transcriptEdited: boolean;
  };
  readonly 'assignment-recorded': {
    readonly crewLabel: string;
    readonly episodeKind: 'initial' | 'added-scope' | 'reassignment' | 'callback' | 'cancellation';
  };
  readonly 'crew-report-recorded': {
    readonly crewLabel: string;
    readonly report: 'working' | 'crew-reported-complete';
  };
  readonly 'inspection-recorded': {
    readonly result: 'passed' | 'callback-required';
    readonly observation: string;
  };
  readonly 'callback-recorded': {
    readonly state: 'required' | 'correction-reported' | 'reinspection-pending' | 'cleared';
    readonly reason: string;
    readonly responsibleCrewLabel?: string;
  };
  readonly 'blocker-recorded': {
    readonly blockerKind: 'access' | 'maintenance' | 'assignment-conflict' | 'other';
    readonly state: 'opened' | 'resolved';
    readonly description: string;
    readonly ownerLabel?: string;
    readonly nextAction?: string;
  };
  readonly 'property-walk-recorded': {
    readonly outcome:
      | 'walk-pending'
      | 'property-accepted'
      | 'property-rejected'
      | 'walk-completed-without-result';
    readonly accountableSourceLabel: string;
  };
  readonly 'import-recorded': {
    readonly sourceDocumentId: string;
    readonly acceptedRecordCount: number;
    readonly rejectedRecordCount: number;
  };
  readonly 'proposal-confirmed': {
    readonly proposalId: string;
  };
  readonly 'proposal-edited': {
    readonly proposalId: string;
    readonly editSummary: string;
  };
  readonly 'proposal-rejected': {
    readonly proposalId: string;
    readonly reason?: string;
  };
  readonly 'undo-recorded': {
    readonly reversedEventId: string;
    readonly reason: string;
  };
  readonly 'reconciliation-recorded': {
    readonly state: 'needs-paper-review' | 'paper-reviewed';
    readonly note: string;
  };
}

interface OperationalEventBase<Kind extends OperationalEventKind> extends ScopedRecord {
  readonly kind: Kind;
  readonly target: OperationalTarget;
  readonly title: string;
  readonly wording: string;
  readonly recordedAt: string;
  readonly recordedBy: 'los' | 'crew-report' | 'property-contact' | 'system-projection';
  readonly authority: 'personal-turn-os-record-only';
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export type OperationalEvent<Kind extends OperationalEventKind = OperationalEventKind> =
  Kind extends OperationalEventKind
    ? OperationalEventBase<Kind> & { readonly payload: OperationalEventPayloadMap[Kind] }
    : never;

export interface ActivityItem extends OperationalScope {
  readonly id: string;
  readonly eventKind: OperationalEventKind;
  readonly unitId?: string;
  readonly trade?: OperationalTrade;
  readonly section?: string;
  readonly title: string;
  readonly wording: string;
  readonly recordedAt: string;
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface SourceDocumentRecord extends ScopedRecord {
  readonly sourceType: 'image' | 'file' | 'pasted-text' | 'manual-entry';
  readonly label: string;
  readonly rawContent: string;
  readonly contentDigest?: string;
  readonly untrustedInput: true;
  readonly status: 'active' | 'redacted' | 'superseded';
  readonly createdAt: string;
}

export interface ApprovedKnowledgeRecord extends ScopedRecord {
  readonly statement: string;
  readonly category: 'property' | 'workflow' | 'crew' | 'safety' | 'personal-preference';
  readonly approvedBy: 'los';
  readonly approvedAt: string;
  readonly active: boolean;
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface AIThreadRecord extends ScopedRecord {
  readonly contextKind: 'property' | 'unit' | 'trade-section' | 'general';
  readonly unitId?: string;
  readonly trade?: OperationalTrade;
  readonly section?: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AIMessageRecord extends ScopedRecord {
  readonly threadId: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly operationalTruth: false;
  readonly sourceRefs: readonly OperationalSourceReference[];
  readonly createdAt: string;
}

export type ProposalKind =
  | 'daily-goal'
  | 'note'
  | 'assignment'
  | 'crew-report'
  | 'inspection-result'
  | 'callback'
  | 'blocker'
  | 'property-walk'
  | 'spanish-message-draft'
  | 'tony-update-draft'
  | 'assignment-source-draft';

export interface ProposalRecord extends ScopedRecord {
  readonly kind: ProposalKind;
  readonly status: 'pending' | 'confirmed' | 'edited' | 'rejected' | 'applied' | 'failed' | 'undone';
  readonly target: OperationalTarget;
  readonly plainLanguage: string;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
  readonly sourceRefs: readonly OperationalSourceReference[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AIRunRecord extends ScopedRecord {
  readonly threadId?: string;
  readonly taskType: string;
  readonly provider: string;
  readonly model: string;
  readonly status: 'success' | 'failed' | 'cancelled';
  readonly sourceRefs: readonly OperationalSourceReference[];
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly latencyMs?: number;
  readonly errorCode?: string;
}

export interface AIUsageCostRecord extends ScopedRecord {
  readonly runId: string;
  readonly provider: string;
  readonly model: string;
  readonly taskType: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly recordedAt: string;
}

export interface ScopedReadRepository<RecordType extends ScopedRecord> {
  readonly list: (scope: OperationalScope) => readonly RecordType[];
  readonly get: (scope: OperationalScope, id: string) => RecordType | undefined;
}

export interface ScopedAppendRepository<RecordType extends ScopedRecord>
  extends ScopedReadRepository<RecordType> {
  readonly append: (scope: OperationalScope, record: RecordType) => RecordType;
}

export interface ScopedUpsertRepository<RecordType extends ScopedRecord>
  extends ScopedReadRepository<RecordType> {
  readonly upsert: (scope: OperationalScope, record: RecordType) => RecordType;
}

export interface OperationalMemoryRepositories {
  readonly events: ScopedAppendRepository<OperationalEvent>;
  readonly knowledge: ScopedUpsertRepository<ApprovedKnowledgeRecord>;
  readonly sources: ScopedUpsertRepository<SourceDocumentRecord>;
  readonly threads: ScopedUpsertRepository<AIThreadRecord>;
  readonly messages: ScopedAppendRepository<AIMessageRecord>;
  readonly proposals: ScopedUpsertRepository<ProposalRecord>;
  readonly runs: ScopedUpsertRepository<AIRunRecord>;
  readonly usage: ScopedAppendRepository<AIUsageCostRecord>;
}

export class OperationalScopeError extends Error {
  readonly code = 'operational-scope-mismatch' as const;

  constructor(message: string) {
    super(message);
    this.name = 'OperationalScopeError';
  }
}

export class OperationalGroundingError extends Error {
  readonly code = 'operational-source-grounding-missing' as const;

  constructor(message: string) {
    super(message);
    this.name = 'OperationalGroundingError';
  }
}

export const scopesEqual = (left: OperationalScope, right: OperationalScope) =>
  left.accountId === right.accountId && left.projectId === right.projectId;
