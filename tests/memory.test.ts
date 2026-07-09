import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { addMemoryCandidates, approveMemoryCandidate, markMemoriesUsed } from '../src/lib/actions.ts';
import { mockAgentProvider } from '../src/lib/ai/mockAgentProvider.ts';
import { normalizeAppData } from '../src/lib/dataMigrations.ts';
import { getApplicableMemories } from '../src/lib/memory.ts';
import type { AppData, CrewMember, Memory, MemoryCandidate, Project, Unit } from '../src/types.ts';

const stamp = '2026-07-09T12:00:00.000Z';
const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const realProject = (patch: Partial<Project> = {}): Project => ({
  id: 'project_real_memory',
  mode: 'real',
  name: 'Real Memory QA',
  propertyName: 'QA Property',
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
  createdAt: stamp,
  updatedAt: stamp,
  ...patch,
});

const realUnit = (): Unit => ({
  ...cloneSeed().units[0],
  id: 'unit_real_memory_101',
  projectId: 'project_real_memory',
  buildingId: 'building_real_memory',
  floorId: 'floor_real_memory',
  unitNumber: '101',
  createdAt: stamp,
  updatedAt: stamp,
});

const activeCrew = (patch: Partial<CrewMember> = {}): CrewMember => ({
  id: 'crew_real_memory',
  projectId: 'project_real_memory',
  name: 'Jose',
  trade: 'Painter',
  phone: '',
  company: '',
  language: '',
  assignedLocation: '',
  notes: '',
  active: true,
  createdAt: stamp,
  updatedAt: stamp,
  ...patch,
});

const memory = (id: string, patch: Partial<Memory> = {}): Memory => ({
  id,
  projectId: 'project_real_memory',
  memoryType: 'Workflow Memory',
  content: id,
  source: 'QA source',
  confidence: 0.9,
  approved: true,
  createdAt: stamp,
  updatedAt: stamp,
  ...patch,
});

const candidate = (id: string, patch: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  id,
  memoryType: 'Crew Memory',
  content: 'Jose crew handles painting.',
  source: 'QA capture',
  confidence: 0.8,
  status: 'pending',
  createdAt: stamp,
  updatedAt: stamp,
  ...patch,
});

const withRealProject = (): AppData => {
  const data = cloneSeed();
  return {
    ...data,
    activeProjectId: 'project_real_memory',
    projects: [realProject(), ...data.projects],
    units: [realUnit(), ...data.units],
    crewMembers: [activeCrew(), ...data.crewMembers],
    assignments: [],
    issues: [],
    memories: [],
    memoryCandidates: [],
  };
};

test('applicable memories stay inside the active project and require a live source', () => {
  const data = withRealProject();
  data.projects.push(realProject({ id: 'project_archived', archivedAt: stamp }));
  data.crewMembers.push(activeCrew({ id: 'crew_inactive', active: false }));
  data.memoryCandidates = [
    candidate('other_candidate_source', { projectId: 'project_other' }),
    candidate('rejected_candidate_source', { projectId: data.activeProjectId, status: 'rejected' }),
  ];
  data.memories = [
    memory('active_project'),
    memory('global_preference', {
      projectId: undefined,
      memoryType: 'Personal Supervisor Preference',
      content: 'Reports should be concise.',
    }),
    memory('global_safety', { projectId: undefined, source: 'Built-in safety rule' }),
    memory('other_project', { projectId: 'project_other' }),
    memory('archived_project', { projectId: 'project_archived' }),
    memory('unscoped_crew', { projectId: undefined, memoryType: 'Crew Memory' }),
    memory('inactive_source', { sourceEntityId: 'crew_inactive', memoryType: 'Crew Memory' }),
    memory('missing_source', { sourceEntityId: 'crew_removed', memoryType: 'Crew Memory' }),
    memory('wrong_project_candidate_source', {
      sourceEntityId: 'other_candidate_source',
      memoryType: 'Crew Memory',
    }),
    memory('rejected_candidate_source_memory', {
      sourceEntityId: 'rejected_candidate_source',
      memoryType: 'Crew Memory',
    }),
    memory('not_approved', { approved: false }),
  ];

  assert.deepEqual(
    getApplicableMemories(data).map((item) => item.id),
    ['active_project', 'global_preference', 'global_safety'],
  );
});

test('new candidates inherit active project scope and approval preserves it', () => {
  const data = withRealProject();
  const withCandidate = addMemoryCandidates(data, [candidate('candidate_active', { projectId: 'project_other' })]);
  const scopedCandidate = withCandidate.memoryCandidates[0];

  assert.equal(scopedCandidate.projectId, data.activeProjectId);
  const approved = approveMemoryCandidate(withCandidate, scopedCandidate.id);
  assert.equal(approved.memories[0]?.projectId, data.activeProjectId);
  assert.equal(approved.memories[0]?.content, scopedCandidate.content);
  assert.equal(approved.memories[0]?.sourceEntityId, scopedCandidate.id);
  assert.equal(approved.memoryCandidates[0]?.status, 'approved');
});

test('an approved Memory fails closed if its source candidate is later rejected or removed', () => {
  const data = withRealProject();
  const pending = addMemoryCandidates(data, [candidate('candidate_source_guard')]);
  const approved = approveMemoryCandidate(pending, 'candidate_source_guard');
  const memoryId = approved.memories[0]?.id;
  assert.ok(memoryId);
  assert.deepEqual(getApplicableMemories(approved).map((item) => item.id), [memoryId]);

  const rejectedSource = {
    ...approved,
    memoryCandidates: approved.memoryCandidates.map((item) =>
      item.id === 'candidate_source_guard' ? { ...item, status: 'rejected' as const } : item,
    ),
  };
  const removedSource = { ...approved, memoryCandidates: [] };

  assert.deepEqual(getApplicableMemories(rejectedSource), []);
  assert.deepEqual(getApplicableMemories(removedSource), []);
});

test('duplicate candidate facts are suppressed within the active Turn', () => {
  const data = withRealProject();
  data.memories = [memory('existing_memory', { memoryType: 'Crew Memory', content: 'Jose crew handles painting.' })];

  const next = addMemoryCandidates(data, [
    candidate('duplicate_existing', { content: '  JOSE crew handles   painting.  ' }),
    candidate('new_fact', { content: 'Maria crew handles cleaning.' }),
    candidate('duplicate_batch', { content: '  maria crew handles   cleaning!  ' }),
  ]);

  assert.deepEqual(next.memoryCandidates.map((item) => item.id), ['new_fact']);
});

test('rejected or orphaned approved candidates do not prevent safe recapture', () => {
  const data = withRealProject();
  data.memoryCandidates = [
    candidate('rejected_fact', { projectId: data.activeProjectId, status: 'rejected' }),
    candidate('orphaned_approved_fact', {
      projectId: data.activeProjectId,
      status: 'approved',
      content: 'Maria crew handles cleaning.',
    }),
  ];

  const next = addMemoryCandidates(data, [
    candidate('recaptured_rejected'),
    candidate('recaptured_orphan', { content: 'Maria crew handles cleaning.' }),
  ]);

  assert.deepEqual(next.memoryCandidates.slice(0, 2).map((item) => item.id), [
    'recaptured_rejected',
    'recaptured_orphan',
  ]);
});

test('a Memory candidate cannot be approved twice or after rejection', () => {
  const data = withRealProject();
  const pending = addMemoryCandidates(data, [candidate('candidate_once')]);
  const approved = approveMemoryCandidate(pending, 'candidate_once');
  const approvedAgain = approveMemoryCandidate(approved, 'candidate_once');
  const rejectedInput = {
    ...data,
    memoryCandidates: [candidate('candidate_rejected', { projectId: data.activeProjectId, status: 'rejected' })],
  };

  assert.equal(approved.memories.length, 1);
  assert.equal(approvedAgain, approved);
  assert.equal(approveMemoryCandidate(rejectedInput, 'candidate_rejected'), rejectedInput);
});

test('unscoped or other-project candidates cannot be approved from the active Turn', () => {
  const data = withRealProject();
  data.memoryCandidates = [candidate('legacy_unscoped'), candidate('other_candidate', { projectId: 'project_other' })];

  assert.equal(approveMemoryCandidate(data, 'legacy_unscoped'), data);
  assert.equal(approveMemoryCandidate(data, 'other_candidate'), data);
});

test('normalization infers project scope from a live source and leaves unknown legacy memory unscoped', () => {
  const data = withRealProject();
  data.memories = [
    memory('source_scoped', { projectId: undefined, sourceEntityId: 'unit_real_memory_101' }),
    memory('legacy_unknown', { projectId: undefined, sourceEntityId: undefined, memoryType: 'Crew Memory' }),
  ];

  const normalized = normalizeAppData(data);
  assert.equal(normalized.memories.find((item) => item.id === 'source_scoped')?.projectId, 'project_real_memory');
  assert.equal(normalized.memories.find((item) => item.id === 'legacy_unknown')?.projectId, undefined);
});

test('Ask OS and briefings consume only applicable typed memories', async () => {
  const data = withRealProject();
  data.memories = [
    memory('active_crew', { memoryType: 'Crew Memory', content: 'Jose crew handles painting.' }),
    memory('other_crew', { projectId: 'project_other', memoryType: 'Crew Memory', content: 'Other crew handles flooring.' }),
    memory('active_report', {
      memoryType: 'Personal Supervisor Preference',
      content: 'Tony reports should start with a short concise version.',
    }),
  ];

  const crewAnswer = await mockAgentProvider.askOs('Where are the crews assigned?', data);
  assert.equal(crewAnswer.supportingRecords.some((record) => record.includes('Jose crew handles painting')), true);
  assert.equal(crewAnswer.supportingRecords.some((record) => record.includes('Other crew handles flooring')), false);
  assert.deepEqual(crewAnswer.usedMemoryIds, ['active_crew']);

  const briefing = await mockAgentProvider.generateBriefing('morning', data);
  assert.match(briefing.body, /^Short version:/);
  assert.equal(briefing.usedMemoryIds?.includes('active_report'), true);
  assert.equal(briefing.usedMemoryIds?.includes('other_crew'), false);
});

test('markMemoriesUsed updates only the consumed records', () => {
  const data = withRealProject();
  data.memories = [
    memory('used'),
    memory('not_used'),
    memory('other_project', { projectId: 'project_other' }),
    memory('not_approved', { approved: false }),
  ];

  const next = markMemoriesUsed(data, ['used', 'other_project', 'not_approved']);
  assert.ok(next.memories.find((item) => item.id === 'used')?.lastUsedAt);
  assert.equal(next.memories.find((item) => item.id === 'not_used')?.lastUsedAt, undefined);
  assert.equal(next.memories.find((item) => item.id === 'other_project')?.lastUsedAt, undefined);
  assert.equal(next.memories.find((item) => item.id === 'not_approved')?.lastUsedAt, undefined);
});
