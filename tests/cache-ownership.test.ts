import assert from 'node:assert/strict';
import test from 'node:test';
import { clearAppData } from '../src/lib/storage.ts';
import {
  assertSyncIdentity,
  cacheBelongsToUser,
  clearLastAuthenticatedUserId,
  clearLocalCacheOwner,
  getLastAuthenticatedUserId,
  getLocalCacheOwner,
  setLastAuthenticatedUserId,
  setLocalCacheOwner,
  SyncSessionChangedError,
} from '../src/lib/supabase/cacheOwnership.ts';
import { createSessionBoundSupabaseClient } from '../src/lib/supabase/client.ts';

const storage = new Map<string, string>();
const storageApi = {
  get length() {
    return storage.size;
  },
  getItem: (key: string) => storage.get(key) ?? null,
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { localStorage: storageApi, sessionStorage: storageApi },
});

test('only the durably linked account can use a local cache', () => {
  storage.clear();
  clearLocalCacheOwner();
  assert.equal(cacheBelongsToUser('user-a'), false);
  assert.equal(setLocalCacheOwner('user-a'), true);
  assert.equal(getLocalCacheOwner(), 'user-a');
  assert.equal(cacheBelongsToUser('user-a'), true);
  assert.equal(cacheBelongsToUser('user-b'), false);
});

test('last authenticated account continuity is durable, opaque, and independently clearable', () => {
  storage.clear();
  assert.equal(getLastAuthenticatedUserId(), null);
  assert.equal(setLastAuthenticatedUserId('user-a'), true);
  assert.equal(getLastAuthenticatedUserId(), 'user-a');
  assert.equal(clearLastAuthenticatedUserId(), true);
  assert.equal(getLastAuthenticatedUserId(), null);
});

test('session generation and cache owner must both match throughout a sync run', () => {
  storage.clear();
  setLocalCacheOwner('user-a');
  const identity = { generation: 4, userId: 'user-a' };

  assert.doesNotThrow(() => assertSyncIdentity(identity, 'user-a', 4));
  assert.throws(() => assertSyncIdentity(identity, 'user-b', 5), SyncSessionChangedError);
  assert.throws(() => assertSyncIdentity(identity, 'user-a', 5), SyncSessionChangedError);
  clearLocalCacheOwner();
  assert.throws(() => assertSyncIdentity(identity, 'user-a', 4), SyncSessionChangedError);
});

test('a session-bound sync client keeps the access token captured for its run', async () => {
  let authorization = '';
  const client = createSessionBoundSupabaseClient(
    'https://example.supabase.co',
    'anon-key',
    'account-a-token',
    async (_input, init) => {
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      return new Response('[]', {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    },
  );

  const { error } = await client.from('projects').select('id');
  assert.equal(error, null);
  assert.equal(authorization, 'Bearer account-a-token');
});

test('ownership writes and cleanup fail closed when browser storage rejects them', () => {
  const originalStorage = window.localStorage;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    },
  });

  try {
    assert.equal(setLocalCacheOwner('user-a'), false);
    assert.equal(setLastAuthenticatedUserId('user-a'), false);
    assert.equal(clearLocalCacheOwner(), false);
    assert.equal(clearLastAuthenticatedUserId(), false);
    assert.equal(cacheBelongsToUser('user-a'), false);
  } finally {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalStorage });
  }
});

test('device reset clears both app records and cache ownership', async () => {
  storage.clear();
  storage.set('turn-supervisor-os:v0.1', '{"projects":[]}');
  setLocalCacheOwner('user-a');
  setLastAuthenticatedUserId('user-a');

  assert.equal(await clearAppData(), true);
  assert.equal(storage.has('turn-supervisor-os:v0.1'), false);
  assert.equal(getLocalCacheOwner(), null);
  assert.equal(getLastAuthenticatedUserId(), null);
});
