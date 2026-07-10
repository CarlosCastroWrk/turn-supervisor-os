import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { buildModelCaptureRequest } from '../src/lib/ai/modelCapture.ts';
import type { AgentParseResult } from '../src/lib/ai/types.ts';
import {
  AI_PRICING_VERSION,
  aiUsageEventFromResult,
  estimateAiTextCost,
  summarizeAiUsage,
} from '../src/lib/ai/usage.ts';
import { normalizeAppData } from '../src/lib/dataMigrations.ts';
import { addAiUsageEvent } from '../src/lib/actions.ts';
import { filterUploadableSyncItems } from '../src/lib/supabase/syncBoundary.ts';
import { syncedTables } from '../src/lib/supabase/sync.ts';
import { CaptureRouteError } from '../server/ai/captureHandler.ts';
import { selectCaptureModel } from '../server/ai/modelPolicy.ts';
import type { AiUsageEvent, AppData } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

test('Capture model policy uses nano for focused extraction and mini for complex or high-consequence notes', () => {
  const data = cloneSeed();
  const focused = buildModelCaptureRequest('Unit 203 has a sink leak.', data);
  const focusedSelection = selectCaptureModel(focused, {} as NodeJS.ProcessEnv);
  assert.equal(focusedSelection.model, 'gpt-5.4-nano');
  assert.equal(focusedSelection.modelClass, 'fast');
  assert.equal(focusedSelection.maxOutputTokens, 1_600);
  assert.equal(focusedSelection.reasoningEffort, 'none');

  const highConsequence = buildModelCaptureRequest('Unit 203 is done and ready.', data);
  const highConsequenceSelection = selectCaptureModel(highConsequence, {} as NodeJS.ProcessEnv);
  assert.equal(highConsequenceSelection.model, 'gpt-5.4-mini');
  assert.equal(highConsequenceSelection.modelClass, 'complex');
  assert.equal(highConsequenceSelection.maxOutputTokens, 3_000);

  const multiAction = buildModelCaptureRequest(
    'Unit 203 paint complete. Unit 202 has a leak. Move Jose crew to 201. Ask the project manager about keys.',
    data,
  );
  assert.equal(selectCaptureModel(multiAction, {} as NodeJS.ProcessEnv).modelClass, 'complex');

  const mixedWorkflow = buildModelCaptureRequest(
    'Unit 203 paint is complete but the bathroom sink is leaking. Ask the project manager to confirm maintenance by 3 PM.',
    data,
  );
  assert.equal(selectCaptureModel(mixedWorkflow, {} as NodeJS.ProcessEnv).modelClass, 'complex');

  const attachment = buildModelCaptureRequest('[Attached file: walkthrough.txt]\nUnit 203 needs review.', data);
  assert.equal(selectCaptureModel(attachment, {} as NodeJS.ProcessEnv).modelClass, 'complex');
});

test('Capture model policy supports a validated emergency override', () => {
  const request = buildModelCaptureRequest('Unit 203 has a sink leak.', cloneSeed());
  const override = selectCaptureModel(request, { OPENAI_MODEL: 'gpt-5.5' } as NodeJS.ProcessEnv);
  assert.equal(override.model, 'gpt-5.5');
  assert.equal(override.modelClass, 'override');

  assert.throws(
    () => selectCaptureModel(request, { OPENAI_MODEL: 'bad model id' } as NodeJS.ProcessEnv),
    (error: unknown) => error instanceof CaptureRouteError && error.status === 503,
  );
});

test('token cost estimator accounts for cached input at the configured model rate', () => {
  const estimate = estimateAiTextCost('gpt-5.4-nano', 1_000_000, 200_000, 500_000);
  assert.deepEqual(estimate, {
    inputCostUsd: 0.16,
    cachedInputCostUsd: 0.004,
    outputCostUsd: 0.625,
    totalCostUsd: 0.789,
  });
  assert.equal(estimateAiTextCost('unknown-model', 1_000, 0, 100), null);
});

test('metered model result becomes one deduplicatable usage event and budget summary', () => {
  const result: AgentParseResult = {
    summary: 'AI assist proposed one draft.',
    rawInput: 'Unit 203 has a sink leak.',
    detectedEntities: { units: ['203'], buildings: [], floors: [], crews: [], issues: ['Sink leak'] },
    draftActions: [],
    memoryCandidates: [],
    clarificationQuestions: [],
    warnings: [],
    confidence: 0.9,
    provider: 'openai',
    model: 'gpt-5.4-nano',
    usage: {
      inputTokens: 1_087,
      cachedInputTokens: 0,
      outputTokens: 1_053,
      totalTokens: 2_140,
      estimatedCostUsd: 0.00153365,
      pricingVersion: AI_PRICING_VERSION,
      modelClass: 'fast',
      routeReason: 'Focused capture uses the lowest-cost capable model.',
      requestId: 'request_metered',
    },
  };

  const event = aiUsageEventFromResult(result, seedData.activeProjectId, '2026-07-10T13:00:00.000Z');
  assert.ok(event);
  assert.equal(event.id, 'ai_usage_request_metered');
  assert.equal(event.estimatedCostUsd, 0.00153365);

  const summary = summarizeAiUsage([event, { ...event, id: 'ai_usage_second' }], 10);
  assert.equal(summary.callCount, 2);
  assert.equal(summary.totalCostUsd, 0.0030673);
  assert.equal(summary.remainingUsd, 9.9969327);
  assert.equal(summary.modelCounts.fast, 2);

  const added = addAiUsageEvent(cloneSeed(), event);
  assert.equal(added.aiUsageEvents.length, 1);
  assert.equal(addAiUsageEvent(added, event).aiUsageEvents.length, 1);
});

test('AI usage records normalize, sync for Real Turn, and stay local for Demo Mode', () => {
  const legacy = cloneSeed() as AppData & {
    aiUsageEvents?: AiUsageEvent[];
    projects: Array<AppData['projects'][number] & { aiBudgetUsd?: number }>;
  };
  delete legacy.aiUsageEvents;
  delete legacy.projects[0].aiBudgetUsd;
  const normalized = normalizeAppData(legacy as AppData);
  assert.deepEqual(normalized.aiUsageEvents, []);
  assert.equal(normalized.projects[0].aiBudgetUsd, 10);
  assert.ok(syncedTables.includes('ai_usage_events'));

  const demoEvent: AiUsageEvent = {
    id: 'ai_usage_demo',
    projectId: normalized.activeProjectId,
    task: 'capture',
    model: 'gpt-5.4-nano',
    modelClass: 'fast',
    routeReason: 'Test',
    inputTokens: 10,
    cachedInputTokens: 0,
    outputTokens: 5,
    totalTokens: 15,
    estimatedCostUsd: 0.00001,
    pricingVersion: AI_PRICING_VERSION,
    createdAt: '2026-07-10T13:00:00.000Z',
    updatedAt: '2026-07-10T13:00:00.000Z',
  };
  const demoData = { ...normalized, aiUsageEvents: [demoEvent] };
  assert.deepEqual(filterUploadableSyncItems(demoData, 'aiUsageEvents', [demoEvent]), []);

  const realProject = { ...normalized.projects[0], id: 'project_real_usage', mode: 'real' as const };
  const realData = { ...normalized, projects: [realProject, ...normalized.projects], aiUsageEvents: [] };
  const realEvent = { ...demoEvent, id: 'ai_usage_real', projectId: realProject.id };
  const realDataWithEvent = { ...realData, aiUsageEvents: [realEvent] };
  assert.deepEqual(filterUploadableSyncItems(realDataWithEvent, 'aiUsageEvents', [realEvent]), [realEvent]);
});

test('AI usage migration is owner-scoped, realtime-enabled, and excludes field-note content', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260710133819_add_ai_usage_metering.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /create table if not exists public\.ai_usage_events/i);
  assert.match(migration, /alter table public\.ai_usage_events enable row level security/i);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /project\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.ai_usage_events/i);
  assert.doesNotMatch(migration, /raw_input|source_text|field_note/i);
});
