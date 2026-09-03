import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  APP_DATA_STORAGE_KEY,
  didAnotherTabWrite,
  installForeignWriteGuard,
  persistAppDataNow,
  restoreAppDataNow,
} from '../src/lib/storage.ts';

// One fake document: a localStorage plus the 'storage' listener the guard
// registers. Firing the listener by hand = "another tab wrote the key".
const store = new Map<string, string>();
let storageListener: ((event: { key: string | null; newValue: string | null }) => void) | undefined;
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    addEventListener: (type: string, listener: typeof storageListener) => {
      if (type === 'storage') storageListener = listener;
    },
    removeEventListener: () => undefined,
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  },
});

test('a single tab is never affected: its own writes and unrelated keys do not trip the guard', () => {
  let detected = 0;
  installForeignWriteGuard(() => { detected += 1; });
  assert.ok(storageListener, 'guard listens for storage events');
  assert.equal(persistAppDataNow(seedData), true);
  const ours = store.get(APP_DATA_STORAGE_KEY);
  assert.ok(ours);

  storageListener?.({ key: 'turn-os:chat-threads-v1', newValue: 'x' });
  storageListener?.({ key: APP_DATA_STORAGE_KEY, newValue: ours ?? null });
  storageListener?.({ key: APP_DATA_STORAGE_KEY, newValue: null });
  assert.equal(detected, 0);
  assert.equal(didAnotherTabWrite(), false);
  assert.equal(persistAppDataNow(seedData), true, 'saving still works');
});

test('a write from another tab makes this tab read-only until reload', () => {
  let detected = 0;
  installForeignWriteGuard(() => { detected += 1; });
  storageListener?.({ key: APP_DATA_STORAGE_KEY, newValue: '{"activeProjectId":"someone-else"}' });
  assert.equal(detected, 1, 'host is told once');
  assert.equal(didAnotherTabWrite(), true);

  const before = store.get(APP_DATA_STORAGE_KEY);
  assert.equal(persistAppDataNow(seedData), false, 'saves are refused');
  assert.equal(restoreAppDataNow(seedData), false, 'restores are refused too');
  assert.equal(store.get(APP_DATA_STORAGE_KEY), before, 'the other tab\'s ledger is untouched');

  storageListener?.({ key: APP_DATA_STORAGE_KEY, newValue: '{"activeProjectId":"again"}' });
  assert.equal(detected, 1, 'a second foreign write does not re-alert');
});
