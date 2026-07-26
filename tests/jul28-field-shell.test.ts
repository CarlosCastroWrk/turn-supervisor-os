import assert from 'node:assert/strict';
import test from 'node:test';
import { JUL28_SYNTHETIC_FIELD_SHELL } from '../src/features/jul28-field-shell/fixtures.ts';
import {
  FIELD_NAVIGATION,
  groupNeedsMeItems,
  orderFieldTasks,
  summarizeNeedsMe,
  validateFieldShellModel,
} from '../src/features/jul28-field-shell/projection.ts';

test('July 28 navigation contains exactly Today, TurnBoard, and More', () => {
  assert.deepEqual(FIELD_NAVIGATION, [
    { id: 'today', label: 'Today' },
    { id: 'turnboard', label: 'TurnBoard' },
    { id: 'more', label: 'More' },
  ]);
  assert.ok(!FIELD_NAVIGATION.some((item) => item.label === 'Queue'));
});

test('synthetic field shell keeps Current, Next, and Backup in personal order', () => {
  const ordered = orderFieldTasks(JUL28_SYNTHETIC_FIELD_SHELL.tasks);
  assert.deepEqual(ordered.map((task) => task.slot), ['current', 'next', 'backup']);
  assert.deepEqual(ordered.map((task) => task.unitNumber), ['602', '603', '604']);
  assert.deepEqual(validateFieldShellModel(JUL28_SYNTHETIC_FIELD_SHELL), []);
});

test('Needs Me projection keeps factual categories separate', () => {
  const groups = groupNeedsMeItems(JUL28_SYNTHETIC_FIELD_SHELL.needsMe);
  assert.deepEqual(groups.map((group) => group.category), [
    'ready-for-my-walk',
    'missing-follow-up-owner',
    'needs-paper-review',
    'saved-on-this-device',
  ]);
  assert.deepEqual(summarizeNeedsMe(JUL28_SYNTHETIC_FIELD_SHELL.needsMe).map((item) => item.count), [1, 1, 1, 1]);
});

test('fixtures use only Paint, Clean, Common, and A through E', () => {
  const trades = new Set([
    ...JUL28_SYNTHETIC_FIELD_SHELL.tasks.map((task) => task.trade).filter(Boolean),
    ...JUL28_SYNTHETIC_FIELD_SHELL.needsMe.map((item) => item.trade).filter(Boolean),
  ]);
  assert.deepEqual([...trades].sort(), ['Clean', 'Paint']);
  assert.ok(
    JUL28_SYNTHETIC_FIELD_SHELL.tasks.flatMap((task) => task.scope)
      .every((section) => ['Common', 'A', 'B', 'C', 'D', 'E'].includes(section)),
  );
});

test('candidate copy does not invent official completion, approval, or payroll facts', () => {
  const fixtureText = JSON.stringify(JUL28_SYNTHETIC_FIELD_SHELL);
  assert.doesNotMatch(fixtureText, /PDS Approved|payroll|client approval|officially complete/i);
  assert.doesNotMatch(fixtureText, /\bdone\b/i);
});
