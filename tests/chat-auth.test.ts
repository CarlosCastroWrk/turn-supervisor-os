import assert from 'node:assert/strict';
import test from 'node:test';
import chatRoute from '../api/intelligence/chat.ts';

// Turn Chat's AI turn spends credit on a public deployment, so it must reject
// any caller that is not a signed-in, allowed user BEFORE touching a provider.
// These tests pin that gate so it can never silently regress.

const post = (headers: Record<string, string>, body: unknown = {}) =>
  chatRoute.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/intelligence/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

test('rejects a request with no Authorization header (401) before any AI call', async () => {
  const response = await post({});
  assert.equal(response.status, 401);
});

test('rejects a malformed bearer token (401)', async () => {
  const response = await post({ authorization: 'Bearer short' });
  assert.equal(response.status, 401);
});

test('rejects a non-POST method (405)', async () => {
  const response = await chatRoute.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/intelligence/chat', {
      method: 'GET',
    }),
  );
  assert.equal(response.status, 405);
});

test('rejects a cross-site browser request (403)', async () => {
  const response = await post({
    authorization: `Bearer ${'a'.repeat(40)}`,
    'sec-fetch-site': 'cross-site',
  });
  assert.equal(response.status, 403);
});

test('an unauthenticated caller never reaches the AI provider', async () => {
  const response = await post({ authorization: `Bearer ${'a'.repeat(40)}` });
  assert.ok(response.status === 401 || response.status === 403 || response.status === 503);
  assert.notEqual(response.status, 200);
});

// The interpreter's structured-output schema must stay inside what the
// schema compiler supports: nullable unions as anyOf only. A `type` array or
// a null inside an enum gets EVERY call rejected — this exact shape broke
// Tell-OS in the field on Aug 10; pin it so it can't come back.
test('interpreter + unified chat schemas use only supported nullable shapes', async () => {
  const { JSON_SCHEMA } = await import('../server/intelligence/interpret.ts');
  const { UNIFIED_SCHEMA } = await import('../server/intelligence/chat.ts');
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    assert.ok(!Array.isArray(record.type), `type array at ${path} — use anyOf`);
    if (Array.isArray(record.enum)) {
      assert.ok(!record.enum.includes(null), `null inside enum at ${path} — use anyOf`);
    }
    for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`);
  };
  walk(JSON_SCHEMA, 'JSON_SCHEMA');
  walk(UNIFIED_SCHEMA, 'UNIFIED_SCHEMA');
});
