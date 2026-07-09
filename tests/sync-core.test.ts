import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePhotoNotes, mergeRows, syncRowFingerprint } from '../src/lib/supabase/syncCore.ts';

test('mergeRows keeps the local row when edit timestamps tie', () => {
  const local = [{ id: 'unit_204', updatedAt: '2026-07-06T15:00:00.000Z', notes: 'iPad offline edit' }];
  const remote = [{ id: 'unit_204', updatedAt: '2026-07-06T15:00:00.000Z', notes: 'Mac stale cloud copy' }];

  assert.equal(mergeRows(local, remote)[0].notes, 'iPad offline edit');
});

test('mergeRows compares timestamps by time value instead of string shape', () => {
  const local = [{ id: 'unit_204', updatedAt: '2026-07-06T10:00:00-05:00', notes: 'local equivalent time' }];
  const remote = [{ id: 'unit_204', updatedAt: '2026-07-06T15:00:00.000Z', notes: 'remote equivalent time' }];

  assert.equal(mergeRows(local, remote)[0].notes, 'local equivalent time');
});

test('mergeRows accepts a newer remote row', () => {
  const local = [{ id: 'unit_204', updatedAt: '2026-07-06T15:00:00.000Z', notes: 'old local note' }];
  const remote = [{ id: 'unit_204', updatedAt: '2026-07-06T15:05:00.000Z', notes: 'new remote note' }];

  assert.equal(mergeRows(local, remote)[0].notes, 'new remote note');
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
