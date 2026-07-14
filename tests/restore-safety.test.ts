import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { restoreBlockReason } from '../src/lib/restoreSafety.ts';

test('backup restore waits until Supabase auth state is known', () => {
  assert.match(restoreBlockReason({ authReady: false, signedIn: false }), /Wait for the sync sign-in check/);
});

test('backup restore requires sign-out while a Supabase session is active', () => {
  assert.match(restoreBlockReason({ authReady: true, signedIn: true }), /Sign out of Supabase sync/);
});

test('backup restore unlocks only after auth is resolved and signed out', () => {
  assert.equal(restoreBlockReason({ authReady: true, signedIn: false }), '');
});

test('backup restore invalidates cache ownership before replacing local records', () => {
  const source = readFileSync(new URL('../src/views/ExportView.tsx', import.meta.url), 'utf8');
  const restoreStart = source.indexOf('const restoreBackup');
  const ownerClear = source.indexOf('clearLocalCacheOwner()', restoreStart);
  const dataReplacement = source.indexOf('setData(restored)', restoreStart);

  assert.ok(restoreStart >= 0);
  assert.ok(ownerClear > restoreStart);
  assert.ok(dataReplacement > ownerClear);
});
