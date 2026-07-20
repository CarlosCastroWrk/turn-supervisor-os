import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { buildJsonBackupWithLocalPhotos } from '../src/lib/photoBackup.ts';
import {
  applyLegacyPhotoMigration,
  blobToDataUrl,
  dataUrlToBlob,
  migrateLegacyPhotoPayloads,
  persistPhotoRecord,
} from '../src/lib/photoStorage.ts';
import type { AppData, PhotoNote } from '../src/types.ts';

const stamp = '2026-07-09T12:00:00.000Z';

const photo = (id: string, imageData?: string): PhotoNote => ({
  id,
  projectId: seedData.activeProjectId,
  unitId: seedData.units[0].id,
  imageData,
  category: 'Problem',
  caption: id,
  createdAt: stamp,
  updatedAt: stamp,
});

test('data URL conversion preserves photo bytes and MIME type', async () => {
  const source = new Blob([Uint8Array.from([1, 2, 3, 254])], { type: 'image/jpeg' });
  const dataUrl = await blobToDataUrl(source);
  const restored = dataUrlToBlob(dataUrl);

  assert.equal(restored.type, 'image/jpeg');
  assert.deepEqual(Array.from(new Uint8Array(await restored.arrayBuffer())), [1, 2, 3, 254]);
});

test('legacy photo migration rejects unexpectedly large embedded payloads', () => {
  const oversized = `data:image/jpeg;base64,${'A'.repeat(10_700_000)}`;
  assert.throws(() => dataUrlToBlob(oversized), /too large/);
});

test('legacy photo migration strips only payloads confirmed in durable storage', async () => {
  const validData = 'data:image/jpeg;base64,AQID';
  const valid = photo('photo_valid', validData);
  const failed = photo('photo_failed', validData);
  const written = new Map<string, Blob>();

  const result = await migrateLegacyPhotoPayloads([valid, failed], async (photoId, blob) => {
    if (photoId === failed.id) {
      throw new Error('storage unavailable');
    }
    written.set(photoId, blob);
  });
  const migrated = applyLegacyPhotoMigration([valid, failed], result.migrated);

  assert.equal(written.get(valid.id)?.size, 3);
  assert.deepEqual(result.failedIds, [failed.id]);
  assert.equal(migrated[0].imageData, undefined);
  assert.equal(migrated[0].localImageAvailable, true);
  assert.equal(migrated[0].imageByteSize, 3);
  assert.equal(migrated[1].imageData, validData);
});

test('new photo file failure stays out of AppData and remains independently retryable', async () => {
  const candidate = photo('photo_new_failure');
  const blob = new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/jpeg' });
  const committed: string[] = [];
  const removed: string[] = [];
  let storageAvailable = false;

  const persist = () => persistPhotoRecord(
    candidate,
    blob,
    (savedPhoto) => {
      committed.push(savedPhoto.id);
      return true;
    },
    async () => {
      if (!storageAvailable) throw new Error('IndexedDB unavailable');
    },
    async (photoId) => {
      removed.push(photoId);
    },
  );

  const failed = await persist();
  assert.deepEqual(failed, { status: 'file_failed', cleanupFailed: false });
  assert.deepEqual(committed, []);
  assert.deepEqual(removed, [candidate.id]);
  assert.equal(candidate.imageData, undefined);

  storageAvailable = true;
  const retried = await persist();
  assert.deepEqual(retried, { status: 'saved', cleanupFailed: false });
  assert.deepEqual(committed, [candidate.id]);
});

test('photo metadata failure removes the unreferenced file and reports cleanup risk honestly', async () => {
  const candidate = photo('photo_metadata_failure');
  const blob = new Blob([Uint8Array.from([4, 5, 6])], { type: 'image/jpeg' });
  const removed: string[] = [];

  const cleaned = await persistPhotoRecord(
    candidate,
    blob,
    () => false,
    async () => undefined,
    async (photoId) => {
      removed.push(photoId);
    },
  );
  assert.deepEqual(cleaned, { status: 'metadata_failed', cleanupFailed: false });
  assert.deepEqual(removed, [candidate.id]);

  const orphaned = await persistPhotoRecord(
    candidate,
    blob,
    () => false,
    async () => undefined,
    async () => {
      throw new Error('cleanup unavailable');
    },
  );
  assert.deepEqual(orphaned, { status: 'metadata_failed', cleanupFailed: true });
});

test('photo-complete JSON backup hydrates available IndexedDB files and reports missing files', async () => {
  const data = JSON.parse(JSON.stringify(seedData)) as AppData;
  const stored = photo('photo_stored');
  const missing = photo('photo_missing');
  data.photoNotes = [stored, missing];

  const result = await buildJsonBackupWithLocalPhotos(data, async (photoId) =>
    photoId === stored.id ? new Blob([Uint8Array.from([9, 8, 7])], { type: 'image/jpeg' }) : undefined,
  );
  const backup = JSON.parse(result.text) as {
    photoFiles: { includedLocalPhotoFiles: number; missingLocalPhotoFiles: number; totalPhotoRecords: number };
    data: AppData;
  };

  assert.equal(result.includedPhotoFiles, 1);
  assert.equal(result.missingPhotoFiles, 1);
  assert.deepEqual(backup.photoFiles, {
    includedLocalPhotoFiles: 1,
    missingLocalPhotoFiles: 1,
    totalPhotoRecords: 2,
  });
  assert.match(backup.data.photoNotes[0].imageData ?? '', /^data:image\/jpeg;base64,/);
  assert.equal(backup.data.photoNotes[1].imageData, undefined);
  assert.equal(data.photoNotes[0].imageData, undefined);
});
