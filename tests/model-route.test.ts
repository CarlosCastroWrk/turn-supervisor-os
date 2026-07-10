import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { buildModelCaptureRequest } from '../src/lib/ai/modelCapture.ts';
import { mockAgentProvider } from '../src/lib/ai/mockAgentProvider.ts';
import { verifyCaptureUser } from '../server/ai/captureAuth.ts';
import {
  CaptureRouteError,
  createCaptureHandler,
  type CaptureUser,
} from '../server/ai/captureHandler.ts';
import type { AppData } from '../src/types.ts';

const token = 'valid.capture.token.123456';
const url = 'https://turn.example/api/agent/capture';
const user: CaptureUser = { id: 'user_los', email: 'los@example.com' };
const data: AppData = JSON.parse(JSON.stringify(seedData)) as AppData;
const captureRequest = buildModelCaptureRequest('Unit 203 has a sink leak.', data);

const request = (body: unknown = captureRequest, init: RequestInit = {}) => {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Origin: 'https://turn.example',
  });
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return new Request(url, {
    ...init,
    method: init.method ?? 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
};

const successHandler = () =>
  createCaptureHandler({
    authenticate: async () => user,
    parseModel: async (modelRequest) => mockAgentProvider.parseQuickCapture(modelRequest.input, data),
    consumeRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }),
    createRequestId: () => 'request_test',
  });

test('capture route rejects non-POST and cross-origin requests before model execution', async () => {
  let modelCalls = 0;
  const handler = createCaptureHandler({
    authenticate: async () => user,
    parseModel: async (modelRequest) => {
      modelCalls += 1;
      return mockAgentProvider.parseQuickCapture(modelRequest.input, data);
    },
    createRequestId: () => 'request_test',
  });

  const methodResponse = await handler(new Request(url, { method: 'GET' }));
  assert.equal(methodResponse.status, 405);

  const originResponse = await handler(request(captureRequest, { headers: { Origin: 'https://attacker.example' } }));
  assert.equal(originResponse.status, 403);
  assert.equal(modelCalls, 0);
});

test('capture route requires bearer auth, JSON, and a valid bounded request', async () => {
  const handler = successHandler();

  const unauthorized = await handler(
    request(captureRequest, { headers: { Authorization: 'Bearer short' } }),
  );
  assert.equal(unauthorized.status, 401);

  const unsupported = await handler(
    request('{}', { headers: { 'Content-Type': 'text/plain' } }),
  );
  assert.equal(unsupported.status, 415);

  const invalid = await handler(request({ input: 'Missing project context' }));
  assert.equal(invalid.status, 400);

  const oversized = await handler(request('x'.repeat(64_001)));
  assert.equal(oversized.status, 413);
});

test('capture route returns validated no-store draft output without applying it', async () => {
  const response = await successHandler()(request());
  const payload = await response.json() as {
    requestId: string;
    result: { draftActions: Array<{ status: string }> };
  };

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(payload.requestId, 'request_test');
  assert.ok(payload.result.draftActions.length > 0);
  assert.ok(payload.result.draftActions.every((draft) => draft.status === 'pending'));
});

test('capture route keeps model failures generic and preserves request correlation', async () => {
  const handler = createCaptureHandler({
    authenticate: async () => user,
    parseModel: async () => {
      throw new Error('provider detail that must not reach the browser');
    },
    consumeRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }),
    createRequestId: () => 'request_failure',
  });

  const originalError = console.error;
  console.error = () => undefined;
  const response = await handler(request());
  console.error = originalError;
  const payload = await response.text();

  assert.equal(response.status, 503);
  assert.match(payload, /request_failure/);
  assert.match(payload, /MODEL_UNAVAILABLE/);
  assert.doesNotMatch(payload, /provider detail/);
});

test('capture route rate limits before provider cost and returns retry guidance', async () => {
  let modelCalls = 0;
  const handler = createCaptureHandler({
    authenticate: async () => user,
    parseModel: async (modelRequest) => {
      modelCalls += 1;
      return mockAgentProvider.parseQuickCapture(modelRequest.input, data);
    },
    consumeRateLimit: () => ({ allowed: false, retryAfterSeconds: 27 }),
    createRequestId: () => 'request_limited',
  });

  const response = await handler(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '27');
  assert.equal(modelCalls, 0);
});

test('Supabase auth verification uses the public anon key and enforces the allowed account', async () => {
  let capturedAuthorization = '';
  let capturedApiKey = '';
  const env = {
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    TURN_OS_ALLOWED_EMAIL: 'los@example.com',
  } as NodeJS.ProcessEnv;
  const fetcher: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    capturedAuthorization = headers.get('authorization') ?? '';
    capturedApiKey = headers.get('apikey') ?? '';
    return Response.json({ id: user.id, email: user.email });
  };

  const verified = await verifyCaptureUser(token, { env, fetcher });
  assert.deepEqual(verified, user);
  assert.equal(capturedAuthorization, `Bearer ${token}`);
  assert.equal(capturedApiKey, 'public-anon-key');

  await assert.rejects(
    () => verifyCaptureUser(token, { ...{ env: { ...env, TURN_OS_ALLOWED_EMAIL: 'other@example.com' } }, fetcher }),
    (error: unknown) => error instanceof CaptureRouteError && error.status === 403,
  );
});
