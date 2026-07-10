import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAgentRun,
  addCopilotConversation,
  applyDraftAction,
} from '../src/lib/actions.ts';
import {
  buildCopilotMarkdown,
  buildDailyLogsMarkdown,
  buildDailyReport,
  buildDailyReportPreview,
  buildFollowUpsCsv,
  buildJsonBackup,
} from '../src/lib/exporters.ts';
import { parseJsonBackup } from '../src/lib/backups.ts';
import {
  getDraftActionProjectId,
  getFollowUpTaskProjectId,
  getProjectDailyLogs,
  getProjectDraftActions,
  getProjectFollowUpTasks,
} from '../src/lib/projectScope.ts';
import { filterUploadableSyncItems, withLocalDemoRows } from '../src/lib/supabase/syncBoundary.ts';
import { seedData } from '../src/data/seed.ts';
import type {
  AppData,
  DailyLog,
  DraftAction,
  FollowUpTask,
  Issue,
  Memory,
  MemoryCandidate,
  Project,
  Unit,
} from '../src/types.ts';

const REAL_PROJECT_ID = 'project_real_boundary';
const DEMO_PROJECT_ID = 'project_west_campus_turn';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const realProject: Project = {
  id: REAL_PROJECT_ID,
  mode: 'real',
  name: 'Real Boundary Turn',
  propertyName: 'Real Boundary Property',
  location: 'Austin, TX',
  startDate: '2026-07-09',
  endDate: '2026-07-23',
  supervisorName: 'Los',
  projectManagerName: 'Tony',
  notes: '',
  estimatedBuildings: 1,
  estimatedUnits: 1,
  estimatedBeds: 2,
  estimatedCommonAreas: 0,
  aiBudgetUsd: 10,
  createdAt: '2026-07-09T12:00:00.000Z',
  updatedAt: '2026-07-09T12:00:00.000Z',
};

const realUnit: Unit = {
  id: 'unit_real_boundary_203',
  projectId: REAL_PROJECT_ID,
  buildingId: 'building_real_boundary',
  floorId: 'floor_real_boundary_2',
  unitNumber: '203',
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
  notes: '',
  createdAt: '2026-07-09T12:00:00.000Z',
  updatedAt: '2026-07-09T12:00:00.000Z',
};

const boundaryData = (): AppData => {
  const data = cloneSeed();
  return {
    ...data,
    activeProjectId: REAL_PROJECT_ID,
    projects: [realProject, ...data.projects],
    units: [realUnit, ...data.units],
    activityLogs: [],
    draftActions: [],
    memories: [],
    memoryCandidates: [],
    agentRuns: [],
    aiUsageEvents: [],
    copilotConversations: [],
    followUpTasks: [],
    dailyLogs: [],
  };
};

const draft = (
  id: string,
  projectId: string | undefined,
  patch: Partial<DraftAction> = {},
): DraftAction => ({
  id,
  type: 'UPDATE_UNIT_STATUS',
  title: `Draft ${id}`,
  summary: `Summary ${id}`,
  targetEntityType: 'unit',
  payload: projectId ? { captureProjectId: projectId, unitNumber: '203', paintStatus: 'Blocked' } : {},
  confidence: 0.9,
  why: 'Boundary test',
  sourceText: id,
  status: 'pending',
  createdAt: '2026-07-09T12:00:00.000Z',
  ...patch,
});

const dailyLog = (id: string, projectId: string, marker: string): DailyLog => ({
  id,
  projectId,
  date: '2026-07-09',
  morningPlan: marker,
  middayUpdate: '',
  endOfDayReflection: '',
  completedSummary: marker,
  blockers: '',
  lessons: marker,
  tomorrowPriorities: '',
  createdAt: '2026-07-09T12:00:00.000Z',
  updatedAt: '2026-07-09T12:00:00.000Z',
});

const followUp = (id: string, projectId: string | undefined, marker: string): FollowUpTask => ({
  id,
  title: marker,
  description: marker,
  priority: 'Medium',
  dueAt: '',
  owner: 'Los',
  relatedEntityType: projectId ? 'project' : undefined,
  relatedEntityId: projectId,
  status: 'open',
  createdAt: '2026-07-09T12:00:00.000Z',
});

test('draft provenance accepts one Turn and rejects conflicting project links', () => {
  const data = boundaryData();
  const demoUnit = data.units.find((unit) => unit.projectId === DEMO_PROJECT_ID && unit.unitNumber === '203');
  assert.ok(demoUnit);

  const realDraft = draft('draft_real_scope', REAL_PROJECT_ID, { targetEntityId: realUnit.id });
  const conflictingDraft = draft('draft_conflicting_scope', REAL_PROJECT_ID, { targetEntityId: demoUnit.id });

  assert.equal(getDraftActionProjectId({ ...data, draftActions: [realDraft] }, realDraft), REAL_PROJECT_ID);
  assert.equal(getDraftActionProjectId({ ...data, draftActions: [conflictingDraft] }, conflictingDraft), undefined);
});

test('legacy capture batches inherit project provenance from their activity record', () => {
  const first = draft('draft_legacy_first', undefined, {
    payload: { captureBatchId: 'capture_legacy_boundary' },
  });
  const second = draft('draft_legacy_second', undefined, {
    payload: { captureBatchId: 'capture_legacy_boundary' },
  });
  const data: AppData = {
    ...boundaryData(),
    draftActions: [first, second],
    activityLogs: [
      {
        id: 'activity_legacy_batch',
        projectId: REAL_PROJECT_ID,
        entityType: 'DraftAction',
        entityId: first.id,
        action: 'Created draft actions',
        note: 'Legacy capture batch',
        createdAt: '2026-07-09T12:00:00.000Z',
      },
    ],
  };

  assert.equal(getDraftActionProjectId(data, second), REAL_PROJECT_ID);
  assert.deepEqual(getProjectDraftActions(data, REAL_PROJECT_ID).map((item) => item.id), [first.id, second.id]);
});

test('a Demo draft cannot mutate a same-number Real Turn unit', () => {
  const data = boundaryData();
  const demoUnit = data.units.find((unit) => unit.projectId === DEMO_PROJECT_ID && unit.unitNumber === '203');
  assert.ok(demoUnit);
  const demoDraft = draft('draft_demo_apply', DEMO_PROJECT_ID, { targetEntityId: demoUnit.id });

  const next = applyDraftAction({ ...data, draftActions: [demoDraft] }, demoDraft.id);

  assert.equal(next.units.find((unit) => unit.id === realUnit.id)?.paintStatus, 'Not Started');
  assert.equal(next.units.find((unit) => unit.id === demoUnit.id)?.paintStatus, demoUnit.paintStatus);
  assert.equal(next.draftActions[0]?.status, 'failed');
  assert.match(next.draftActions[0]?.error ?? '', /belongs to/);
});

test('an ambiguous legacy draft fails closed instead of guessing the active Turn', () => {
  const data = boundaryData();
  const ambiguousDraft = draft('draft_ambiguous_apply', undefined, {
    payload: { unitNumber: '203', paintStatus: 'Blocked' },
  });

  const next = applyDraftAction({ ...data, draftActions: [ambiguousDraft] }, ambiguousDraft.id);

  assert.equal(next.units.find((unit) => unit.id === realUnit.id)?.paintStatus, 'Not Started');
  assert.equal(next.draftActions[0]?.status, 'failed');
  assert.match(next.draftActions[0]?.error ?? '', /no verifiable Turn|conflicting project links/);
});

test('new agent history and generic follow-ups inherit the active Turn', () => {
  let data = boundaryData();
  data = addAgentRun(data, 'quick_capture', 'REAL_AGENT_INPUT', { marker: 'REAL_AGENT_OUTPUT' });
  data = addCopilotConversation(data, 'REAL_QUESTION', 'REAL_ANSWER', [], []);

  const followUpDraft = draft('draft_real_follow_up', REAL_PROJECT_ID, {
    type: 'CREATE_FOLLOW_UP_TASK',
    title: 'REAL_FOLLOW_UP',
    targetEntityType: 'followUpTask',
    payload: {
      captureProjectId: REAL_PROJECT_ID,
      title: 'REAL_FOLLOW_UP',
      description: 'REAL_FOLLOW_UP_DESCRIPTION',
    },
  });
  data = applyDraftAction({ ...data, draftActions: [followUpDraft] }, followUpDraft.id);

  assert.equal(data.agentRuns[0]?.projectId, REAL_PROJECT_ID);
  assert.equal(data.copilotConversations[0]?.projectId, REAL_PROJECT_ID);
  assert.equal(data.copilotConversations[1]?.projectId, REAL_PROJECT_ID);
  assert.equal(data.followUpTasks[0]?.relatedEntityType, 'project');
  assert.equal(data.followUpTasks[0]?.relatedEntityId, REAL_PROJECT_ID);
  assert.equal(getFollowUpTaskProjectId(data, data.followUpTasks[0]), REAL_PROJECT_ID);
});

test('human-readable exports include only the requested Turn while full backup stays complete', () => {
  const realMemory: Memory = {
    id: 'memory_real_export',
    projectId: REAL_PROJECT_ID,
    memoryType: 'Crew Memory',
    content: 'REAL_MEMORY_SENTINEL',
    source: 'Capture',
    confidence: 0.9,
    approved: true,
    createdAt: '2026-07-09T12:00:00.000Z',
    updatedAt: '2026-07-09T12:00:00.000Z',
  };
  const demoMemory: Memory = { ...realMemory, id: 'memory_demo_export', projectId: DEMO_PROJECT_ID, content: 'DEMO_MEMORY_SENTINEL' };
  const realCandidate: MemoryCandidate = {
    id: 'candidate_real_export',
    projectId: REAL_PROJECT_ID,
    memoryType: 'Lesson Learned',
    content: 'REAL_CANDIDATE_SENTINEL',
    source: 'Capture',
    confidence: 0.8,
    status: 'pending',
    createdAt: '2026-07-09T12:00:00.000Z',
    updatedAt: '2026-07-09T12:00:00.000Z',
  };
  const demoCandidate: MemoryCandidate = { ...realCandidate, id: 'candidate_demo_export', projectId: DEMO_PROJECT_ID, content: 'DEMO_CANDIDATE_SENTINEL' };
  const data: AppData = {
    ...boundaryData(),
    dailyLogs: [
      dailyLog('daily_real_export', REAL_PROJECT_ID, 'REAL_DAILY_SENTINEL'),
      dailyLog('daily_demo_export', DEMO_PROJECT_ID, 'DEMO_DAILY_SENTINEL'),
    ],
    draftActions: [
      draft('REAL_DRAFT_SENTINEL', REAL_PROJECT_ID, { targetEntityId: realUnit.id }),
      draft('DEMO_DRAFT_SENTINEL', DEMO_PROJECT_ID),
    ],
    memories: [realMemory, demoMemory],
    memoryCandidates: [realCandidate, demoCandidate],
    agentRuns: [
      { id: 'run_real_export', projectId: REAL_PROJECT_ID, mode: 'quick_capture', input: 'Real run', output: {}, status: 'failed', error: 'REAL_RUN_SENTINEL', createdAt: '2026-07-09T12:00:00.000Z' },
      { id: 'run_demo_export', projectId: DEMO_PROJECT_ID, mode: 'quick_capture', input: 'Demo run', output: {}, status: 'failed', error: 'DEMO_RUN_SENTINEL', createdAt: '2026-07-09T12:00:00.000Z' },
    ],
    aiUsageEvents: [],
    copilotConversations: [
      { id: 'conversation_real_export', projectId: REAL_PROJECT_ID, role: 'assistant', content: 'REAL_CONVERSATION_SENTINEL', supportingRecords: [], suggestedNextActions: [], createdAt: '2026-07-09T12:00:00.000Z' },
      { id: 'conversation_demo_export', projectId: DEMO_PROJECT_ID, role: 'assistant', content: 'DEMO_CONVERSATION_SENTINEL', supportingRecords: [], suggestedNextActions: [], createdAt: '2026-07-09T12:00:00.000Z' },
    ],
    followUpTasks: [
      followUp('follow_up_real_export', REAL_PROJECT_ID, 'REAL_FOLLOW_UP_SENTINEL'),
      followUp('follow_up_demo_export', DEMO_PROJECT_ID, 'DEMO_FOLLOW_UP_SENTINEL'),
    ],
  };

  const dailyMarkdown = buildDailyLogsMarkdown(getProjectDailyLogs(data, REAL_PROJECT_ID));
  const copilotMarkdown = buildCopilotMarkdown(data, REAL_PROJECT_ID);
  const followUpsCsv = buildFollowUpsCsv(getProjectFollowUpTasks(data, REAL_PROJECT_ID));

  assert.match(dailyMarkdown, /REAL_DAILY_SENTINEL/);
  assert.doesNotMatch(dailyMarkdown, /DEMO_DAILY_SENTINEL/);
  [
    'REAL_DRAFT_SENTINEL',
    'REAL_MEMORY_SENTINEL',
    'REAL_CANDIDATE_SENTINEL',
    'REAL_RUN_SENTINEL',
    'REAL_CONVERSATION_SENTINEL',
    'REAL_FOLLOW_UP_SENTINEL',
  ].forEach((marker) => assert.match(copilotMarkdown, new RegExp(marker)));
  [
    'DEMO_DRAFT_SENTINEL',
    'DEMO_MEMORY_SENTINEL',
    'DEMO_CANDIDATE_SENTINEL',
    'DEMO_RUN_SENTINEL',
    'DEMO_CONVERSATION_SENTINEL',
    'DEMO_FOLLOW_UP_SENTINEL',
  ].forEach((marker) => assert.doesNotMatch(copilotMarkdown, new RegExp(marker)));
  assert.match(followUpsCsv, /REAL_FOLLOW_UP_SENTINEL/);
  assert.doesNotMatch(followUpsCsv, /DEMO_FOLLOW_UP_SENTINEL/);

  const fullBackup = buildJsonBackup(data);
  assert.match(fullBackup, /REAL_DAILY_SENTINEL/);
  assert.match(fullBackup, /DEMO_DAILY_SENTINEL/);
  const restored = parseJsonBackup(fullBackup);
  assert.equal(restored.agentRuns.find((run) => run.id === 'run_real_export')?.projectId, REAL_PROJECT_ID);
  assert.equal(
    restored.copilotConversations.find((conversation) => conversation.id === 'conversation_real_export')?.projectId,
    REAL_PROJECT_ID,
  );
});

test('report builders honor their requested project even when another Turn is active', () => {
  const realIssue: Issue = {
    id: 'issue_real_report_boundary',
    projectId: REAL_PROJECT_ID,
    unitId: realUnit.id,
    title: 'REAL_REPORT_ISSUE',
    category: 'Maintenance',
    priority: 'High',
    owner: 'Los',
    status: 'Open',
    dueAt: '',
    notes: '',
    resolutionNotes: '',
    createdAt: '2026-07-09T12:00:00.000Z',
    updatedAt: '2026-07-09T12:00:00.000Z',
  };
  const demoIssue: Issue = { ...realIssue, id: 'issue_demo_report_boundary', projectId: DEMO_PROJECT_ID, title: 'DEMO_REPORT_ISSUE' };
  const wrongProjectLog = dailyLog('daily_demo_report_boundary', DEMO_PROJECT_ID, 'DEMO_REPORT_LOG');
  const data = {
    ...boundaryData(),
    activeProjectId: DEMO_PROJECT_ID,
    issues: [realIssue, demoIssue],
  };

  const preview = buildDailyReportPreview(data, realProject, '2026-07-09', wrongProjectLog);
  const report = buildDailyReport(data, realProject, '2026-07-09', wrongProjectLog);

  assert.equal(preview.metrics.find((metric) => metric.label === 'Total units')?.value, '1');
  assert.equal(preview.isMissingDailyLog, true);
  assert.equal(preview.sections.find((section) => section.title === 'Open Issues')?.items.some((item) => item.includes('REAL_REPORT_ISSUE')), true);
  assert.equal(preview.sections.find((section) => section.title === 'Open Issues')?.items.some((item) => item.includes('DEMO_REPORT_ISSUE')), false);
  assert.match(report, /REAL_REPORT_ISSUE/);
  assert.doesNotMatch(report, /DEMO_REPORT_ISSUE|DEMO_REPORT_LOG/);
});

test('sync keeps Demo and unverifiable drafts and follow-ups local', () => {
  const realDraft = draft('draft_real_sync_boundary', REAL_PROJECT_ID, { targetEntityId: realUnit.id });
  const demoDraft = draft('draft_demo_sync_boundary', DEMO_PROJECT_ID);
  const unknownDraft = draft('draft_unknown_sync_boundary', undefined);
  const realTask = followUp('follow_up_real_sync_boundary', REAL_PROJECT_ID, 'REAL_SYNC_TASK');
  const demoTask = followUp('follow_up_demo_sync_boundary', DEMO_PROJECT_ID, 'DEMO_SYNC_TASK');
  const unknownTask = followUp('follow_up_unknown_sync_boundary', undefined, 'UNKNOWN_SYNC_TASK');
  const data = {
    ...boundaryData(),
    draftActions: [realDraft, demoDraft, unknownDraft],
    followUpTasks: [realTask, demoTask, unknownTask],
  };

  assert.deepEqual(
    filterUploadableSyncItems(data, 'draftActions', data.draftActions).map((item) => item.id),
    [realDraft.id],
  );
  assert.deepEqual(
    filterUploadableSyncItems(data, 'followUpTasks', data.followUpTasks).map((item) => item.id),
    [realTask.id],
  );

  const pulled = withLocalDemoRows(data, { draftActions: [], followUpTasks: [] });
  assert.deepEqual(
    (pulled.draftActions as DraftAction[]).map((item) => item.id),
    [demoDraft.id, unknownDraft.id],
  );
  assert.deepEqual(
    (pulled.followUpTasks as FollowUpTask[]).map((item) => item.id),
    [demoTask.id, unknownTask.id],
  );
});

test('project scoping remains bounded across 10,000 Draft Actions', () => {
  const data = boundaryData();
  data.draftActions = Array.from({ length: 10_000 }, (_, index) =>
    draft(
      `draft_stress_${index}`,
      index % 2 === 0 ? REAL_PROJECT_ID : DEMO_PROJECT_ID,
      { targetEntityType: 'project', targetEntityId: index % 2 === 0 ? REAL_PROJECT_ID : DEMO_PROJECT_ID },
    ),
  );

  const startedAt = performance.now();
  const realDrafts = getProjectDraftActions(data, REAL_PROJECT_ID);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(realDrafts.length, 5_000);
  assert.equal(realDrafts.every((item) => item.payload.captureProjectId === REAL_PROJECT_ID), true);
  assert.ok(elapsedMs < 1_500, `Expected indexed project scoping under 1.5s; received ${elapsedMs.toFixed(1)}ms.`);
});
