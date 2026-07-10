import assert from 'node:assert/strict';
import { seedData } from '../src/data/seed.ts';
import { buildModelCaptureRequest } from '../src/lib/ai/modelCapture.ts';
import { runOpenAiCapture } from '../server/ai/openaiCapture.ts';
import type { AppData } from '../src/types.ts';

const data: AppData = JSON.parse(JSON.stringify(seedData)) as AppData;
const request = buildModelCaptureRequest(
  'Unit 203 paint is complete but the bathroom sink is leaking. Ask Tony to confirm maintenance by 3 PM.',
  data,
);
try {
  const result = await runOpenAiCapture(request, { id: 'local_model_smoke', email: 'local@example.invalid' });

  assert.equal(result.provider, 'openai');
  assert.ok(result.draftActions.length >= 2);
  assert.ok(result.draftActions.every((draft) => draft.status === 'pending'));
  assert.ok(result.draftActions.some((draft) => draft.type === 'UPDATE_UNIT_STATUS'));
  assert.ok(result.draftActions.some((draft) => draft.type === 'CREATE_ISSUE'));

  console.log(JSON.stringify({
    model: result.model,
    draftCount: result.draftActions.length,
    draftTypes: result.draftActions.map((draft) => draft.type),
    usage: result.usage,
  }, null, 2));
} catch (error) {
  const providerError = error as { name?: string; status?: number; code?: string };
  console.error(JSON.stringify({
    name: providerError.name ?? 'ModelSmokeError',
    status: providerError.status ?? null,
    code: providerError.code ?? null,
  }));
  process.exitCode = 1;
}
