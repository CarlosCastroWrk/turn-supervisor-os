import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { enterDemoTurn, DEMO_TOWER_PROJECT_ID } from '../src/data/demoTurn.ts';
import { mergeRemoteData, replaceRemoteData } from '../src/lib/supabase/sync.ts';
import {
  createDemoSyncBoundary,
  filterUploadableSyncItems,
  isDemoScopedSyncItem,
} from '../src/lib/supabase/syncBoundary.ts';
import type { AppData, FieldEvent } from '../src/types.ts';

// The Turn ledger (fieldEvents, day sessions, batches, walks, contacts) now
// syncs. These pins protect the three rules that make that safe: newer-local
// wins on merge, a fresh device still keeps its own in-flight work on
// replace, and DEMO field events never upload.

const NOW = '2026-08-18T16:00:00.000Z';

const realBase = (): AppData => {
  const data = structuredClone(seedData) as AppData;
  data.projects = data.projects.map((project) =>
    project.id === data.activeProjectId ? { ...project, mode: 'real' as const } : project);
  return data;
};

const eventFor = (data: AppData, id: string, recordedAt: string): FieldEvent => ({
  actorId: 'los',
  actorType: 'supervisor',
  eventType: 'crew-reported-complete',
  id,
  projectId: data.activeProjectId,
  recordedAt,
  recordedBy: 'Los',
  sourceType: 'test',
  summary: 'test event',
} as FieldEvent);

test('merge: remote ledger rows join local ones, local rows survive', () => {
  const data = realBase();
  data.fieldEvents = [eventFor(data, 'local-ev', NOW)];
  const merged = mergeRemoteData(data, {
    fieldEvents: [eventFor(data, 'cloud-ev', '2026-08-17T10:00:00.000Z')],
  });
  const ids = merged.fieldEvents.map((event) => event.id).sort();
  assert.deepEqual(ids, ['cloud-ev', 'local-ev'], 'both devices’ events survive a merge');
});

test('replace (fresh device): local in-flight field work is kept for the active project', () => {
  const data = realBase();
  data.daySessions = [{
    activeCleanCrewIds: [], activePaintCrewIds: [], createdAt: NOW, date: '2026-08-18',
    id: 'local-day', keyStatus: 'yes', morningNote: '', projectId: data.activeProjectId,
    releaseBatchIds: [], startedAt: NOW, startedBy: 'Los', status: 'active', updatedAt: NOW,
  }];
  data.fieldEvents = [eventFor(data, 'local-ev', NOW)];
  const replaced = replaceRemoteData(data, {
    fieldEvents: [eventFor(data, 'cloud-ev', '2026-08-10T10:00:00.000Z')],
  });
  const ids = replaced.fieldEvents.map((event) => event.id).sort();
  assert.deepEqual(ids, ['cloud-ev', 'local-ev'], 'replace never drops the active project’s local ledger');
  assert.ok(replaced.daySessions.some((session) => session.id === 'local-day'));
});

test('demo field events are excluded from upload — the fake tower never reaches the cloud', () => {
  const entered = enterDemoTurn(realBase(), NOW);
  assert.ok(entered.ok);
  const boundary = createDemoSyncBoundary(entered.data);
  const demoEvents = entered.data.fieldEvents.filter(
    (event) => event.projectId === DEMO_TOWER_PROJECT_ID);
  assert.ok(demoEvents.length > 0, 'the demo story recorded events');
  assert.ok(
    demoEvents.every((event) => isDemoScopedSyncItem(boundary, 'fieldEvents', event)),
    'every demo event is inside the boundary',
  );
  const uploadable = filterUploadableSyncItems(entered.data, 'fieldEvents', entered.data.fieldEvents);
  assert.ok(
    uploadable.every((event) => (event as FieldEvent).projectId !== DEMO_TOWER_PROJECT_ID),
    'no demo event is uploadable',
  );
  const demoSessions = entered.data.daySessions.filter(
    (session) => session.projectId === DEMO_TOWER_PROJECT_ID);
  assert.ok(demoSessions.every((session) => isDemoScopedSyncItem(boundary, 'daySessions', session)));
});
