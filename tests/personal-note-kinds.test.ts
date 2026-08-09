import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  appendPersonalNoteActivity,
  deletePersonalNoteActivity,
  editPersonalNoteActivity,
  isPersonalNoteAction,
  noteKindForAction,
  PERSONAL_NOTE_ACTIONS,
  PERSONAL_NOTE_ACTIVITY_ACTION,
  projectPersonalNoteActivity,
} from '../src/features/wave2a1-native/track-c/personalActivity.ts';

const unitId = seedData.units[0].id;

test('note kind maps to a distinct action string and round-trips', () => {
  assert.equal(PERSONAL_NOTE_ACTIVITY_ACTION, PERSONAL_NOTE_ACTIONS.note);
  assert.equal(noteKindForAction(PERSONAL_NOTE_ACTIONS['change-order']), 'change-order');
  assert.equal(noteKindForAction(PERSONAL_NOTE_ACTIONS.reminder), 'reminder');
  assert.equal(noteKindForAction(PERSONAL_NOTE_ACTIONS.texture), 'texture');
  assert.equal(noteKindForAction(PERSONAL_NOTE_ACTIONS.drywall), 'drywall');
  // Unknown / legacy actions read back as a plain note, never crash.
  assert.equal(noteKindForAction('some other activity'), 'note');
  assert.equal(isPersonalNoteAction('some other activity'), false);
});

test('appendPersonalNoteActivity stamps the chosen kind (default note)', () => {
  const plain = appendPersonalNoteActivity(seedData, { unitId, wording: 'Plain note' });
  assert.ok(plain.ok && plain.activity.action === PERSONAL_NOTE_ACTIONS.note);

  const change = appendPersonalNoteActivity(seedData, { kind: 'change-order', unitId, wording: 'Tub resurface' });
  assert.ok(change.ok && change.activity.action === PERSONAL_NOTE_ACTIONS['change-order']);

  const reminder = appendPersonalNoteActivity(seedData, { kind: 'reminder', unitId, wording: 'Joseph adding common' });
  assert.ok(reminder.ok && reminder.activity.action === PERSONAL_NOTE_ACTIONS.reminder);
});

test('all note kinds project as notes together', () => {
  let data = seedData;
  data = appendPersonalNoteActivity(data, { kind: 'change-order', unitId, wording: 'CO' }).data;
  data = appendPersonalNoteActivity(data, { kind: 'reminder', unitId, wording: 'RM' }).data;
  data = appendPersonalNoteActivity(data, { unitId, wording: 'NN' }).data;
  const notes = projectPersonalNoteActivity(data);
  const kinds = notes.map((note) => noteKindForAction(note.action));
  assert.ok(kinds.includes('change-order'));
  assert.ok(kinds.includes('reminder'));
  assert.ok(kinds.includes('note'));
});

test('editPersonalNoteActivity rewrites text, guards empty and missing', () => {
  const added = appendPersonalNoteActivity(seedData, { unitId, wording: 'before' });
  assert.ok(added.ok);
  const id = added.activity.id;

  const empty = editPersonalNoteActivity(added.data, id, '   ');
  assert.equal(empty.ok, false);

  const missing = editPersonalNoteActivity(added.data, 'no-such-id', 'x');
  assert.equal(missing.ok, false);

  const ok = editPersonalNoteActivity(added.data, id, 'after');
  assert.ok(ok.ok);
  assert.equal(ok.data.activityLogs.find((log) => log.id === id)?.note, 'after');
});

test('delete removes a note but can NEVER remove a non-note activity record', () => {
  const added = appendPersonalNoteActivity(seedData, { unitId, wording: 'temp' });
  assert.ok(added.ok);
  const id = added.activity.id;

  const removed = deletePersonalNoteActivity(added.data, id);
  assert.ok(removed.ok);
  assert.equal(removed.data.activityLogs.some((log) => log.id === id), false);

  // A non-note activity log (e.g. a real work/audit record) is protected: the
  // note-delete path refuses it, so payroll-adjacent history is never dropped here.
  const foreign = {
    ...added.activity,
    id: 'activity-foreign',
    action: 'Recorded crew work',
    note: 'do not delete',
  };
  const withForeign = { ...added.data, activityLogs: [foreign, ...added.data.activityLogs] };
  const blocked = deletePersonalNoteActivity(withForeign, 'activity-foreign');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.data.activityLogs.some((log) => log.id === 'activity-foreign'), true);
});
