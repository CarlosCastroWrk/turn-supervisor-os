import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAUNCH_SYNTHETIC_BLOCKERS,
  LAUNCH_SYNTHETIC_CONTEXT,
  LAUNCH_SYNTHETIC_GOAL,
  LAUNCH_SYNTHETIC_NOTIFICATIONS,
  LAUNCH_SYNTHETIC_SEARCH_GROUPS,
} from '../src/features/launch-command-center/fixtures.ts';
import {
  calculateDailyGoalProgress,
  filterLaunchNotifications,
  filterLaunchSearchGroups,
} from '../src/features/launch-command-center/model.ts';
import {
  LAUNCH_NOTIFICATION_TABS,
  LAUNCH_PRIMARY_NAVIGATION,
  LAUNCH_QUICK_ACTIONS,
} from '../src/features/launch-command-center/types.ts';

test('primary navigation is locked to Home, TurnBoard, central Add, Activity, and More', () => {
  assert.deepEqual(
    LAUNCH_PRIMARY_NAVIGATION.map(({ id, label, kind }) => ({ id, label, kind })),
    [
      { id: 'home', label: 'Home', kind: 'destination' },
      { id: 'turnboard', label: 'TurnBoard', kind: 'destination' },
      { id: 'plus', label: 'Add', kind: 'action' },
      { id: 'crews', label: 'Crews', kind: 'destination' },
      { id: 'more', label: 'More', kind: 'destination' },
    ],
  );
  assert.deepEqual(LAUNCH_QUICK_ACTIONS.map(({ label }) => label), [
    'Paste your memo',
    'Assign crews',
    'Start walk',
    'End day',
  ]);
});

test('daily goal progress is deterministic, rounded, and bounded', () => {
  assert.equal(calculateDailyGoalProgress(18, 32), 56);
  assert.equal(calculateDailyGoalProgress(40, 32), 100);
  assert.equal(calculateDailyGoalProgress(-5, 32), 0);
  assert.equal(calculateDailyGoalProgress(5, 0), 0);
  assert.equal(calculateDailyGoalProgress(Number.NaN, 10), 0);
  assert.equal(LAUNCH_SYNTHETIC_GOAL.metric, 'Sections');
  assert.equal(LAUNCH_SYNTHETIC_GOAL.milestone, 'Los inspected');
});

test('Search returns grouped read-only matches without changing source fixtures', () => {
  const before = JSON.stringify(LAUNCH_SYNTHETIC_SEARCH_GROUPS);
  const paintMatches = filterLaunchSearchGroups(LAUNCH_SYNTHETIC_SEARCH_GROUPS, 'paint');
  const unitMatches = filterLaunchSearchGroups(LAUNCH_SYNTHETIC_SEARCH_GROUPS, '602');

  assert.ok(paintMatches.length > 0);
  assert.ok(paintMatches.every((group) => group.results.length > 0));
  assert.ok(unitMatches.some((group) => group.id === 'units'));
  assert.equal(
    unitMatches.flatMap((group) => group.results).some((result) => result.title === 'Unit 602'),
    true,
  );
  assert.equal(JSON.stringify(LAUNCH_SYNTHETIC_SEARCH_GROUPS), before);
});

test('Notifications expose only the approved tabs and deterministic filters', () => {
  assert.deepEqual(LAUNCH_NOTIFICATION_TABS.map(({ label }) => label), [
    'All',
    'Inspections',
    'Callbacks',
    'Conflicts',
  ]);
  assert.equal(
    filterLaunchNotifications(LAUNCH_SYNTHETIC_NOTIFICATIONS, 'callbacks').length,
    1,
  );
  assert.ok(
    filterLaunchNotifications(LAUNCH_SYNTHETIC_NOTIFICATIONS, 'inspections')
      .every((item) => item.category === 'inspections'),
  );
  assert.ok(LAUNCH_SYNTHETIC_NOTIFICATIONS.every((item) => item.destinationLabel));
});

test('all committed Track A fixtures are visibly synthetic and operationally non-authoritative', () => {
  assert.match(LAUNCH_SYNTHETIC_CONTEXT.propertyName, /Synthetic/);
  assert.ok(LAUNCH_SYNTHETIC_BLOCKERS.every((item) => item.id.startsWith('synthetic-')));
  assert.ok(LAUNCH_SYNTHETIC_NOTIFICATIONS.every((item) => item.id.startsWith('synthetic-')));
  assert.equal(
    /tenant|signature|w-9|paycard|payroll/i.test(JSON.stringify({
      blockers: LAUNCH_SYNTHETIC_BLOCKERS,
      notifications: LAUNCH_SYNTHETIC_NOTIFICATIONS,
      search: LAUNCH_SYNTHETIC_SEARCH_GROUPS,
    })),
    false,
  );
});
