import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  ACTIVITY_LOG_RETENTION_LIMIT,
  applyActivityLogRetention,
} from '../src/lib/activityRetention.ts';
import { normalizeAppData } from '../src/lib/dataMigrations.ts';
import type { ActivityLog, AppData } from '../src/types.ts';

const start = Date.parse('2026-07-09T12:00:00.000Z');

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

const activity = (index: number, overrides: Partial<ActivityLog> = {}): ActivityLog => ({
  id: `activity_retention_${String(index).padStart(5, '0')}`,
  projectId: seedData.activeProjectId,
  entityType: 'Unit',
  entityId: 'unit_101',
  action: 'QA activity',
  note: `Retention event ${index}`,
  createdAt: new Date(start + index * 1_000).toISOString(),
  ...overrides,
});

test('Activity retention keeps a deterministic newest 10,000-entry window', () => {
  const overflow = 37;
  const activityLogs = Array.from(
    { length: ACTIVITY_LOG_RETENTION_LIMIT + overflow },
    (_, index) => activity(index),
  );
  const retained = applyActivityLogRetention({ ...cloneSeed(), activityLogs });

  assert.equal(retained.activityLogs.length, ACTIVITY_LOG_RETENTION_LIMIT);
  assert.equal(retained.activityLogs[0]?.id, activityLogs.at(-1)?.id);
  assert.equal(retained.activityLogs.at(-1)?.id, activityLogs[overflow]?.id);
  assert.equal(retained.activityLogs.some((log) => log.id === activityLogs[0]?.id), false);
});

test('Activity retention prioritizes legacy project provenance before ordinary history', () => {
  const ordinaryLogs = Array.from(
    { length: ACTIVITY_LOG_RETENTION_LIMIT },
    (_, index) => activity(index + 1),
  );
  const provenanceLog = activity(0, {
    id: 'activity_legacy_draft_scope',
    entityType: 'DraftAction',
    entityId: 'draft_legacy_scope',
  });
  const retained = applyActivityLogRetention({
    ...cloneSeed(),
    activityLogs: [...ordinaryLogs, provenanceLog],
  });

  assert.equal(retained.activityLogs.length, ACTIVITY_LOG_RETENTION_LIMIT);
  assert.equal(retained.activityLogs.some((log) => log.id === provenanceLog.id), true);
  assert.equal(retained.activityLogs.some((log) => log.id === ordinaryLogs[0]?.id), false);
});

test('Activity retention keeps the active Turn window ahead of newer Demo history', () => {
  const activeProjectId = 'project_retention_real';
  const activeLogs = Array.from(
    { length: ACTIVITY_LOG_RETENTION_LIMIT },
    (_, index) => activity(index, { projectId: activeProjectId }),
  );
  const newerDemoLog = activity(ACTIVITY_LOG_RETENTION_LIMIT + 1, {
    id: 'activity_newer_demo',
    projectId: seedData.activeProjectId,
  });
  const retained = applyActivityLogRetention({
    ...cloneSeed(),
    activeProjectId,
    activityLogs: [...activeLogs, newerDemoLog],
  });

  assert.equal(retained.activityLogs.length, ACTIVITY_LOG_RETENTION_LIMIT);
  assert.equal(retained.activityLogs.filter((log) => log.projectId === activeProjectId).length, ACTIVITY_LOG_RETENTION_LIMIT);
  assert.equal(retained.activityLogs.some((log) => log.id === newerDemoLog.id), false);
});

test('normalization enforces Activity retention for load, restore, and sync boundaries', () => {
  const activityLogs = Array.from(
    { length: ACTIVITY_LOG_RETENTION_LIMIT + 1 },
    (_, index) => activity(index),
  );
  const normalized = normalizeAppData({ ...cloneSeed(), activityLogs });

  assert.equal(normalized.activityLogs.length, ACTIVITY_LOG_RETENTION_LIMIT);
  assert.equal(normalized.activityLogs[0]?.id, activityLogs.at(-1)?.id);
  assert.equal(normalized.activityLogs.some((log) => log.id === activityLogs[0]?.id), false);
});
