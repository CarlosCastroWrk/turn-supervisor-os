import assert from 'node:assert/strict';
import test from 'node:test';
import portalPublish from '../api/portal/publish.ts';
import portalView from '../api/portal/view.ts';
import portalSetup from '../api/portal/setup.ts';

// The portal is outward-facing: publish/setup must be locked to the signed-in
// allowed user (or the admin token), and view must reject any caller without
// the share token. These tests pin those gates.

test('portal publish rejects a request with no Authorization header (401)', async () => {
  const response = await portalPublish.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/portal/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }),
  );
  assert.equal(response.status, 401);
});

test('portal publish rejects a non-POST method (405)', async () => {
  const response = await portalPublish.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/portal/publish', { method: 'GET' }),
  );
  assert.equal(response.status, 405);
});

test('portal view rejects a missing or wrong token (401)', async () => {
  const noToken = await portalView.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/portal/view'),
  );
  assert.equal(noToken.status, 401);
  const wrongToken = await portalView.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/portal/view?k=not-the-token'),
  );
  assert.equal(wrongToken.status, 401);
});

test('portal setup rejects an unauthenticated caller (401)', async () => {
  const response = await portalSetup.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/portal/setup', { method: 'POST' }),
  );
  assert.equal(response.status, 401);
});

test('walk requests need the share token to write and Los auth to read', async () => {
  const requestWalk = (await import('../api/portal/request-walk.ts')).default;
  const requests = (await import('../api/portal/requests.ts')).default;
  const write = await requestWalk.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/portal/request-walk?k=wrong', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Joseph', units: ['1205'] }),
    }),
  );
  assert.equal(write.status, 401);
  const read = await requests.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/portal/requests'),
  );
  assert.equal(read.status, 401);
});

test('portal view never serves data when the token env is unset', async () => {
  // With TURN_OS_PORTAL_TOKEN absent in tests, every candidate must fail —
  // an unconfigured portal is a closed portal.
  const response = await portalView.fetch(
    new Request('https://turn-supervisor-os.vercel.app/api/portal/view?k='),
  );
  assert.equal(response.status, 401);
});
