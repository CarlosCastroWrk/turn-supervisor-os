import assert from 'node:assert/strict';
import test from 'node:test';
import { JUL28_SYNTHETIC_FIELD_SHELL } from '../src/features/jul28-field-shell/fixtures.ts';
import {
  FIELD_NAVIGATION,
  NEEDS_ME_CATEGORY_ORDER,
  NEEDS_ME_LABELS,
  groupNeedsMeItems,
  orderPersonalPlan,
  summarizeNeedsMe,
  validateFieldShellModel,
} from '../src/features/jul28-field-shell/projection.ts';

const LOCKED_NEEDS_ME_LABELS = [
  'Needs Confirmation',
  'Needs My Inspection',
  'Callbacks',
  'Property Walks',
  'Assignment Conflicts',
  'Access Blockers',
  'Maintenance Blockers',
  'Save or Sync Problems',
  'Paper Reconciliation',
];

test('July 28 navigation contains exactly Today, TurnBoard, and More', () => {
  assert.deepEqual(FIELD_NAVIGATION, [
    { id: 'today', label: 'Today' },
    { id: 'turnboard', label: 'TurnBoard' },
    { id: 'more', label: 'More' },
  ]);
  assert.ok(!FIELD_NAVIGATION.some((item) => item.label === 'Queue'));
});

test('Today includes an explicit synthetic property and date', () => {
  assert.equal(JUL28_SYNTHETIC_FIELD_SHELL.context.propertyName, 'Juniper House (Synthetic)');
  assert.equal(JUL28_SYNTHETIC_FIELD_SHELL.context.dateISO, '2026-07-28');
  assert.equal(JUL28_SYNTHETIC_FIELD_SHELL.context.dateLabel, 'Tuesday, July 28, 2026');
});

test('personal Now, Next, and Backup remain concise while daily work supports variable counts', () => {
  const ordered = orderPersonalPlan(JUL28_SYNTHETIC_FIELD_SHELL.personalPlan);
  assert.deepEqual(ordered.map((entry) => entry.slot), ['now', 'next', 'backup']);
  assert.deepEqual(ordered.map((entry) => entry.task?.unitNumber), ['602', '603', '607']);
  assert.equal(JUL28_SYNTHETIC_FIELD_SHELL.assignedWork.length, 2);
  assert.equal(JUL28_SYNTHETIC_FIELD_SHELL.progressingWork.length, 2);

  const variableWorkModel = {
    ...JUL28_SYNTHETIC_FIELD_SHELL,
    personalPlan: { now: JUL28_SYNTHETIC_FIELD_SHELL.personalPlan.now },
    assignedWork: [
      ...JUL28_SYNTHETIC_FIELD_SHELL.assignedWork,
      {
        ...JUL28_SYNTHETIC_FIELD_SHELL.assignedWork[0],
        id: 'assigned-variable-count',
        unitNumber: '614',
      },
    ],
    progressingWork: [],
  };

  assert.deepEqual(orderPersonalPlan(variableWorkModel.personalPlan).map((entry) => Boolean(entry.task)), [true, false, false]);
  assert.deepEqual(validateFieldShellModel(variableWorkModel), []);
  assert.deepEqual(validateFieldShellModel(JUL28_SYNTHETIC_FIELD_SHELL), []);
});

test('Needs Me supports all nine locked groups in the required order', () => {
  const groups = groupNeedsMeItems(JUL28_SYNTHETIC_FIELD_SHELL.needsMe);
  assert.deepEqual(groups.map((group) => group.category), NEEDS_ME_CATEGORY_ORDER);
  assert.deepEqual(groups.map((group) => group.label), LOCKED_NEEDS_ME_LABELS);
  assert.deepEqual(Object.values(NEEDS_ME_LABELS), LOCKED_NEEDS_ME_LABELS);
  assert.deepEqual(summarizeNeedsMe(JUL28_SYNTHETIC_FIELD_SHELL.needsMe).map((item) => item.count), Array(9).fill(1));
});

test('every Needs Me item carries actionable field context and an exact workspace destination', () => {
  for (const item of JUL28_SYNTHETIC_FIELD_SHELL.needsMe) {
    assert.ok(item.unitNumber.trim(), `${item.id} needs a Unit.`);
    assert.ok(item.whyLosIsNeeded.trim(), `${item.id} needs a reason.`);
    assert.ok(item.responsibleParty?.trim(), `${item.id} needs a known synthetic owner or crew.`);
    assert.ok(item.nextAction.trim(), `${item.id} needs a next action.`);
    assert.ok(item.destination.workspace, `${item.id} needs a workspace id.`);
    assert.ok(item.destination.label.trim(), `${item.id} needs an exact destination label.`);
  }
});

test('Today represents daily work, blockers, walkthroughs, reconciliation, and recent activity', () => {
  const categories = new Set(JUL28_SYNTHETIC_FIELD_SHELL.needsMe.map((item) => item.category));
  for (const category of [
    'needs-my-inspection',
    'callbacks',
    'assignment-conflicts',
    'access-blockers',
    'maintenance-blockers',
    'property-walks',
  ]) {
    assert.ok(categories.has(category), `Today is missing ${category}.`);
  }
  assert.ok(JUL28_SYNTHETIC_FIELD_SHELL.assignedWork.length > 0);
  assert.ok(JUL28_SYNTHETIC_FIELD_SHELL.progressingWork.length > 0);
  assert.equal(JUL28_SYNTHETIC_FIELD_SHELL.nextPropertyWalk.title, 'Next scheduled property walkthrough');
  assert.equal(JUL28_SYNTHETIC_FIELD_SHELL.endOfDayPaperReconciliation.title, 'End-of-day paper reconciliation');
  assert.ok(JUL28_SYNTHETIC_FIELD_SHELL.recentActivity.length > 0);
});

test('fixtures use only Paint, Clean, Common, and A through E', () => {
  const planTasks = Object.values(JUL28_SYNTHETIC_FIELD_SHELL.personalPlan).filter((task) => task !== undefined);
  const trades = new Set([
    ...planTasks.map((task) => task.trade).filter(Boolean),
    ...JUL28_SYNTHETIC_FIELD_SHELL.assignedWork.map((item) => item.trade),
    ...JUL28_SYNTHETIC_FIELD_SHELL.progressingWork.map((item) => item.trade),
    ...JUL28_SYNTHETIC_FIELD_SHELL.needsMe.map((item) => item.trade).filter(Boolean),
  ]);
  const sections = [
    ...planTasks.flatMap((task) => task.scope),
    ...JUL28_SYNTHETIC_FIELD_SHELL.assignedWork.flatMap((item) => item.scope),
    ...JUL28_SYNTHETIC_FIELD_SHELL.progressingWork.flatMap((item) => item.scope),
    ...JUL28_SYNTHETIC_FIELD_SHELL.needsMe.map((item) => item.section).filter(Boolean),
  ];

  assert.deepEqual([...trades].sort(), ['Clean', 'Paint']);
  assert.ok(sections.every((section) => ['Common', 'A', 'B', 'C', 'D', 'E'].includes(section)));
});

test('candidate copy does not invent official completion, approval, or payroll facts', () => {
  const fixtureText = JSON.stringify(JUL28_SYNTHETIC_FIELD_SHELL);
  assert.doesNotMatch(fixtureText, /PDS Approved|payroll|client approval|officially complete/i);
  assert.doesNotMatch(fixtureText, /\bdone\b/i);
});
