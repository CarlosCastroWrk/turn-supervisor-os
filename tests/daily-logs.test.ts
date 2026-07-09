import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { upsertDailyLog } from '../src/lib/actions.ts';
import {
  buildDailyLogId,
  createEmptyDailyLog,
  findDailyLog,
  reconcileDailyLogs,
} from '../src/lib/dailyLogs.ts';
import type { AppData, DailyLog } from '../src/types.ts';

const projectId = 'project_daily_log_qa';
const date = '2026-07-09';

const dailyLog = (id: string, updatedAt: string, completedSummary: string): DailyLog => ({
  ...createEmptyDailyLog(projectId, date, '2026-07-09T08:00:00.000Z'),
  id,
  completedSummary,
  updatedAt,
});

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

test('new Daily Logs use one deterministic id per project and date', () => {
  const first = createEmptyDailyLog(projectId, date, '2026-07-09T08:00:00.000Z');
  const second = createEmptyDailyLog(projectId, date, '2026-07-09T09:00:00.000Z');

  assert.equal(first.id, buildDailyLogId(projectId, date));
  assert.equal(second.id, first.id);
  assert.notEqual(buildDailyLogId(projectId, '2026-07-10'), first.id);
  assert.notEqual(buildDailyLogId('project_other', date), first.id);
});

test('upsertDailyLog preserves a legacy cloud identity and collapses local tuple duplicates', () => {
  const data = cloneSeed();
  const olderLegacy = dailyLog('daily_legacy_old', '2026-07-09T08:10:00.000Z', 'Older copy');
  const newerLegacy = dailyLog('daily_legacy_cloud', '2026-07-09T08:20:00.000Z', 'Cloud copy');
  data.dailyLogs = [olderLegacy, newerLegacy];

  const incoming = {
    ...createEmptyDailyLog(projectId, date, '2026-07-09T08:30:00.000Z'),
    completedSummary: 'Los reviewed this copy',
  };
  const result = upsertDailyLog(data, incoming);
  const matching = result.dailyLogs.filter((log) => log.projectId === projectId && log.date === date);

  assert.equal(matching.length, 1);
  assert.equal(matching[0]?.id, newerLegacy.id);
  assert.equal(matching[0]?.createdAt, newerLegacy.createdAt);
  assert.equal(matching[0]?.completedSummary, 'Los reviewed this copy');
  assert.equal(result.activityLogs[0]?.entityId, newerLegacy.id);
});

test('sync reconciliation remaps a newer offline deterministic log onto the existing cloud row', () => {
  const local = dailyLog(buildDailyLogId(projectId, date), '2026-07-09T12:10:00.000Z', 'Newer iPad summary');
  const remote = dailyLog('daily_legacy_cloud', '2026-07-09T12:00:00.000Z', 'Older Mac summary');

  const result = reconcileDailyLogs([local], [remote]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, remote.id);
  assert.equal(result[0]?.createdAt, remote.createdAt);
  assert.equal(result[0]?.completedSummary, local.completedSummary);
  assert.equal(result[0]?.updatedAt, local.updatedAt);
});

test('sync reconciliation keeps a newer cloud Daily Log over a stale offline copy', () => {
  const local = dailyLog(buildDailyLogId(projectId, date), '2026-07-09T12:00:00.000Z', 'Stale phone summary');
  const remote = dailyLog('daily_legacy_cloud', '2026-07-09T12:10:00.000Z', 'Newer cloud summary');

  const result = reconcileDailyLogs([local], [remote]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, remote.id);
  assert.equal(result[0]?.completedSummary, remote.completedSummary);
  assert.equal(result[0]?.updatedAt, remote.updatedAt);
});

test('same-id same-time Daily Log conflicts settle on the same content in either device order', () => {
  const id = buildDailyLogId(projectId, date);
  const mac = dailyLog(id, '2026-07-09T12:00:00.000Z', 'Mac summary');
  const ipad = dailyLog(id, '2026-07-09T12:00:00.000Z', 'iPad summary');

  assert.deepEqual(reconcileDailyLogs([mac], [ipad]), reconcileDailyLogs([ipad], [mac]));
});

test('three offline devices converge to one Daily Log across every reconnect order', () => {
  const deterministicId = buildDailyLogId(projectId, date);
  const devices = [
    [dailyLog(deterministicId, '2026-07-09T12:05:00.000Z', 'Mac summary')],
    [dailyLog(deterministicId, '2026-07-09T12:10:00.000Z', 'iPhone summary')],
    [dailyLog(deterministicId, '2026-07-09T12:15:00.000Z', 'iPad newest summary')],
  ];
  const reconnectOrders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];

  reconnectOrders.forEach((order) => {
    let cloud = [dailyLog('daily_legacy_cloud', '2026-07-09T12:00:00.000Z', 'Legacy cloud summary')];
    order.forEach((deviceIndex) => {
      cloud = reconcileDailyLogs(devices[deviceIndex], cloud);
    });

    assert.equal(cloud.length, 1);
    assert.equal(cloud[0]?.id, 'daily_legacy_cloud');
    assert.equal(cloud[0]?.completedSummary, 'iPad newest summary');
    devices.forEach((device) => {
      assert.deepEqual(reconcileDailyLogs(device, cloud), cloud);
    });
  });
});

test('Daily Log reconciliation stays project/date scoped and bounded at field-history scale', () => {
  const logs = Array.from({ length: 5_000 }, (_, index) => {
    const logDate = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
    return {
      ...createEmptyDailyLog(`project_${index % 20}`, logDate, '2026-07-09T12:00:00.000Z'),
      completedSummary: `Log ${index}`,
    };
  });
  const startedAt = performance.now();
  const reconciled = reconcileDailyLogs(logs, []);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(reconciled.length, logs.length);
  assert.equal(findDailyLog(reconciled, 'project_missing', date), undefined);
  assert.ok(elapsedMs < 2_000, `Expected 5,000 Daily Logs to reconcile under 2s; received ${elapsedMs.toFixed(1)}ms.`);
});
