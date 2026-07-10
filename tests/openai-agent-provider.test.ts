import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  buildModelCaptureRequest,
  convertModelCaptureOutput,
  type ModelCaptureOutput,
} from '../src/lib/ai/modelCapture.ts';
import { createOpenAiAgentProvider } from '../src/lib/ai/openaiAgentProvider.ts';
import type { AppData } from '../src/types.ts';

const data: AppData = JSON.parse(JSON.stringify(seedData)) as AppData;
const input = 'Unit 203 has a sink leak.';

const modelOutput: ModelCaptureOutput = {
  detectedUnits: ['203'],
  detectedBuildings: [],
  detectedFloors: [],
  detectedCrews: [],
  actions: [{
    kind: 'CREATE_ISSUE',
    unitNumbers: ['203'],
    title: 'Bathroom sink leak',
    summary: 'Create a maintenance issue for Unit 203.',
    overallStatus: null,
    paintStatus: null,
    cleanStatus: null,
    repairStatus: null,
    inspectionStatus: null,
    issueCategory: 'Maintenance',
    issuePriority: 'High',
    owner: '',
    trade: null,
    assignmentStatus: null,
    crewName: '',
    noteText: 'Bathroom sink is leaking.',
    dailyLogSection: null,
    dueDate: '',
    confidence: 0.92,
    why: 'The note explicitly reports a sink leak.',
  }],
  clarificationQuestions: [],
  warnings: [],
  confidence: 0.92,
};

test('online signed-in provider merges secure model drafts with the local safety parser', async () => {
  let calls = 0;
  const provider = createOpenAiAgentProvider({
    enabled: true,
    isOnline: () => true,
    getAccessToken: async () => 'valid.capture.token.123456',
    fetcher: async (_input, init) => {
      calls += 1;
      const request = buildModelCaptureRequest(input, data);
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer valid.capture.token.123456');
      assert.deepEqual(JSON.parse(String(init?.body)), request);
      const result = convertModelCaptureOutput(modelOutput, request, { model: 'gpt-test' });
      return Response.json({ requestId: 'request_test', result });
    },
  });

  const result = await provider.parseQuickCapture(input, data);

  assert.equal(calls, 1);
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-test');
  assert.ok(result.draftActions.some((draft) => draft.type === 'CREATE_ISSUE'));
  assert.match(result.providerNotice ?? '', /offline safety parser/i);
});

test('offline and failed model paths return deterministic drafts without throwing', async () => {
  let calls = 0;
  const offlineProvider = createOpenAiAgentProvider({
    enabled: true,
    isOnline: () => false,
    getAccessToken: async () => 'valid.capture.token.123456',
    fetcher: async () => {
      calls += 1;
      throw new Error('must not run');
    },
  });
  const offline = await offlineProvider.parseQuickCapture(input, data);
  assert.equal(calls, 0);
  assert.equal(offline.provider, 'deterministic');
  assert.match(offline.providerNotice ?? '', /Offline safety parser/);

  const failedProvider = createOpenAiAgentProvider({
    enabled: true,
    isOnline: () => true,
    getAccessToken: async () => 'valid.capture.token.123456',
    fetcher: async () => new Response('{}', { status: 503 }),
  });
  const failed = await failedProvider.parseQuickCapture(input, data);
  assert.equal(failed.provider, 'deterministic');
  assert.match(failed.providerNotice ?? '', /local safety parser completed/i);
  assert.ok(failed.draftActions.length > 0);
});
