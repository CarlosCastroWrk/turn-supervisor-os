import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  buildModelCaptureRequest,
  convertModelCaptureOutput,
  mergeModelAndDeterministicCapture,
  type ModelCaptureAction,
  type ModelCaptureOutput,
} from '../src/lib/ai/modelCapture.ts';
import { mockAgentProvider } from '../src/lib/ai/mockAgentProvider.ts';
import type { AppData, MemoryCandidate } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const modelAction = (patch: Partial<ModelCaptureAction>): ModelCaptureAction => ({
  kind: 'ADD_DAILY_LOG_ENTRY',
  unitNumbers: [],
  title: 'Log field update',
  summary: 'Add the field update to today\'s log.',
  overallStatus: null,
  paintStatus: null,
  cleanStatus: null,
  repairStatus: null,
  inspectionStatus: null,
  issueCategory: null,
  issuePriority: null,
  owner: '',
  trade: null,
  assignmentStatus: null,
  crewName: '',
  noteText: 'Field update.',
  dailyLogSection: 'middayUpdate',
  dueDate: '',
  confidence: 0.8,
  why: 'The note is operational context.',
  ...patch,
});

const modelOutput = (actions: ModelCaptureAction[]): ModelCaptureOutput => ({
  detectedUnits: [],
  detectedBuildings: [],
  detectedFloors: [],
  detectedCrews: [],
  actions,
  clarificationQuestions: [],
  warnings: [],
  confidence: 0.84,
});

test('model request includes only bounded active-Turn context and omits crew contacts', () => {
  const data = cloneSeed();
  const baseUnit = data.units.find((unit) => unit.projectId === data.activeProjectId);
  assert.ok(baseUnit);
  data.units.push({ ...baseUnit, id: 'unit_alphanumeric', unitNumber: 'A-12' });
  const request = buildModelCaptureRequest('Unit A-12 is clean. Unit 203 has a sink leak. Unit 999 needs keys.', data);
  const serialized = JSON.stringify(request);

  assert.deepEqual(request.referencedUnits.map((unit) => unit.unitNumber).sort(), ['203', 'A-12']);
  assert.ok(request.activeCrews.length > 0);
  assert.ok(request.relatedOpenIssues.every((issue) => issue.unitNumber === '203'));
  assert.doesNotMatch(serialized, /phone|company|language/i);
  assert.doesNotMatch(serialized, /512-555|sample paint crew/i);
});

test('configured Unit matching stays bounded across a 5,000-Unit Turn', () => {
  const data = cloneSeed();
  const baseUnit = data.units.find((unit) => unit.projectId === data.activeProjectId);
  assert.ok(baseUnit);
  data.units = [
    ...data.units.filter((unit) => unit.projectId !== data.activeProjectId),
    ...Array.from({ length: 5_000 }, (_, index) => ({
      ...baseUnit,
      id: `unit_scale_${index}`,
      unitNumber: `A-${String(index + 1).padStart(4, '0')}`,
    })),
  ];

  const startedAt = performance.now();
  const request = buildModelCaptureRequest('Unit A-4999 has a sink leak.', data);
  const elapsedMs = performance.now() - startedAt;

  assert.deepEqual(request.referencedUnits.map((unit) => unit.unitNumber), ['A-4999']);
  assert.ok(elapsedMs < 1_000, `5,000-Unit context matching took ${elapsedMs.toFixed(1)}ms.`);
});

test('model conversion drops unknown Unit mutations while preserving safe project notes', () => {
  const request = buildModelCaptureRequest('Unit 203 paint complete. Unit 999 has a leak.', cloneSeed());
  const output = modelOutput([
    modelAction({
      kind: 'UPDATE_UNIT_STATUS',
      unitNumbers: ['203'],
      title: 'Mark Unit 203 paint complete',
      summary: 'Paint is complete in Unit 203.',
      paintStatus: 'Complete',
      overallStatus: 'Cleaning Ready',
      noteText: '',
      dailyLogSection: null,
      confidence: 0.93,
      why: 'The note explicitly says paint is complete.',
    }),
    modelAction({
      kind: 'CREATE_ISSUE',
      unitNumbers: ['999'],
      title: 'Sink leak',
      summary: 'Create an issue for the leak.',
      issueCategory: 'Maintenance',
      issuePriority: 'High',
      noteText: 'Sink leak.',
      dailyLogSection: null,
      confidence: 0.75,
      why: 'The note reports a leak.',
    }),
    modelAction({ noteText: 'Walked the second floor.' }),
    modelAction({
      kind: 'CREATE_FOLLOW_UP_TASK',
      unitNumbers: ['203'],
      title: 'Confirm maintenance timing',
      summary: 'Ask Tony when maintenance will return.',
      issuePriority: 'Medium',
      owner: 'Los',
      noteText: 'Confirm maintenance timing.',
      dailyLogSection: null,
      dueDate: 'sometime this afternoon',
      confidence: 0.7,
      why: 'The note requests a follow-up.',
    }),
    modelAction({
      kind: 'CREATE_ASSIGNMENT',
      unitNumbers: ['999'],
      title: 'Move crew to Unit 999',
      summary: 'Move the crew to an unknown Unit.',
      trade: 'Painter',
      assignmentStatus: 'In Progress',
      crewName: 'Jose crew',
      noteText: 'Move to Unit 999.',
      dailyLogSection: null,
      confidence: 0.7,
      why: 'Unknown Unit target coverage.',
    }),
  ]);

  const result = convertModelCaptureOutput(output, request, {
    model: 'gpt-test',
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
  });

  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-test');
  assert.equal(result.draftActions.length, 3);
  assert.deepEqual(result.draftActions.map((draft) => draft.type), [
    'UPDATE_UNIT_STATUS',
    'ADD_DAILY_LOG_ENTRY',
    'CREATE_FOLLOW_UP_TASK',
  ]);
  assert.match(result.warnings.join(' '), /Unit target is not confirmed.*999/i);
  assert.match(result.warnings.join(' '), /due time was removed/i);
  assert.match(result.warnings.join(' '), /none of its Unit targets are confirmed.*999/i);
  assert.equal(result.draftActions[2].payload.dueAt, undefined);
  assert.deepEqual(result.usage, { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, totalTokens: 150 });
});

test('model and deterministic merge keeps approved-memory candidates and flags status conflicts', async () => {
  const data = cloneSeed();
  const input = 'Unit 203 paint complete.';
  const request = buildModelCaptureRequest(input, data);
  const modelResult = convertModelCaptureOutput(
    modelOutput([
      modelAction({
        kind: 'UPDATE_UNIT_STATUS',
        unitNumbers: ['203'],
        title: 'Mark Unit 203 painting',
        summary: 'Painting is active in Unit 203.',
        overallStatus: 'Painting',
        paintStatus: 'In Progress',
        noteText: '',
        dailyLogSection: null,
        confidence: 0.8,
        why: 'Model interpretation for conflict coverage.',
      }),
    ]),
    request,
    { model: 'gpt-test' },
  );
  const deterministic = await mockAgentProvider.parseQuickCapture(input, data);
  const memory: MemoryCandidate = {
    id: 'memory_test',
    projectId: data.activeProjectId,
    memoryType: 'Lesson Learned',
    content: 'Confirm access before dispatching.',
    source: input,
    confidence: 0.8,
    status: 'pending',
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
  };
  deterministic.memoryCandidates = [memory];

  const merged = mergeModelAndDeterministicCapture(modelResult, deterministic);

  assert.equal(merged.provider, 'openai');
  assert.deepEqual(merged.memoryCandidates, [memory]);
  assert.ok(merged.draftActions.length >= 2);
  assert.ok(merged.draftActions.some((draft) => draft.payload.requiresConflictConfirmation === true));
  assert.match(merged.warnings.join(' '), /conflicting combined status drafts/i);
});

test('model conversion never invents a crew assignment from a follow-up request', () => {
  const request = buildModelCaptureRequest('Unit 203 has a sink leak. Ask Tony to confirm maintenance.', cloneSeed());
  const result = convertModelCaptureOutput(
    modelOutput([
      modelAction({
        kind: 'CREATE_ASSIGNMENT',
        unitNumbers: ['203'],
        title: 'Tony to confirm maintenance',
        summary: 'Ask Tony to confirm maintenance.',
        crewName: '',
        trade: 'Maintenance',
        assignmentStatus: 'Planned',
        noteText: 'Confirm maintenance.',
        dailyLogSection: null,
      }),
    ]),
    request,
    { model: 'gpt-test' },
  );

  assert.equal(result.draftActions.length, 0);
  assert.match(result.warnings.join(' '), /assignment skipped.*explicitly move or assign a named crew/i);
  assert.match(result.clarificationQuestions.join(' '), /confirm the crew and assignment/i);
});

test('model conversion keeps an explicit named crew move', () => {
  const request = buildModelCaptureRequest('Move Jose crew to Unit 203.', cloneSeed());
  const result = convertModelCaptureOutput(
    modelOutput([
      modelAction({
        kind: 'CREATE_ASSIGNMENT',
        unitNumbers: ['203'],
        title: 'Move Jose crew to Unit 203',
        summary: 'Assign Jose crew to Unit 203.',
        crewName: 'Jose crew',
        trade: 'Painter',
        assignmentStatus: 'In Progress',
        noteText: 'Move Jose crew to Unit 203.',
        dailyLogSection: null,
      }),
    ]),
    request,
    { model: 'gpt-test' },
  );

  assert.equal(result.draftActions.length, 1);
  assert.equal(result.draftActions[0].type, 'CREATE_ASSIGNMENT');
  assert.equal(result.draftActions[0].payload.teamName, 'Jose crew');
});
