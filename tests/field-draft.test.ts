import assert from 'node:assert/strict';
import test from 'node:test';
import { createFieldDraftStore, type FieldDraftStorage } from '../src/lib/fieldDraft.ts';

const memoryStorage = (): FieldDraftStorage & { values: Map<string, string> } => {
  const values = new Map<string, string>();
  return {
    values,
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => {
      values.delete(key);
    },
  };
};

test('field draft store restores a draft only while its source value is unchanged', () => {
  const storage = memoryStorage();
  const store = createFieldDraftStore(storage);

  assert.equal(store.write('project:one:name', 'Original', 'Walkthrough Turn'), true);
  assert.equal(store.read('project:one:name', 'Original'), 'Walkthrough Turn');
  assert.equal(store.read('project:one:name', 'Cloud Changed'), undefined);
  assert.equal(storage.values.size, 0);
});

test('field draft store clears committed and malformed drafts safely', () => {
  const storage = memoryStorage();
  const store = createFieldDraftStore(storage);

  store.write('unit:one:notes', '', 'Keys missing');
  store.clear('unit:one:notes');
  assert.equal(store.read('unit:one:notes', ''), undefined);

  storage.values.set('turn-supervisor-os:field-draft:unit:one:notes', '{bad json');
  assert.equal(store.read('unit:one:notes', ''), undefined);
  assert.equal(storage.values.size, 0);
});

test('field draft cleanup removes only Turn Field Copilot draft keys', () => {
  const storage = memoryStorage();
  const store = createFieldDraftStore(storage);

  store.write('project:one:name', 'Original', 'Draft');
  store.write('unit:one:notes', '', 'Keys missing');
  storage.values.set('unrelated-session-key', 'keep me');

  assert.equal(store.clearAll(), 2);
  assert.deepEqual([...storage.values.entries()], [['unrelated-session-key', 'keep me']]);
});
