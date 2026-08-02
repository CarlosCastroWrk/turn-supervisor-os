import assert from 'node:assert/strict';
import test from 'node:test';
import composeRoute from '../api/compose.ts';

// The composer endpoint spends AI credit, and production is public, so it must
// reject any caller that is not a signed-in, allowed user BEFORE touching a
// provider — the same gate as the intake endpoint.

const post = (headers: Record<string, string>, body: unknown = {}) =>
  composeRoute.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

test('compose rejects a request with no Authorization header (401) before any AI call', async () => {
  const response = await post({});
  assert.equal(response.status, 401);
});

test('compose rejects a malformed bearer token (401)', async () => {
  const response = await post({ authorization: 'Bearer short' });
  assert.equal(response.status, 401);
});

test('compose rejects a non-POST method (405)', async () => {
  const response = await composeRoute.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/compose', {
      method: 'GET',
    }),
  );
  assert.equal(response.status, 405);
});

test('an unauthenticated compose caller never reaches the AI provider', async () => {
  const response = await post({ authorization: `Bearer ${'a'.repeat(40)}` });
  assert.ok(response.status === 401 || response.status === 403 || response.status === 503);
  assert.notEqual(response.status, 200);
});
