import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchRemoteData,
  mergeRemoteData,
  remoteActivityPullLimit,
  remotePullPageSize,
  remoteUploadBatchSize,
  replaceRemoteData,
  syncedTables,
  uploadLocalData,
} from '../src/lib/supabase/sync.ts';
import { buildDailyLogId, createEmptyDailyLog } from '../src/lib/dailyLogs.ts';
import type { AiUsageEvent, AppData, DailyLog, Memory, MemoryCandidate, PhotoNote, Project, ReportDocumentDraft, Unit } from '../src/types.ts';

type RemoteRow = Record<string, unknown>;
type OrderCall = { ascending: boolean; column: string; table: string };
type RangeCall = { from: number; table: string; to: number };
type UpsertCall = { rows: RemoteRow[]; table: string };

interface FakeSelectQuery {
  order: (column: string, options?: { ascending?: boolean }) => FakeSelectQuery;
  range: (from: number, to: number) => Promise<{ data: RemoteRow[]; error: null }>;
}

const stamp = '2026-07-08T12:00:00.000Z';

const project = (updatedAt = stamp): Project => ({
  id: 'project_sync_pull',
  mode: 'real',
  name: 'Sync Pull QA',
  propertyName: 'West Campus Turn QA',
  location: 'Austin, TX',
  startDate: '2026-07-08',
  endDate: '2026-07-22',
  supervisorName: 'Los',
  projectManagerName: 'Tony',
  notes: '',
  estimatedBuildings: 1,
  estimatedUnits: 1,
  estimatedBeds: 2,
  estimatedCommonAreas: 0,
  aiBudgetUsd: 10,
  createdAt: stamp,
  updatedAt,
});

const unit = (updatedAt = stamp, notes = 'local stale note'): Unit => ({
  id: 'unit_sync_pull_104',
  projectId: 'project_sync_pull',
  buildingId: '',
  floorId: '',
  unitNumber: '104',
  bedCount: 2,
  bathroomCount: 1,
  hasCommonArea: false,
  overallStatus: 'Not Started',
  paintStatus: 'Not Started',
  cleanStatus: 'Not Started',
  repairStatus: 'Not Started',
  flooringStatus: 'Not Applicable',
  trashStatus: 'Not Started',
  inspectionStatus: 'Not Started',
  assignedCrewIds: [],
  notes,
  createdAt: stamp,
  updatedAt,
});

const reportDraft = (updatedAt = stamp): ReportDocumentDraft => ({
  id: 'project_sync_pull:2026-07-08',
  projectId: 'project_sync_pull',
  date: '2026-07-08',
  title: 'Edited Turn Report',
  titleEdited: true,
  summary: 'Edited report summary',
  summaryEdited: true,
  sections: [
    {
      title: 'Open Issues',
      subtitle: 'Needs attention',
      body: 'Unit 203 waiting on paint',
      bodyEdited: true,
    },
  ],
  createdAt: stamp,
  updatedAt,
});

const dailyLog = (id: string, updatedAt: string, completedSummary: string): DailyLog => ({
  ...createEmptyDailyLog('project_sync_pull', '2026-07-08', stamp),
  id,
  completedSummary,
  updatedAt,
});

const photoNote = (storagePath = `${userId}/photo_sync_pull.jpg`): PhotoNote => ({
  id: 'photo_sync_pull',
  projectId: 'project_sync_pull',
  unitId: 'unit_sync_pull_104',
  storagePath,
  category: 'Problem',
  caption: 'Cloud photo path QA',
  createdAt: stamp,
  updatedAt: stamp,
});

const memory = (): Memory => ({
  id: 'memory_sync_pull',
  projectId: 'project_sync_pull',
  memoryType: 'Crew Memory',
  content: 'Jose crew handles paint.',
  source: 'Capture QA',
  sourceEntityId: 'unit_sync_pull_104',
  confidence: 0.88,
  approved: true,
  createdAt: stamp,
  updatedAt: stamp,
});

const memoryCandidate = (id = 'candidate_sync_pull', projectId: string | undefined = 'project_sync_pull'): MemoryCandidate => ({
  id,
  projectId,
  memoryType: 'Lesson Learned',
  content: 'Blocked units need an owner.',
  source: 'Capture QA',
  sourceEntityId: 'unit_sync_pull_104',
  confidence: 0.82,
  status: 'pending',
  createdAt: stamp,
  updatedAt: stamp,
});

const aiUsageEvent = (): AiUsageEvent => ({
  id: 'ai_usage_sync_pull',
  projectId: 'project_sync_pull',
  task: 'capture',
  model: 'gpt-5.4-mini',
  modelClass: 'complex',
  routeReason: 'Capture spans several workflow types.',
  inputTokens: 1_015,
  cachedInputTokens: 100,
  outputTokens: 569,
  totalTokens: 1_584,
  estimatedCostUsd: 0.00324675,
  pricingVersion: '2026-07-10',
  createdAt: stamp,
  updatedAt: stamp,
});

const userId = '123e4567-e89b-42d3-a456-426614174000';

const appData = (localProject = project(), localUnit = unit()): AppData => ({
  activeProjectId: localProject.id,
  projects: [localProject],
  buildings: [],
  floors: [],
  units: [localUnit],
  crewMembers: [],
  assignments: [],
  issues: [],
  photoNotes: [],
  dailyLogs: [],
  reportDrafts: [],
  trainingQuestions: [],
  activityLogs: [],
  draftActions: [],
  memories: [],
  memoryCandidates: [],
  agentRuns: [],
  aiUsageEvents: [],
  copilotConversations: [],
  followUpTasks: [],
  smartSuggestions: [],
  configurableStatuses: [],
});

const projectRow = (updatedAt = stamp): RemoteRow => ({
  id: 'project_sync_pull',
  project_mode: 'real',
  name: 'Sync Pull QA',
  property_name: 'West Campus Turn QA',
  location: 'Austin, TX',
  start_date: '2026-07-08',
  end_date: '2026-07-22',
  supervisor_name: 'Los',
  project_manager_name: 'Tony',
  notes: '',
  estimated_buildings: 1,
  estimated_units: 1,
  estimated_beds: 2,
  estimated_common_areas: 0,
  ai_budget_usd: 10,
  archived_at: null,
  created_at: stamp,
  updated_at: updatedAt,
});

const unitRow = (updatedAt = stamp, notes = 'cloud newer note'): RemoteRow => ({
  id: 'unit_sync_pull_104',
  project_id: 'project_sync_pull',
  building_id: null,
  floor_id: null,
  unit_number: '104',
  bed_count: 2,
  bathroom_count: 1,
  has_common_area: false,
  overall_status: 'Not Started',
  paint_status: 'Not Started',
  clean_status: 'Not Started',
  repair_status: 'Not Started',
  flooring_status: 'Not Applicable',
  trash_status: 'Not Started',
  inspection_status: 'Not Started',
  assigned_crew_ids: [],
  notes,
  created_at: stamp,
  updated_at: updatedAt,
});

const reportDraftRow = (updatedAt = stamp): RemoteRow => ({
  id: 'project_sync_pull:2026-07-08',
  project_id: 'project_sync_pull',
  date: '2026-07-08',
  title: 'Cloud Edited Turn Report',
  title_edited: true,
  summary: 'Cloud edited report summary',
  summary_edited: true,
  sections: [
    {
      title: 'Open Issues',
      subtitle: 'Needs attention',
      body: 'Unit 203 waiting on paint',
      bodyEdited: true,
    },
  ],
  created_at: stamp,
  updated_at: updatedAt,
});

const dailyLogRow = (id: string, updatedAt: string, completedSummary: string): RemoteRow => ({
  id,
  project_id: 'project_sync_pull',
  date: '2026-07-08',
  morning_plan: '',
  midday_update: '',
  end_of_day_reflection: '',
  completed_summary: completedSummary,
  blockers: '',
  lessons: '',
  tomorrow_priorities: '',
  created_at: stamp,
  updated_at: updatedAt,
});

const photoNoteRow = (storagePath = `${userId}/photo_sync_pull.jpg`): RemoteRow => ({
  id: 'photo_sync_pull',
  project_id: 'project_sync_pull',
  building_id: null,
  floor_id: null,
  unit_id: 'unit_sync_pull_104',
  issue_id: null,
  storage_path: storagePath,
  category: 'Problem',
  caption: 'Cloud photo path QA',
  created_at: stamp,
  updated_at: stamp,
});

const memoryRow = (): RemoteRow => ({
  id: 'memory_sync_pull',
  project_id: 'project_sync_pull',
  memory_type: 'Crew Memory',
  content: 'Jose crew handles paint.',
  source: 'Capture QA',
  source_entity_id: 'unit_sync_pull_104',
  confidence: 0.88,
  approved: true,
  last_used_at: null,
  created_at: stamp,
  updated_at: stamp,
});

const memoryCandidateRow = (): RemoteRow => ({
  id: 'candidate_sync_pull',
  project_id: 'project_sync_pull',
  memory_type: 'Lesson Learned',
  content: 'Blocked units need an owner.',
  source: 'Capture QA',
  source_entity_id: 'unit_sync_pull_104',
  confidence: 0.82,
  status: 'pending',
  created_at: stamp,
  updated_at: stamp,
});

const aiUsageEventRow = (): RemoteRow => ({
  id: 'ai_usage_sync_pull',
  project_id: 'project_sync_pull',
  task: 'capture',
  model: 'gpt-5.4-mini',
  model_class: 'complex',
  route_reason: 'Capture spans several workflow types.',
  input_tokens: 1_015,
  cached_input_tokens: 100,
  output_tokens: 569,
  total_tokens: 1_584,
  estimated_cost_usd: 0.00324675,
  pricing_version: '2026-07-10',
  created_at: stamp,
  updated_at: stamp,
});

const rowsByTable = (overrides: Record<string, RemoteRow[]> = {}) =>
  new Map(syncedTables.map((table) => [table, overrides[table] ?? []]));

const fakeClient = (
  rows: Map<string, RemoteRow[]>,
  rangeCalls: RangeCall[] = [],
  upsertCalls: UpsertCall[] = [],
  orderCalls: OrderCall[] = [],
) => ({
  from(table: string) {
    return {
      select() {
        const query: FakeSelectQuery = {
          order(column, options) {
            orderCalls.push({ ascending: options?.ascending !== false, column, table });
            return query;
          },
          async range(from, to) {
            rangeCalls.push({ from, table, to });
            return { data: (rows.get(table) ?? []).slice(from, to + 1), error: null };
          },
        };
        return query;
      },
      async upsert(upsertRows: RemoteRow[]) {
        upsertCalls.push({ rows: upsertRows, table });
        return { error: null };
      },
    };
  },
});

const asSupabaseClient = (client: ReturnType<typeof fakeClient>) => client as unknown as SupabaseClient;

test('fetchRemoteData paginates table pulls past the Supabase 1000-row default', async () => {
  const rangeCalls: RangeCall[] = [];
  const activityRows = Array.from({ length: remotePullPageSize + 3 }, (_, index) => ({
    id: `activity_${String(index).padStart(4, '0')}`,
    project_id: 'project_sync_pull',
    entity_type: 'Unit',
    entity_id: 'unit_sync_pull_104',
    action: 'QA activity',
    note: '',
    created_at: stamp,
  }));

  const result = await fetchRemoteData(asSupabaseClient(fakeClient(rowsByTable({ activity_logs: activityRows }), rangeCalls)));
  const activityCalls = rangeCalls.filter((call) => call.table === 'activity_logs');

  assert.equal(result.rowCount, remotePullPageSize + 3);
  assert.equal(result.remote.activityLogs?.length, remotePullPageSize + 3);
  assert.deepEqual(activityCalls.map(({ from, to }) => ({ from, to })), [
    { from: 0, to: remotePullPageSize - 1 },
    { from: remotePullPageSize, to: remotePullPageSize * 2 - 1 },
  ]);
});

test('fetchRemoteData bounds Activity pulls to the newest local retention window', async () => {
  const rangeCalls: RangeCall[] = [];
  const orderCalls: OrderCall[] = [];
  const activityRows = Array.from({ length: remoteActivityPullLimit + 3 }, (_, index) => ({
    id: `activity_window_${String(index).padStart(5, '0')}`,
    project_id: 'project_sync_pull',
    entity_type: 'Unit',
    entity_id: 'unit_sync_pull_104',
    action: 'QA activity',
    note: '',
    created_at: new Date(Date.parse(stamp) - index * 1_000).toISOString(),
  }));

  const result = await fetchRemoteData(
    asSupabaseClient(fakeClient(rowsByTable({ activity_logs: activityRows }), rangeCalls, [], orderCalls)),
  );
  const activityCalls = rangeCalls.filter((call) => call.table === 'activity_logs');
  const activityOrders = orderCalls.filter((call) => call.table === 'activity_logs');

  assert.equal(result.rowCount, remoteActivityPullLimit);
  assert.equal(result.remote.activityLogs?.length, remoteActivityPullLimit);
  assert.equal(activityCalls.length, remoteActivityPullLimit / remotePullPageSize);
  assert.deepEqual(activityCalls.at(-1), {
    from: remoteActivityPullLimit - remotePullPageSize,
    table: 'activity_logs',
    to: remoteActivityPullLimit - 1,
  });
  assert.deepEqual(activityOrders.slice(0, 2), [
    { ascending: false, column: 'created_at', table: 'activity_logs' },
    { ascending: true, column: 'id', table: 'activity_logs' },
  ]);
});

test('bounded Activity baselines upload recent offline events without re-uploading older windowed rows', async () => {
  const activityRows = Array.from({ length: remoteActivityPullLimit }, (_, index) => ({
    id: `activity_cloud_window_${String(index).padStart(5, '0')}`,
    project_id: 'project_sync_pull',
    entity_type: 'Unit',
    entity_id: 'unit_sync_pull_104',
    action: 'Cloud activity',
    note: '',
    created_at: new Date(Date.parse(stamp) - index * 1_000).toISOString(),
  }));
  const clientRows = rowsByTable({
    activity_logs: activityRows,
    projects: [projectRow()],
    units: [unitRow(stamp, 'local stale note')],
  });
  const baseline = await fetchRemoteData(asSupabaseClient(fakeClient(clientRows)));
  const upsertCalls: UpsertCall[] = [];
  const oldLocalActivity = {
    id: 'activity_old_outside_window',
    projectId: 'project_sync_pull',
    entityType: 'Unit' as const,
    entityId: 'unit_sync_pull_104',
    action: 'Already-windowed old activity',
    note: '',
    createdAt: new Date(Date.parse(stamp) - (remoteActivityPullLimit + 10) * 1_000).toISOString(),
  };
  const recentOfflineActivity = {
    ...oldLocalActivity,
    id: 'activity_recent_offline',
    action: 'Recent offline activity',
    createdAt: new Date(Date.parse(stamp) + 1_000).toISOString(),
  };
  const local = {
    ...appData(),
    activityLogs: [recentOfflineActivity, oldLocalActivity],
  };

  const upload = await uploadLocalData(
    asSupabaseClient(fakeClient(clientRows, [], upsertCalls)),
    local,
    baseline.baseline,
  );
  const activityUpsert = upsertCalls.find((call) => call.table === 'activity_logs');

  assert.deepEqual(upload.failures, []);
  assert.equal(upload.uploadedRows, 1);
  assert.deepEqual(activityUpsert?.rows.map((row) => row.id), [recentOfflineActivity.id]);
});

test('fetchRemoteData maps report draft rows with edited section state', async () => {
  const result = await fetchRemoteData(
    asSupabaseClient(
      fakeClient(
        rowsByTable({
          report_drafts: [reportDraftRow()],
        }),
      ),
    ),
  );

  const draft = result.remote.reportDrafts?.[0];

  assert.equal(draft?.id, 'project_sync_pull:2026-07-08');
  assert.equal(draft?.title, 'Cloud Edited Turn Report');
  assert.equal(draft?.titleEdited, true);
  assert.equal(draft?.summaryEdited, true);
  assert.equal(draft?.sections[0]?.bodyEdited, true);
  assert.equal(draft?.sections[0]?.body, 'Unit 203 waiting on paint');
});

test('fetchRemoteData maps private photo storage paths', async () => {
  const result = await fetchRemoteData(
    asSupabaseClient(fakeClient(rowsByTable({ photo_notes: [photoNoteRow()] }))),
  );

  assert.equal(result.remote.photoNotes?.[0]?.storagePath, `${userId}/photo_sync_pull.jpg`);
});

test('fetchRemoteData maps project scope and source ids for Memory rows', async () => {
  const result = await fetchRemoteData(
    asSupabaseClient(
      fakeClient(
        rowsByTable({
          memories: [memoryRow()],
          memory_candidates: [memoryCandidateRow()],
        }),
      ),
    ),
  );

  assert.equal(result.remote.memories?.[0]?.projectId, 'project_sync_pull');
  assert.equal(result.remote.memories?.[0]?.sourceEntityId, 'unit_sync_pull_104');
  assert.equal(result.remote.memoryCandidates?.[0]?.projectId, 'project_sync_pull');
  assert.equal(result.remote.memoryCandidates?.[0]?.sourceEntityId, 'unit_sync_pull_104');
});

test('fetchRemoteData maps the Turn AI budget and minimal usage receipt', async () => {
  const result = await fetchRemoteData(
    asSupabaseClient(
      fakeClient(rowsByTable({ projects: [{ ...projectRow(), ai_budget_usd: 12.5 }], ai_usage_events: [aiUsageEventRow()] })),
    ),
  );

  assert.equal(result.remote.projects?.[0]?.aiBudgetUsd, 12.5);
  assert.deepEqual(result.remote.aiUsageEvents?.[0], aiUsageEvent());
});

test('uploadLocalData serializes edited report drafts for Supabase upsert', async () => {
  const upsertCalls: UpsertCall[] = [];
  const local = {
    ...appData(),
    reportDrafts: [reportDraft('2026-07-08T12:05:00.000Z')],
  };

  const result = await uploadLocalData(asSupabaseClient(fakeClient(rowsByTable(), [], upsertCalls)), local, {});
  const reportDraftUpsert = upsertCalls.find((call) => call.table === 'report_drafts');
  const row = reportDraftUpsert?.rows[0];

  assert.equal(result.uploadedTables.includes('report_drafts'), true);
  assert.equal(row?.project_id, 'project_sync_pull');
  assert.equal(row?.title_edited, true);
  assert.equal(Array.isArray(row?.sections), true);
  assert.equal((row?.sections as ReportDocumentDraft['sections'])?.[0]?.bodyEdited, true);
});

test('uploadLocalData batches large changed tables for retryable Supabase requests', async () => {
  const unitCount = remoteUploadBatchSize * 2 + 3;
  const upsertCalls: UpsertCall[] = [];
  const local = {
    ...appData(),
    units: Array.from({ length: unitCount }, (_, index) => ({
      ...unit(),
      id: `unit_batch_${String(index).padStart(4, '0')}`,
      unitNumber: String(10_000 + index),
    })),
  };

  const result = await uploadLocalData(asSupabaseClient(fakeClient(rowsByTable(), [], upsertCalls)), local, {});
  const unitUpserts = upsertCalls.filter((call) => call.table === 'units');

  assert.deepEqual(unitUpserts.map((call) => call.rows.length), [remoteUploadBatchSize, remoteUploadBatchSize, 3]);
  assert.equal(result.baseline.units?.size, unitCount);
  assert.equal(result.uploadedRows, unitCount + 1);
  assert.equal(result.uploadedTables.filter((table) => table === 'units').length, 1);
  assert.deepEqual(result.failures, []);
});

test('uploadLocalData checkpoints successful batches and retries only unfinished rows', async () => {
  const unitCount = remoteUploadBatchSize * 2 + 3;
  const local = {
    ...appData(),
    units: Array.from({ length: unitCount }, (_, index) => ({
      ...unit(),
      id: `unit_retry_${String(index).padStart(4, '0')}`,
      unitNumber: String(20_000 + index),
    })),
  };
  let unitBatch = 0;
  const partialClient = {
    from(table: string) {
      return {
        async upsert() {
          if (table === 'units') {
            unitBatch += 1;
            if (unitBatch === 2) return { error: { message: 'Disposable batch failure' } };
          }
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;

  const partial = await uploadLocalData(partialClient, local, {});
  assert.equal(partial.baseline.units?.size, remoteUploadBatchSize);
  assert.equal(partial.uploadedRows, remoteUploadBatchSize + 1);
  assert.deepEqual(partial.failures, [
    `units rows ${remoteUploadBatchSize + 1}-${remoteUploadBatchSize * 2}: Disposable batch failure`,
  ]);

  const retryCalls: UpsertCall[] = [];
  const retry = await uploadLocalData(
    asSupabaseClient(fakeClient(rowsByTable(), [], retryCalls)),
    local,
    partial.baseline,
  );
  const unitRetries = retryCalls.filter((call) => call.table === 'units');
  assert.deepEqual(unitRetries.map((call) => call.rows.length), [remoteUploadBatchSize, 3]);
  assert.equal(retry.uploadedRows, remoteUploadBatchSize + 3);
  assert.equal(retry.baseline.units?.size, unitCount);
  assert.deepEqual(retry.failures, []);
});

test('uploadLocalData serializes private photo storage paths', async () => {
  const upsertCalls: UpsertCall[] = [];
  const local = {
    ...appData(),
    photoNotes: [photoNote()],
  };

  await uploadLocalData(asSupabaseClient(fakeClient(rowsByTable(), [], upsertCalls)), local, {});
  const photoUpsert = upsertCalls.find((call) => call.table === 'photo_notes');

  assert.equal(photoUpsert?.rows[0]?.storage_path, `${userId}/photo_sync_pull.jpg`);
});

test('uploadLocalData serializes project scope and source ids for Memory rows', async () => {
  const upsertCalls: UpsertCall[] = [];
  const local = {
    ...appData(),
    memories: [memory()],
    memoryCandidates: [memoryCandidate()],
  };

  await uploadLocalData(asSupabaseClient(fakeClient(rowsByTable(), [], upsertCalls)), local, {});
  const memoryUpsert = upsertCalls.find((call) => call.table === 'memories');
  const candidateUpsert = upsertCalls.find((call) => call.table === 'memory_candidates');

  assert.equal(memoryUpsert?.rows[0]?.project_id, 'project_sync_pull');
  assert.equal(memoryUpsert?.rows[0]?.source_entity_id, 'unit_sync_pull_104');
  assert.equal(candidateUpsert?.rows[0]?.project_id, 'project_sync_pull');
  assert.equal(candidateUpsert?.rows[0]?.source_entity_id, 'unit_sync_pull_104');
});

test('uploadLocalData serializes the Turn AI budget and minimal usage receipt', async () => {
  const upsertCalls: UpsertCall[] = [];
  const local = {
    ...appData({ ...project(), aiBudgetUsd: 12.5 }),
    aiUsageEvents: [aiUsageEvent()],
  };

  await uploadLocalData(asSupabaseClient(fakeClient(rowsByTable(), [], upsertCalls)), local, {});
  const projectUpsert = upsertCalls.find((call) => call.table === 'projects');
  const usageUpsert = upsertCalls.find((call) => call.table === 'ai_usage_events');

  assert.equal(projectUpsert?.rows[0]?.ai_budget_usd, 12.5);
  assert.deepEqual(usageUpsert?.rows[0], {
    id: 'ai_usage_sync_pull',
    project_id: 'project_sync_pull',
    task: 'capture',
    model: 'gpt-5.4-mini',
    model_class: 'complex',
    route_reason: 'Capture spans several workflow types.',
    input_tokens: 1_015,
    cached_input_tokens: 100,
    output_tokens: 569,
    total_tokens: 1_584,
    estimated_cost_usd: 0.00324675,
    pricing_version: '2026-07-10',
    created_at: stamp,
    updated_at: stamp,
  });
});

test('replaceRemoteData preserves a local-only unscoped Memory candidate', () => {
  const local = {
    ...appData(),
    memoryCandidates: [
      {
        ...memoryCandidate('legacy_local_candidate'),
        projectId: undefined,
        sourceEntityId: undefined,
      },
    ],
  };

  const next = replaceRemoteData(local, { memoryCandidates: [memoryCandidate()] });

  assert.deepEqual(
    next.memoryCandidates.map((candidate) => candidate.id),
    ['candidate_sync_pull', 'legacy_local_candidate'],
  );
});

test('pull-before-upload keeps a newer cloud row from being re-overwritten by a stale local row', async () => {
  const pull = await fetchRemoteData(
    asSupabaseClient(
      fakeClient(
        rowsByTable({
          projects: [projectRow('2026-07-08T12:05:00.000Z')],
          units: [unitRow('2026-07-08T12:05:00.000Z', 'cloud newer note')],
        }),
      ),
    ),
  );
  const local = appData(project('2026-07-08T12:00:00.000Z'), unit('2026-07-08T12:00:00.000Z', 'local stale note'));
  const merged = mergeRemoteData(local, pull.remote);
  const upsertCalls: UpsertCall[] = [];

  const uploadResult = await uploadLocalData(asSupabaseClient(fakeClient(rowsByTable(), [], upsertCalls)), merged, pull.baseline);

  assert.equal(merged.units.find((item) => item.id === 'unit_sync_pull_104')?.notes, 'cloud newer note');
  assert.equal(uploadResult.uploadedRows, 0);
  assert.deepEqual(upsertCalls, []);
});

test('pull-before-upload updates a legacy cloud Daily Log instead of inserting a conflicting tuple', async () => {
  const legacyCloudId = 'daily_legacy_cloud';
  const pull = await fetchRemoteData(
    asSupabaseClient(
      fakeClient(
        rowsByTable({
          projects: [projectRow()],
          units: [unitRow(stamp, 'local stale note')],
          daily_logs: [dailyLogRow(legacyCloudId, '2026-07-08T12:00:00.000Z', 'Older cloud summary')],
        }),
      ),
    ),
  );
  const local = {
    ...appData(),
    dailyLogs: [
      dailyLog(buildDailyLogId('project_sync_pull', '2026-07-08'), '2026-07-08T12:05:00.000Z', 'Newer iPad summary'),
    ],
  };
  const merged = mergeRemoteData(local, pull.remote);
  const upsertCalls: UpsertCall[] = [];

  const uploadResult = await uploadLocalData(asSupabaseClient(fakeClient(rowsByTable(), [], upsertCalls)), merged, pull.baseline);
  const dailyLogUpsert = upsertCalls.find((call) => call.table === 'daily_logs');

  assert.equal(merged.dailyLogs.length, 1);
  assert.equal(merged.dailyLogs[0]?.id, legacyCloudId);
  assert.equal(merged.dailyLogs[0]?.completedSummary, 'Newer iPad summary');
  assert.equal(uploadResult.uploadedRows, 1);
  assert.equal(dailyLogUpsert?.rows.length, 1);
  assert.equal(dailyLogUpsert?.rows[0]?.id, legacyCloudId);
  assert.equal(dailyLogUpsert?.rows[0]?.completed_summary, 'Newer iPad summary');
});
