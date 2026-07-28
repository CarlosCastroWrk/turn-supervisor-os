import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NATIVE_PAGE_TRANSITION_DURATION_MS,
  calculateNativeDailyGoalProgress,
  filterNativeSearchGroups,
  getNativeHomeSummaryCounts,
  groupNativeNotifications,
  resolveNativePageTransitionPolicy,
  selectNativeHomeSummary,
  type NativeHomeRecord,
  type NativeNotificationItem,
  type NativeSearchGroup,
} from '../src/features/wave2a1-native/track-a/model.ts';

const homeRecords: NativeHomeRecord[] = [
  {
    destinationId: 'unit-101',
    id: '101',
    meta: 'Paint',
    summaryStates: ['working'],
    unitLabel: 'Unit 101',
  },
  {
    destinationId: 'unit-102',
    id: '102',
    meta: 'Clean',
    summaryStates: ['working'],
    unitLabel: 'Unit 102',
  },
  {
    destinationId: 'unit-201',
    id: '201',
    meta: 'Access follow-up',
    summaryStates: ['waiting'],
    unitLabel: 'Unit 201',
  },
  {
    destinationId: 'unit-202',
    id: '202',
    meta: 'Crew follow-up',
    summaryStates: ['waiting'],
    unitLabel: 'Unit 202',
  },
  {
    destinationId: 'unit-301',
    id: '301',
    meta: 'Paint callback',
    summaryStates: ['callbacks'],
    unitLabel: 'Unit 301',
  },
];

test('Working 2 resolves to exactly the two explicitly Working records', () => {
  const snapshot = structuredClone(homeRecords);
  const result = selectNativeHomeSummary(homeRecords, 'working');

  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((record) => record.id), ['101', '102']);
  assert.ok(result.records.every((record) => record.summaryStates.includes('working')));
  assert.deepEqual(homeRecords, snapshot, 'summary selection must not mutate source records');
});

test('Waiting 2 resolves to exactly the two explicitly Waiting records', () => {
  const result = selectNativeHomeSummary(homeRecords, 'waiting');

  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((record) => record.id), ['201', '202']);
  assert.ok(result.records.every((record) => record.summaryStates.includes('waiting')));
});

test('Ready to walk 0 stays empty and never falls back to all Units', () => {
  const result = selectNativeHomeSummary(homeRecords, 'ready-to-walk');
  const counts = getNativeHomeSummaryCounts(homeRecords);

  assert.equal(counts['ready-to-walk'], 0);
  assert.deepEqual(result.records, []);
  assert.equal(result.emptyMessage, 'No Units are ready to walk.');
});

test('daily goal copy always names one metric and one milestone deterministically', () => {
  const progress = calculateNativeDailyGoalProgress({
    metric: 'sections',
    milestone: 'los-inspected',
    target: 40,
  }, 21);

  assert.deepEqual(progress, {
    actual: 21,
    metric: 'sections',
    milestone: 'los-inspected',
    percentage: 53,
    progressCopy: '21 of 40 sections inspected',
    target: 40,
  });
  assert.equal(
    calculateNativeDailyGoalProgress({
      metric: 'units',
      milestone: 'ready-to-walk',
      target: 1,
    }, 1).progressCopy,
    '1 of 1 unit ready to walk',
  );
});

test('Search returns only matching Units, Crews, and Activity records without mutation', () => {
  const groups: NativeSearchGroup[] = [
    {
      id: 'units',
      results: [{ destinationId: 'unit-202', id: 'u-202', title: 'Unit 202', meta: 'Paint' }],
    },
    {
      id: 'crews',
      results: [{ destinationId: 'crew-jose', id: 'c-jose', title: 'Jose', meta: 'Paint crew' }],
    },
    {
      id: 'activity',
      results: [{
        destinationId: 'activity-1',
        id: 'a-1',
        keywords: ['unit 202'],
        title: 'Walk note',
        meta: 'Paint touch-up',
      }],
    },
  ];
  const snapshot = structuredClone(groups);

  const result = filterNativeSearchGroups(groups, '202');

  assert.deepEqual(result.map((group) => group.id), ['units', 'activity']);
  assert.deepEqual(result.flatMap((group) => group.results.map((item) => item.id)), ['u-202', 'a-1']);
  assert.deepEqual(groups, snapshot);
});

test('Notifications honor approved tabs and Important, Today, Earlier ordering', () => {
  const items: NativeNotificationItem[] = [
    {
      category: 'callbacks',
      destinationId: 'unit-301',
      destinationLabel: 'Unit 301',
      group: 'today',
      id: 'callback-301',
      read: false,
      reason: 'Paint touch-up to inspect',
      timeLabel: '10:20 AM',
      title: 'Unit 301 callback',
    },
    {
      category: 'inspections',
      destinationId: 'unit-101',
      destinationLabel: 'Unit 101',
      group: 'important',
      id: 'inspection-101',
      read: false,
      reason: 'Crew reported complete',
      timeLabel: 'Now',
      title: 'Unit 101 ready for my walk',
    },
    {
      category: 'conflicts',
      destinationId: 'unit-202',
      destinationLabel: 'Unit 202',
      group: 'earlier',
      id: 'conflict-202',
      read: true,
      reason: 'Assignment follow-up',
      timeLabel: 'Yesterday',
      title: 'Unit 202 needs review',
    },
  ];

  const all = groupNativeNotifications(items, 'all');
  assert.deepEqual(all.map((group) => group.id), ['important', 'today', 'earlier']);
  assert.deepEqual(
    groupNativeNotifications(items, 'callbacks').flatMap((group) => group.items.map((item) => item.id)),
    ['callback-301'],
  );
});

test('page motion stays within 180–240ms and disables for reduced motion', () => {
  assert.ok(NATIVE_PAGE_TRANSITION_DURATION_MS >= 180);
  assert.ok(NATIVE_PAGE_TRANSITION_DURATION_MS <= 240);
  assert.deepEqual(resolveNativePageTransitionPolicy(true), {
    durationMs: 0,
    easing: 'linear',
    translatePx: 0,
  });
  assert.equal(resolveNativePageTransitionPolicy(false).durationMs, 210);
});
