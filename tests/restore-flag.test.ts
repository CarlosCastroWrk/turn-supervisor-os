import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  APP_DATA_STORAGE_KEY,
  didLastRestoreFail,
  persistAppDataNow,
  restoreAppDataNow,
} from '../src/lib/storage.ts';

// A backup restore that cannot be verified must not poison the running app.
// It used to flip the same flag as "stored data is corrupt", so every ordinary
// save after one bad restore file was refused until reload. Now the previous
// ledger goes back in place and saves keep working.

const store = new Map<string, string>();
// Arm this to simulate a write that did not land the way it was sent — the
// readback then disagrees with what restore wrote, which is the failure mode.
let corruptNextWrite = false;
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (corruptNextWrite && key === APP_DATA_STORAGE_KEY) {
          corruptNextWrite = false;
          store.set(key, 'not what was written');
          return;
        }
        store.set(key, value);
      },
      removeItem: (key: string) => { store.delete(key); },
    },
  },
});

test('a restore that fails verification puts the previous ledger back and leaves saves working', () => {
  assert.equal(persistAppDataNow(seedData), true);
  const before = store.get(APP_DATA_STORAGE_KEY);
  assert.ok(before);

  corruptNextWrite = true;
  assert.equal(restoreAppDataNow(seedData), false, 'restore reports failure');
  assert.equal(didLastRestoreFail(), true);
  assert.equal(store.get(APP_DATA_STORAGE_KEY), before, 'previous ledger is back in place');

  assert.equal(persistAppDataNow(seedData), true, 'ordinary saves still work — no reload needed');
});

test('a good restore clears the failure flag', () => {
  assert.equal(restoreAppDataNow(seedData), true);
  assert.equal(didLastRestoreFail(), false);
});
