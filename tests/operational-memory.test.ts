import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  OperationalGroundingError,
  OperationalScopeError,
  assembleOperationalContext,
  createAppDataOperationalReadSource,
  createApprovedReadTools,
  createInMemoryOperationalMemoryRepositories,
  createOperationalActivityRepository,
  projectActivity,
  projectUnitHistory,
  type AIMessageRecord,
  type AIRunRecord,
  type AIThreadRecord,
  type AIUsageCostRecord,
  type ApprovedKnowledgeRecord,
  type OperationalEvent,
  type OperationalScope,
  type OperationalSourceReference,
  type ProposalRecord,
  type SourceDocumentRecord,
} from '../src/features/operational-memory/index.ts';
import type { AppData, Project, Unit } from '../src/types.ts';

const scope: OperationalScope = {
  accountId: 'account-synthetic-a',
  projectId: 'project-synthetic-memory',
};

const otherScope: OperationalScope = {
  accountId: 'account-synthetic-b',
  projectId: 'project-synthetic-memory',
};

const ref = (id: string, kind: OperationalSourceReference['kind'] = 'personal-capture'):
OperationalSourceReference => ({
  kind,
  id,
  label: `Synthetic source ${id}`,
});

const project = (): Project => ({
  id: scope.projectId,
  mode: 'demo',
  name: 'Synthetic operational memory project',
  propertyName: 'Synthetic Test Property',
  location: 'Synthetic location',
  startDate: '2026-07-20',
  endDate: '2026-08-10',
  supervisorName: 'Synthetic Supervisor',
  projectManagerName: 'Synthetic Manager',
  notes: '',
  estimatedBuildings: 1,
  estimatedUnits: 2,
  estimatedBeds: 4,
  estimatedCommonAreas: 2,
  aiBudgetUsd: 0,
  createdAt: '2026-07-20T08:00:00.000Z',
  updatedAt: '2026-07-20T08:00:00.000Z',
});

const unit = (id: string, unitNumber: string): Unit => ({
  id,
  projectId: scope.projectId,
  buildingId: 'building-synthetic-memory',
  floorId: 'floor-synthetic-memory',
  unitNumber,
  bedCount: 2,
  bathroomCount: 2,
  hasCommonArea: true,
  overallStatus: 'In Progress',
  paintStatus: 'In Progress',
  cleanStatus: 'Not Started',
  repairStatus: 'Not Applicable',
  flooringStatus: 'Not Applicable',
  trashStatus: 'Not Applicable',
  inspectionStatus: 'Not Started',
  assignedCrewIds: [],
  notes: '',
  createdAt: '2026-07-20T08:00:00.000Z',
  updatedAt: '2026-07-27T08:00:00.000Z',
});

const syntheticAppData = (): AppData => ({
  ...structuredClone(seedData),
  activeProjectId: scope.projectId,
  projects: [project(), { ...project(), id: 'project-other', name: 'Other synthetic project' }],
  buildings: [{
    id: 'building-synthetic-memory',
    projectId: scope.projectId,
    name: 'Synthetic Building',
    notes: '',
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
  }],
  floors: [{
    id: 'floor-synthetic-memory',
    buildingId: 'building-synthetic-memory',
    name: 'Synthetic Floor',
    notes: '',
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
  }],
  units: [
    unit('unit-synthetic-101', '101'),
    unit('unit-synthetic-202', '202'),
    { ...unit('unit-other-project', '999'), projectId: 'project-other' },
  ],
  crewMembers: [],
  assignments: [{
    id: 'assignment-synthetic-paint',
    projectId: scope.projectId,
    teamName: 'Synthetic Paint Crew',
    trade: 'Painter',
    unitIds: ['unit-synthetic-101'],
    scope: 'Synthetic whole-Unit assignment; section coverage is not recorded.',
    date: '2026-07-27',
    startTime: '08:00',
    expectedCompletion: '12:00',
    actualCompletion: '',
    status: 'In Progress',
    notes: '',
    createdAt: '2026-07-27T08:00:00.000Z',
    updatedAt: '2026-07-27T08:00:00.000Z',
  }],
  issues: [{
    id: 'issue-synthetic-access',
    projectId: scope.projectId,
    unitId: 'unit-synthetic-202',
    title: 'Synthetic access clarification needed',
    category: 'Access',
    priority: 'High',
    owner: 'Synthetic Owner',
    status: 'Open',
    dueAt: '',
    notes: '',
    resolutionNotes: '',
    createdAt: '2026-07-27T08:00:00.000Z',
    updatedAt: '2026-07-27T08:00:00.000Z',
  }],
  activityLogs: [{
    id: 'activity-synthetic-unit-note',
    projectId: scope.projectId,
    entityType: 'Unit',
    entityId: 'unit-synthetic-101',
    action: 'Recorded synthetic Unit note',
    note: 'Legacy personal Activity stays visibly sourced.',
    createdAt: '2026-07-27T08:30:00.000Z',
  }],
  memories: [{
    id: 'memory-synthetic-approved',
    projectId: scope.projectId,
    memoryType: 'Property Memory',
    content: 'Synthetic walkthrough reference is at noon.',
    source: 'Synthetic approved source',
    confidence: 1,
    approved: true,
    createdAt: '2026-07-26T08:00:00.000Z',
    updatedAt: '2026-07-26T08:00:00.000Z',
  }],
  copilotConversations: [{
    id: 'chat-synthetic-claim',
    projectId: scope.projectId,
    role: 'assistant',
    content: 'Unit 101 is property accepted.',
    supportingRecords: [],
    suggestedNextActions: [],
    createdAt: '2026-07-27T08:45:00.000Z',
  }],
});

const noteEvent = (id: string, unitId = 'unit-synthetic-101'): OperationalEvent<'note-recorded'> => ({
  id,
  ...scope,
  kind: 'note-recorded',
  target: { unitId },
  title: 'Synthetic note',
  wording: 'Synthetic operational wording.',
  recordedAt: '2026-07-27T09:00:00.000Z',
  recordedBy: 'los',
  authority: 'personal-turn-os-record-only',
  sourceRefs: [ref(`capture:${id}`)],
  payload: { note: 'Synthetic operational wording.' },
});

const readSourceFrom = (data = syntheticAppData()) => {
  const result = createAppDataOperationalReadSource(scope, data);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.error.message);
  return result.source;
};

test('AppData is injected read-only, project-scoped, and never falls back to fixtures', () => {
  const data = syntheticAppData();
  const before = structuredClone(data);
  const source = readSourceFrom(data);

  assert.equal(source.getPropertySummary().propertyName, 'Synthetic Test Property');
  assert.deepEqual(source.searchUnits('202').map((record) => record.unitNumber), ['202']);
  assert.equal(source.getUnit({ unitId: 'unit-synthetic-101' })?.statusBoundary,
    'legacy-whole-unit-personal-summary-not-section-truth');
  assert.throws(() => source.getUnit({ unitId: 'unit-other-project' }), OperationalScopeError);
  assert.deepEqual(data, before);

  data.issues = [];
  data.assignments = [];
  assert.equal(source.getPropertySummary().openIssueCount, 1);
  assert.equal(source.listCrewAssignments().length, 1);

  const unavailable = createAppDataOperationalReadSource(scope, {
    ...data,
    activeProjectId: 'missing-project',
  });
  assert.equal(unavailable.ok, false);
  assert.equal('source' in unavailable, false);
});

test('Activity and Unit history share event identity and cover proposal, undo, and reconciliation lifecycle', () => {
  const lifecycleEvents: OperationalEvent[] = [
    noteEvent('event-note'),
    {
      ...noteEvent('event-proposal-confirmed'),
      kind: 'proposal-confirmed',
      title: 'Proposal confirmed',
      payload: { proposalId: 'proposal-synthetic' },
    },
    {
      ...noteEvent('event-proposal-edited'),
      kind: 'proposal-edited',
      title: 'Proposal edited',
      payload: { proposalId: 'proposal-synthetic', editSummary: 'Synthetic edit' },
    },
    {
      ...noteEvent('event-proposal-rejected', 'unit-synthetic-202'),
      kind: 'proposal-rejected',
      title: 'Proposal rejected',
      payload: { proposalId: 'proposal-rejected', reason: 'Synthetic reason' },
    },
    {
      ...noteEvent('event-undo'),
      kind: 'undo-recorded',
      title: 'Undo recorded',
      payload: { reversedEventId: 'event-note', reason: 'Synthetic undo' },
    },
    {
      ...noteEvent('event-reconciliation'),
      kind: 'reconciliation-recorded',
      title: 'Paper review reminder updated',
      payload: { state: 'paper-reviewed', note: 'Personal reminder only.' },
    },
  ];
  const repositories = createInMemoryOperationalMemoryRepositories({ events: lifecycleEvents });
  const activityRepository = createOperationalActivityRepository(repositories.events);
  const activity = activityRepository.listActivity(scope);
  const unitHistory = activityRepository.listUnitHistory(scope, 'unit-synthetic-101');

  assert.deepEqual(
    new Set(activity.map((item) => item.eventKind)),
    new Set([
      'note-recorded',
      'proposal-confirmed',
      'proposal-edited',
      'proposal-rejected',
      'undo-recorded',
      'reconciliation-recorded',
    ]),
  );
  assert.deepEqual(
    unitHistory.map((item) => item.id),
    activity.filter((item) => item.unitId === 'unit-synthetic-101').map((item) => item.id),
  );
  assert.deepEqual(projectActivity(repositories.events, scope), activity);
  assert.deepEqual(projectUnitHistory(repositories.events, scope, 'unit-synthetic-101'), unitHistory);
});

test('scoped repositories allow the same ID in different scopes without cross-scope disclosure', () => {
  const sharedId = 'event-shared-id';
  const scopeAEvent = noteEvent(sharedId);
  const scopeBEvent: OperationalEvent = {
    ...noteEvent(sharedId),
    ...otherScope,
    wording: 'Synthetic wording for account B.',
  };
  const repositories = createInMemoryOperationalMemoryRepositories({
    events: [scopeAEvent, scopeBEvent],
  });
  const missingScope: OperationalScope = {
    accountId: 'account-synthetic-c',
    projectId: scope.projectId,
  };

  assert.equal(repositories.events.get(scope, sharedId)?.wording, scopeAEvent.wording);
  assert.equal(repositories.events.get(otherScope, sharedId)?.wording, scopeBEvent.wording);
  assert.deepEqual(repositories.events.list(scope).map((record) => record.wording), [scopeAEvent.wording]);
  assert.deepEqual(
    repositories.events.list(otherScope).map((record) => record.wording),
    [scopeBEvent.wording],
  );
  assert.equal(repositories.events.get(missingScope, sharedId), undefined);
});

test('scoped repository reads hide records that exist only in another scope', () => {
  const repositories = createInMemoryOperationalMemoryRepositories({ events: [noteEvent('event-scoped')] });

  assert.doesNotThrow(() => repositories.events.get(otherScope, 'event-scoped'));
  assert.equal(repositories.events.get(otherScope, 'event-scoped'), undefined);
  assert.deepEqual(repositories.events.list(otherScope), []);

  const source = readSourceFrom();
  const tools = createApprovedReadTools(scope, source, repositories);
  assert.throws(
    () => tools.get_property_summary({ scope: otherScope, input: {} }),
    OperationalScopeError,
  );
});

test('scoped repositories remain fail-closed for empty scopes and mismatched writes', () => {
  const repositories = createInMemoryOperationalMemoryRepositories();
  const emptyScope: OperationalScope = { accountId: '', projectId: '' };
  const mismatchedSource: SourceDocumentRecord = {
    ...otherScope,
    id: 'source-mismatched-scope',
    sourceType: 'manual-entry',
    label: 'Synthetic mismatched source',
    rawContent: 'Synthetic content.',
    untrustedInput: true,
    status: 'active',
    createdAt: '2026-07-27T08:00:00.000Z',
  };

  assert.throws(() => repositories.events.get(emptyScope, 'missing'), OperationalScopeError);
  assert.throws(() => repositories.events.list(emptyScope), OperationalScopeError);
  assert.throws(
    () => repositories.events.append(scope, { ...noteEvent('event-mismatched'), ...otherScope }),
    OperationalScopeError,
  );
  assert.throws(() => repositories.sources.upsert(scope, mismatchedSource), OperationalScopeError);
});

test('all approved read tools return deterministic, source-backed personal records', () => {
  const source = readSourceFrom();
  const events: OperationalEvent[] = [
    {
      ...noteEvent('event-crew-report'),
      kind: 'crew-report-recorded',
      target: { unitId: 'unit-synthetic-101', trade: 'paint', section: 'A' },
      payload: { crewLabel: 'Synthetic Paint Crew', report: 'crew-reported-complete' },
    },
    {
      ...noteEvent('event-inspection'),
      kind: 'inspection-recorded',
      target: { unitId: 'unit-synthetic-101', trade: 'paint', section: 'A' },
      payload: { result: 'passed', observation: 'Synthetic pass.' },
    },
    {
      ...noteEvent('event-callback'),
      kind: 'callback-recorded',
      target: { unitId: 'unit-synthetic-202', trade: 'clean', section: 'common' },
      payload: { state: 'required', reason: 'Synthetic callback.' },
    },
    {
      ...noteEvent('event-blocker'),
      kind: 'blocker-recorded',
      target: { unitId: 'unit-synthetic-202', trade: 'clean', section: 'A' },
      payload: {
        blockerKind: 'access',
        state: 'opened',
        description: 'Synthetic access blocker.',
        ownerLabel: 'Synthetic Owner',
      },
    },
    {
      ...noteEvent('event-walk-pending'),
      kind: 'property-walk-recorded',
      target: { unitId: 'unit-synthetic-101' },
      payload: { outcome: 'walk-pending', accountableSourceLabel: 'Synthetic Manager' },
    },
  ];
  const repositories = createInMemoryOperationalMemoryRepositories({ events });
  const tools = createApprovedReadTools(scope, source, repositories);

  assert.equal(tools.get_property_summary({ scope, input: {} }).unitCount, 2);
  assert.deepEqual(tools.search_units({ scope, input: { query: '202' } }).map((item) => item.unitNumber), ['202']);
  assert.equal(tools.get_unit({ scope, input: { unitNumber: '101' } })?.id, 'unit-synthetic-101');
  assert.equal(tools.get_unit_history({ scope, input: { unitId: 'unit-synthetic-101' } }).length, 4);
  assert.equal(tools.get_needs_me({ scope, input: {} }).length, 3);
  assert.deepEqual(tools.get_daily_progress({ scope, input: { date: '2026-07-27' } }).deterministicCounts, {
    crewReportedComplete: 1,
    losInspected: 1,
    readyForWalk: 1,
    propertyAccepted: 0,
  });
  assert.equal(tools.get_callbacks({ scope, input: {} })[0]?.state, 'required');
  assert.equal(tools.get_ready_for_walk({ scope, input: {} })[0]?.unitId, 'unit-synthetic-101');
  assert.equal(tools.get_crew_assignments({ scope, input: {} })[0]?.sectionCoverage, 'not-recorded-in-app-data');
  assert.equal(tools.get_approved_knowledge({ scope, input: { query: 'walkthrough' } }).length, 1);
});

test('context keeps raw chat separate from operational truth and validates source documents', () => {
  const document: SourceDocumentRecord = {
    ...scope,
    id: 'source-document-synthetic',
    sourceType: 'pasted-text',
    label: 'Synthetic source document',
    rawContent: 'Synthetic approved reference.',
    untrustedInput: true,
    status: 'active',
    createdAt: '2026-07-27T08:00:00.000Z',
  };
  const knowledge: ApprovedKnowledgeRecord = {
    ...scope,
    id: 'knowledge-synthetic',
    statement: 'Synthetic Paint reference is approved for personal use.',
    category: 'workflow',
    approvedBy: 'los',
    approvedAt: '2026-07-27T08:05:00.000Z',
    active: true,
    sourceRefs: [ref(document.id, 'source-document')],
  };
  const thread: AIThreadRecord = {
    ...scope,
    id: 'thread-synthetic',
    contextKind: 'unit',
    unitId: 'unit-synthetic-101',
    title: 'Synthetic Unit thread',
    createdAt: '2026-07-27T08:00:00.000Z',
    updatedAt: '2026-07-27T08:00:00.000Z',
  };
  const message: AIMessageRecord = {
    ...scope,
    id: 'message-synthetic',
    threadId: thread.id,
    role: 'assistant',
    content: 'Unit 101 is property accepted.',
    operationalTruth: false,
    sourceRefs: [],
    createdAt: '2026-07-27T08:10:00.000Z',
  };
  const repositories = createInMemoryOperationalMemoryRepositories({
    events: [noteEvent('event-context')],
    sources: [document],
    knowledge: [knowledge],
    threads: [thread],
    messages: [message],
  });
  const source = readSourceFrom();
  const tools = createApprovedReadTools(scope, source, repositories);
  const context = assembleOperationalContext({
    scope,
    question: 'What is the Synthetic Paint reference?',
    unitId: 'unit-synthetic-101',
    threadId: thread.id,
    tools,
    repositories,
  });

  assert.equal(context.conversationMessages[0]?.operationalTruth, false);
  assert.equal(context.conversationMessages[0]?.content, 'Unit 101 is property accepted.');
  assert.equal(context.operationalFacts.some((fact) => fact.text === message.content), false);
  assert.equal(context.operationalFacts.every((fact) => fact.sourceRefs.length > 0), true);
  assert.equal(context.sourceRefs.some((sourceRef) => sourceRef.id === document.id), true);

  const missingSourceRepositories = createInMemoryOperationalMemoryRepositories({ knowledge: [knowledge] });
  const missingSourceTools = createApprovedReadTools(scope, source, missingSourceRepositories);
  assert.throws(() => assembleOperationalContext({
    scope,
    question: 'Synthetic Paint reference',
    tools: missingSourceTools,
    repositories: missingSourceRepositories,
  }), OperationalGroundingError);
});

test('proposals, AI runs, usage, and chat remain separate local records with no implicit event', () => {
  const proposal: ProposalRecord = {
    ...scope,
    id: 'proposal-synthetic',
    kind: 'note',
    status: 'rejected',
    target: { unitId: 'unit-synthetic-101' },
    plainLanguage: 'Synthetic note proposal',
    proposedPayload: { note: 'Synthetic note' },
    sourceRefs: [ref('capture:proposal-synthetic')],
    createdAt: '2026-07-27T08:00:00.000Z',
    updatedAt: '2026-07-27T08:01:00.000Z',
  };
  const run: AIRunRecord = {
    ...scope,
    id: 'run-synthetic',
    taskType: 'synthetic-context-test',
    provider: 'mock',
    model: 'mock-model',
    status: 'success',
    sourceRefs: [ref('capture:proposal-synthetic')],
    startedAt: '2026-07-27T08:00:00.000Z',
    completedAt: '2026-07-27T08:00:01.000Z',
    latencyMs: 1000,
  };
  const usage: AIUsageCostRecord = {
    ...scope,
    id: 'usage-synthetic',
    runId: run.id,
    provider: run.provider,
    model: run.model,
    taskType: run.taskType,
    inputTokens: 10,
    outputTokens: 5,
    estimatedCostUsd: 0,
    recordedAt: '2026-07-27T08:00:01.000Z',
  };
  const repositories = createInMemoryOperationalMemoryRepositories({
    proposals: [proposal],
    runs: [run],
    usage: [usage],
  });

  assert.equal(repositories.proposals.list(scope)[0]?.status, 'rejected');
  assert.equal(repositories.runs.list(scope)[0]?.provider, 'mock');
  assert.equal(repositories.usage.list(scope)[0]?.estimatedCostUsd, 0);
  assert.deepEqual(repositories.events.list(scope), []);
});
