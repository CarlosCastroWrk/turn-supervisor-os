import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { buildJsonBackupWithLocalPhotos } from '../src/lib/photoBackup.ts';
import {
  applyLegacyPhotoMigration,
  blobToDataUrl,
  dataUrlToBlob,
  migrateLegacyPhotoPayloads,
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
