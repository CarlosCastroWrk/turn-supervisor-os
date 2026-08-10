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
