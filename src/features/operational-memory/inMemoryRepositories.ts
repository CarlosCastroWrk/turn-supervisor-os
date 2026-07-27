import {
  OperationalGroundingError,
  OperationalScopeError,
  type AIMessageRecord,
  type AIRunRecord,
  type AIThreadRecord,
  type AIUsageCostRecord,
  type ApprovedKnowledgeRecord,
  type OperationalEvent,
  type OperationalMemoryRepositories,
  type OperationalScope,
  type ProposalRecord,
  type ScopedAppendRepository,
  type ScopedRecord,
  type ScopedUpsertRepository,
  type SourceDocumentRecord,
  scopesEqual,
} from './contracts';

export interface OperationalMemorySeed {
  readonly events?: readonly OperationalEvent[];
  readonly knowledge?: readonly ApprovedKnowledgeRecord[];
  readonly sources?: readonly SourceDocumentRecord[];
  readonly threads?: readonly AIThreadRecord[];
  readonly messages?: readonly AIMessageRecord[];
  readonly proposals?: readonly ProposalRecord[];
  readonly runs?: readonly AIRunRecord[];
  readonly usage?: readonly AIUsageCostRecord[];
}

const cloneAndFreeze = <Value>(value: Value): Value => {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return;
    for (const nested of Object.values(candidate as Record<string, unknown>)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
};

const assertScope = (expected: OperationalScope, actual: OperationalScope, label: string) => {
  if (!expected.accountId.trim() || !expected.projectId.trim()) {
    throw new OperationalScopeError(`${label} requires a non-empty account and project scope.`);
  }
  if (!scopesEqual(expected, actual)) {
    throw new OperationalScopeError(
      `${label} belongs to account ${actual.accountId} / project ${actual.projectId}, not the requested scope.`,
    );
  }
};

const scopedRecordKey = (scope: OperationalScope, id: string): string =>
  JSON.stringify([scope.accountId, scope.projectId, id]);

const assertGrounded = (record: ScopedRecord & { readonly sourceRefs?: readonly unknown[] }, label: string) => {
  const groundingRequired = new Set([
    'Operational event',
    'Approved knowledge',
    'Proposal',
    'AI run',
  ]).has(label);
  if (groundingRequired && (!record.sourceRefs || record.sourceRefs.length === 0)) {
    throw new OperationalGroundingError(`${label} ${record.id} requires at least one source reference.`);
  }
};

class InMemoryScopedRepository<RecordType extends ScopedRecord> {
  private readonly records = new Map<string, RecordType>();
  private readonly label: string;

  constructor(seed: readonly RecordType[], label: string) {
    this.label = label;
    for (const record of seed) {
      assertScope(record, record, label);
      const key = scopedRecordKey(record, record.id);
      if (this.records.has(key)) {
        throw new Error(`${label} seed contains duplicate ID ${record.id}.`);
      }
      assertGrounded(record, label);
      this.records.set(key, cloneAndFreeze(record));
    }
  }

  list(scope: OperationalScope): readonly RecordType[] {
    if (!scope.accountId.trim() || !scope.projectId.trim()) {
      throw new OperationalScopeError(`${this.label} requires a non-empty account and project scope.`);
    }
    return cloneAndFreeze(
      [...this.records.values()].filter((record) => scopesEqual(scope, record)),
    );
  }

  get(scope: OperationalScope, id: string): RecordType | undefined {
    assertScope(scope, scope, this.label);
    const record = this.records.get(scopedRecordKey(scope, id));
    if (!record) return undefined;
    assertScope(scope, record, `${this.label} record ${id}`);
    return cloneAndFreeze(record);
  }

  append(scope: OperationalScope, record: RecordType): RecordType {
    assertScope(scope, record, this.label);
    assertGrounded(record, this.label);
    const key = scopedRecordKey(scope, record.id);
    if (this.records.has(key)) {
      throw new Error(`${this.label} record ${record.id} already exists.`);
    }
    const stored = cloneAndFreeze(record);
    this.records.set(key, stored);
    return cloneAndFreeze(stored);
  }

  upsert(scope: OperationalScope, record: RecordType): RecordType {
    assertScope(scope, record, this.label);
    assertGrounded(record, this.label);
    const key = scopedRecordKey(scope, record.id);
    const existing = this.records.get(key);
    if (existing) assertScope(scope, existing, `${this.label} record ${record.id}`);
    const stored = cloneAndFreeze(record);
    this.records.set(key, stored);
    return cloneAndFreeze(stored);
  }
}

const appendRepository = <RecordType extends ScopedRecord>(
  seed: readonly RecordType[],
  label: string,
): ScopedAppendRepository<RecordType> => {
  const repository = new InMemoryScopedRepository(seed, label);
  return {
    list: (scope) => repository.list(scope),
    get: (scope, id) => repository.get(scope, id),
    append: (scope, record) => repository.append(scope, record),
  };
};

const upsertRepository = <RecordType extends ScopedRecord>(
  seed: readonly RecordType[],
  label: string,
): ScopedUpsertRepository<RecordType> => {
  const repository = new InMemoryScopedRepository(seed, label);
  return {
    list: (scope) => repository.list(scope),
    get: (scope, id) => repository.get(scope, id),
    upsert: (scope, record) => repository.upsert(scope, record),
  };
};

export const createInMemoryOperationalMemoryRepositories = (
  seed: OperationalMemorySeed = {},
): OperationalMemoryRepositories => ({
  events: appendRepository(seed.events ?? [], 'Operational event'),
  knowledge: upsertRepository(seed.knowledge ?? [], 'Approved knowledge'),
  sources: upsertRepository(seed.sources ?? [], 'Source document'),
  threads: upsertRepository(seed.threads ?? [], 'AI thread'),
  messages: appendRepository(seed.messages ?? [], 'AI message'),
  proposals: upsertRepository(seed.proposals ?? [], 'Proposal'),
  runs: upsertRepository(seed.runs ?? [], 'AI run'),
  usage: appendRepository(seed.usage ?? [], 'AI usage/cost'),
});
