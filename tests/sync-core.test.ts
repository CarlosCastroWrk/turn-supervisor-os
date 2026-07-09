import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePhotoNotes, mergeRows, syncRowFingerprint } from '../src/lib/supabase/syncCore.ts';

test('mergeRows chooses the same whole-row winner when edit timestamps tie', () => {
  const local = [{ id: 'unit_204', updatedAt: '2026-07-06T15:00:00.000Z', notes: 'iPad offline edit' }];
  const remote = [{ id: 'unit_204', updatedAt: '2026-07-06T15:00:00.000Z', notes: 'Mac stale cloud copy' }];

  const localFirst = mergeRows(local, remote)[0];
  const remoteFirst = mergeRows(remote, local)[0];

  assert.deepEqual(localFirst, remoteFirst);
  assert.equal(mergeRows([localFirst], [remoteFirst])[0].notes, localFirst.notes);
});

test('mergeRows treats equivalent timestamp shapes as the same deterministic tie', () => {
  const local = [{ id: 'unit_204', updatedAt: '2026-07-06T10:00:00-05:00', notes: 'local equivalent time' }];
  const remote = [{ id: 'unit_204', updatedAt: '2026-07-06T15:00:00.000Z', notes: 'remote equivalent time' }];

  assert.deepEqual(mergeRows(local, remote)[0], mergeRows(remote, local)[0]);
});

test('mergeRows accepts a newer remote row', () => {
  const local = [{ id: 'unit_204', updatedAt: '2026-07-06T15:00:00.000Z', notes: 'old local note' }];
  const remote = [{ id: 'unit_204', updatedAt: '2026-07-06T15:05:00.000Z', notes: 'new remote note' }];

  assert.equal(mergeRows(local, remote)[0].notes, 'new remote note');
});

test('mergeRows does not let a stale pending Draft Action beat a resolved version', () => {
  const pending = [{ id: 'draft_204', createdAt: '2026-07-06T15:00:00.000Z', status: 'pending' }];
  const failed = [
    {
      id: 'draft_204',
      createdAt: '2026-07-06T15:00:00.000Z',
      status: 'failed',
      error: 'Unit not found.',
    },
  ];
  const rejected = [{ id: 'draft_204', createdAt: '2026-07-06T15:00:00.000Z', status: 'rejected' }];
  const applied = [
    {
      id: 'draft_204',
      createdAt: '2026-07-06T15:00:00.000Z',
      appliedAt: '2026-07-06T15:05:00.000Z',
      status: 'applied',
    },
  ];

  assert.equal(mergeRows(pending, failed)[0].status, 'failed');
  assert.equal(mergeRows(failed, pending)[0].status, 'failed');
  assert.equal(mergeRows(pending, rejected)[0].status, 'rejected');
  assert.equal(mergeRows(rejected, pending)[0].status, 'rejected');
  assert.equal(mergeRows(pending, applied)[0].status, 'applied');
  assert.equal(mergeRows(applied, pending)[0].status, 'applied');
});

test('equal-timestamp comparison remains bounded across 10,000 existing rows', () => {
  const local = Array.from({ length: 10_000 }, (_, index) => ({
    id: `activity_${String(index).padStart(5, '0')}`,
    createdAt: '2026-07-09T20:00:00.000Z',
    note: `Activity ${index + 1}`,
  }));
  const remote = structuredClone(local);
  const startedAt = performance.now();
  const merged = mergeRows(local, remote);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(merged.length, 10_000);
  assert.ok(elapsedMs < 2_000, `Expected 10,000 tied rows to merge under 2s; received ${elapsedMs.toFixed(1)}ms.`);
});

test('syncRowFingerprint treats equivalent timestamptz strings as unchanged', () => {
  const localRow = {
    id: 'unit_204',
    updated_at: '2026-07-06T15:00:00.000Z',
    notes: 'same update',
  };
  const remoteRow = {
    id: 'unit_204',
    updated_at: '2026-07-06T10:00:00-05:00',
    notes: 'same update',
  };

  assert.equal(syncRowFingerprint(localRow), syncRowFingerprint(remoteRow));
});

test('syncRowFingerprint normalizes equivalent in-app camelCase timestamps', () => {
  const localRow = {
    id: 'unit_204',
    updatedAt: '2026-07-06T10:00:00-05:00',
    notes: 'same update',
  };
  const remoteRow = {
    id: 'unit_204',
    updatedAt: '2026-07-06T15:00:00.000Z',
    notes: 'same update',
  };

  assert.equal(syncRowFingerprint(localRow), syncRowFingerprint(remoteRow));
});

test('syncRowFingerprint treats equivalent archived_at timestamptz strings as unchanged', () => {
  const localRow = {
    id: 'project_real',
    archived_at: '2026-07-08T15:00:00.000Z',
  };
  const remoteRow = {
    id: 'project_real',
    archived_at: '2026-07-08T10:00:00-05:00',
  };

  assert.equal(syncRowFingerprint(localRow), syncRowFingerprint(remoteRow));
});

test('syncRowFingerprint ignores JSON object key order', () => {
  const localRow = {
    id: 'draft_1',
    payload: {
      unitNumber: '204',
      status: 'Blocked',
    },
  };
  const remoteRow = {
    id: 'draft_1',
    payload: {
      status: 'Blocked',
      unitNumber: '204',
    },
  };

  assert.equal(syncRowFingerprint(localRow), syncRowFingerprint(remoteRow));
});

test('mergePhotoNotes preserves local image data when cloud only has metadata', () => {
  const local = [
    {
      id: 'photo_1',
      projectId: 'project_real',
      unitId: 'unit_204',
      imageData: 'data:image/jpeg;base64,local',
      localImageAvailable: true,
      imageMimeType: 'image/jpeg',
      imageByteSize: 12345,
      category: 'Problem' as const,
      caption: 'before upload',
      createdAt: '2026-07-06T15:00:00.000Z',
      updatedAt: '2026-07-06T15:00:00.000Z',
    },
  ];
  const remote = [
    {
      id: 'photo_1',
      projectId: 'project_real',
      unitId: 'unit_204',
      category: 'Problem' as const,
      caption: 'cloud caption',
      createdAt: '2026-07-06T15:00:00.000Z',
      updatedAt: '2026-07-06T15:05:00.000Z',
    },
  ];

  const [merged] = mergePhotoNotes(local, remote);

  assert.equal(merged.caption, 'cloud caption');
  assert.equal(merged.imageData, 'data:image/jpeg;base64,local');
  assert.equal(merged.localImageAvailable, true);
  assert.equal(merged.imageMimeType, 'image/jpeg');
  assert.equal(merged.imageByteSize, 12345);
});

test('mergePhotoNotes preserves a known cloud path when an offline local caption is newer', () => {
  const local = [
    {
      id: 'photo_cloud_path',
      projectId: 'project_real',
      unitId: 'unit_204',
      category: 'Problem' as const,
      caption: 'newer offline caption',
      createdAt: '2026-07-09T15:00:00.000Z',
      updatedAt: '2026-07-09T15:10:00.000Z',
    },
  ];
  const remote = [
    {
      id: 'photo_cloud_path',
      projectId: 'project_real',
      unitId: 'unit_204',
      storagePath: '123e4567-e89b-42d3-a456-426614174000/photo_cloud_path.jpg',
      category: 'Problem' as const,
      caption: 'older cloud caption',
      createdAt: '2026-07-09T15:00:00.000Z',
      updatedAt: '2026-07-09T15:05:00.000Z',
    },
  ];

  const [merged] = mergePhotoNotes(local, remote);

  assert.equal(merged.caption, 'newer offline caption');
  assert.equal(merged.storagePath, remote[0].storagePath);
});
