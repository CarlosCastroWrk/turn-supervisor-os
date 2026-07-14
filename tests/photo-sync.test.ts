import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedData } from '../src/data/seed.ts';
import { SyncSessionChangedError } from '../src/lib/supabase/cacheOwnership.ts';
import {
  buildPhotoStoragePath,
  resolvePhotoBlob,
  uploadPendingPhotoFiles,
} from '../src/lib/supabase/photoSync.ts';
import { uploadLocalDataWithPhotos } from '../src/lib/supabase/sync.ts';
import type { AppData, PhotoNote, Project } from '../src/types.ts';

const userId = '123e4567-e89b-42d3-a456-426614174000';
const stamp = '2026-07-09T12:00:00.000Z';

interface UploadCall {
  blob: Blob;
  bucket: string;
  options: { cacheControl?: string; contentType?: string; upsert?: boolean };
  path: string;
}

interface DownloadCall {
  bucket: string;
  path: string;
}

const fakePhotoClient = ({
  downloadBlob = new Blob([Uint8Array.from([4, 5, 6])], { type: 'image/jpeg' }),
  downloadCalls = [],
  downloadError,
  sessionUserId = userId,
  uploadCalls = [],
  uploadError,
}: {
  downloadBlob?: Blob;
  downloadCalls?: DownloadCall[];
  downloadError?: { message: string };
  sessionUserId?: string;
  uploadCalls?: UploadCall[];
  uploadError?: { message: string };
} = {}) =>
  ({
    auth: {
      async getSession() {
        return {
          data: {
            session: sessionUserId ? { user: { id: sessionUserId } } : null,
          },
        };
      },
    },
    storage: {
      from(bucket: string) {
        return {
          async download(path: string) {
            downloadCalls.push({ bucket, path });
            return { data: downloadError ? null : downloadBlob, error: downloadError ?? null };
          },
          async upload(path: string, blob: Blob, options: UploadCall['options']) {
            uploadCalls.push({ blob, bucket, options, path });
            return { data: uploadError ? null : { path }, error: uploadError ?? null };
          },
        };
      },
    },
  }) as unknown as SupabaseClient;

const realProject: Project = {
  ...seedData.projects[0],
  id: 'project_photo_sync_real',
  mode: 'real',
  name: 'Photo Sync QA',
  createdAt: stamp,
  updatedAt: stamp,
};

const photo = (id: string, projectId = realProject.id, storagePath?: string): PhotoNote => ({
  id,
  projectId,
  unitId: 'unit_photo_sync',
  storagePath,
  localImageAvailable: true,
  imageMimeType: 'image/jpeg',
  imageByteSize: 3,
  category: 'Problem',
  caption: id,
  createdAt: stamp,
  updatedAt: stamp,
});

const photoData = (photos: PhotoNote[]): AppData => ({
  ...(JSON.parse(JSON.stringify(seedData)) as AppData),
  activeProjectId: realProject.id,
  projects: [realProject, ...seedData.projects],
  photoNotes: photos,
});

test('buildPhotoStoragePath keeps generated and restored ids inside the authenticated user folder', () => {
  assert.equal(buildPhotoStoragePath(userId, 'photo_safe_123', 'image/jpeg'), `${userId}/photo_safe_123.jpg`);

  const restoredPath = buildPhotoStoragePath(userId, '../photo unsafe', 'image/png');
  assert.match(restoredPath, new RegExp(`^${userId}/`));
  assert.doesNotMatch(restoredPath, /\.\.|\s/);
  assert.match(restoredPath, /\.png$/);
  assert.throws(() => buildPhotoStoragePath('not-a-user', 'photo_1', 'image/jpeg'), /valid signed-in user id/);
});

test('uploadPendingPhotoFiles uploads only real local photos and preserves unavailable metadata', async () => {
  const uploadCalls: UploadCall[] = [];
  const realLocal = photo('photo_real_local');
  const realMissing = photo('photo_real_missing');
  const demoLocal = photo('photo_demo_local', seedData.projects[0].id);
  const alreadyCloud = photo('photo_cloud_ready', realProject.id, `${userId}/photo_cloud_ready.jpg`);
  const localBlob = new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/jpeg' });
  const loadedIds: string[] = [];

  const result = await uploadPendingPhotoFiles(
    fakePhotoClient({ uploadCalls }),
    userId,
    photoData([realLocal, realMissing, demoLocal, alreadyCloud]),
    {
      loadLocalPhoto: async (candidate) => {
        loadedIds.push(candidate.id);
        return candidate.id === realLocal.id || candidate.id === demoLocal.id ? localBlob : undefined;
      },
      now: () => '2026-07-09T12:05:00.000Z',
    },
  );

  assert.deepEqual(loadedIds.sort(), [realLocal.id, realMissing.id].sort());
  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0].bucket, 'photos');
  assert.equal(uploadCalls[0].path, `${userId}/${realLocal.id}.jpg`);
  assert.equal(uploadCalls[0].options.contentType, 'image/jpeg');
  assert.equal(uploadCalls[0].options.upsert, true);
  assert.equal(result.uploadedFiles, 1);
  assert.equal(result.failedFiles, 0);
  assert.equal(result.unavailableLocalFiles, 1);
  assert.equal(result.data.photoNotes.find((item) => item.id === realLocal.id)?.storagePath, uploadCalls[0].path);
  assert.equal(result.data.photoNotes.find((item) => item.id === realLocal.id)?.updatedAt, '2026-07-09T12:05:00.000Z');
  assert.equal(result.data.photoNotes.find((item) => item.id === realMissing.id)?.storagePath, undefined);
  assert.equal(result.data.photoNotes.find((item) => item.id === demoLocal.id)?.storagePath, undefined);
});

test('photo upload starts no cloud request after the account changes during local file loading', async () => {
  const uploadCalls: UploadCall[] = [];
  let active = true;
  const requestGuard = () => {
    if (!active) throw new SyncSessionChangedError();
  };

  await assert.rejects(
    uploadPendingPhotoFiles(
      fakePhotoClient({ uploadCalls }),
      userId,
      photoData([photo('photo_session_change')]),
      {
        loadLocalPhoto: async () => {
          active = false;
          return new Blob([Uint8Array.from([1])], { type: 'image/jpeg' });
        },
      },
      requestGuard,
    ),
    SyncSessionChangedError,
  );
  assert.equal(uploadCalls.length, 0);
});

test('photo upload failures stay pending without mutating storage metadata', async () => {
  const pending = photo('photo_upload_retry');
  const result = await uploadPendingPhotoFiles(
    fakePhotoClient({ uploadError: { message: 'network interrupted' } }),
    userId,
    photoData([pending]),
    {
      loadLocalPhoto: async () => new Blob([Uint8Array.from([1])], { type: 'image/jpeg' }),
    },
  );

  assert.equal(result.uploadedFiles, 0);
  assert.equal(result.failedFiles, 1);
  assert.match(result.failures[0], /network interrupted/);
  assert.equal(result.data.photoNotes[0].storagePath, undefined);
});

test('photo upload canonicalizes legacy image/jpg content types for the private bucket', async () => {
  const uploadCalls: UploadCall[] = [];
  const result = await uploadPendingPhotoFiles(
    fakePhotoClient({ uploadCalls }),
    userId,
    photoData([photo('photo_legacy_jpg_mime')]),
    {
      loadLocalPhoto: async () => new Blob([Uint8Array.from([1])], { type: 'image/jpg' }),
    },
  );

  assert.equal(result.failedFiles, 0);
  assert.equal(uploadCalls[0].options.contentType, 'image/jpeg');
  assert.match(uploadCalls[0].path, /\.jpg$/);
});

test('photo cloud requests time out into a retryable pending state', async () => {
  const pending = photo('photo_upload_timeout');
  const client = {
    storage: {
      from() {
        return {
          upload() {
            return new Promise(() => undefined);
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const result = await uploadPendingPhotoFiles(client, userId, photoData([pending]), {
    cloudTimeoutMs: 5,
    loadLocalPhoto: async () => new Blob([Uint8Array.from([1])], { type: 'image/jpeg' }),
  });

  assert.equal(result.failedFiles, 1);
  assert.match(result.failures[0], /timed out/);
  assert.equal(result.data.photoNotes[0].storagePath, undefined);
});

test('record rows upload before photo files and successful paths upload afterward', async () => {
  const operations: string[] = [];
  const localPhoto = photo('photo_order_qa');
  const client = {
    from(table: string) {
      return {
        async upsert(rows: Array<Record<string, unknown>>) {
          const targetPhoto = rows.find((row) => row.id === localPhoto.id);
          operations.push(`rows:${table}:${String(targetPhoto?.storage_path ?? 'none')}`);
          return { error: null };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string) {
            operations.push(`file:${bucket}:${path}`);
            return { data: { path }, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const result = await uploadLocalDataWithPhotos(client, userId, photoData([localPhoto]), {}, {
    loadLocalPhoto: async () => new Blob([Uint8Array.from([1, 2])], { type: 'image/jpeg' }),
    now: () => '2026-07-09T12:10:00.000Z',
  });
  const initialPhotoRows = operations.indexOf('rows:photo_notes:');
  const fileUpload = operations.findIndex((operation) => operation.startsWith('file:photos:'));
  const pathRows = operations.indexOf(`rows:photo_notes:${userId}/${localPhoto.id}.jpg`);

  assert.ok(initialPhotoRows >= 0);
  assert.ok(fileUpload > initialPhotoRows);
  assert.ok(pathRows > fileUpload);
  assert.equal(result.failures.length, 0);
  assert.equal(result.data.photoNotes[0].storagePath, `${userId}/${localPhoto.id}.jpg`);
});

test('a failed photo metadata row prevents the private file upload from starting', async () => {
  let fileUploads = 0;
  const client = {
    from(table: string) {
      return {
        async upsert() {
          return { error: table === 'photo_notes' ? { message: 'photo row failed' } : null };
        },
      };
    },
    storage: {
      from() {
        return {
          async upload() {
            fileUploads += 1;
            return { data: {}, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const result = await uploadLocalDataWithPhotos(client, userId, photoData([photo('photo_row_failure')]), {}, {
    loadLocalPhoto: async () => new Blob([Uint8Array.from([1])], { type: 'image/jpeg' }),
  });

  assert.equal(fileUploads, 0);
  assert.match(result.failures[0], /photo row failed/);
  assert.equal(result.photoUpload.uploadedFiles, 0);
});

test('a failed storage-path row keeps local metadata unchanged for an idempotent retry', async () => {
  let photoRowUploads = 0;
  let fileUploads = 0;
  const pending = photo('photo_path_retry');
  const client = {
    from(table: string) {
      return {
        async upsert() {
          if (table === 'photo_notes') {
            photoRowUploads += 1;
            if (photoRowUploads === 2) {
              return { error: { message: 'path row failed' } };
            }
          }
          return { error: null };
        },
      };
    },
    storage: {
      from() {
        return {
          async upload() {
            fileUploads += 1;
            return { data: {}, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const result = await uploadLocalDataWithPhotos(client, userId, photoData([pending]), {}, {
    loadLocalPhoto: async () => new Blob([Uint8Array.from([1])], { type: 'image/jpeg' }),
  });

  assert.equal(fileUploads, 1);
  assert.equal(result.photoUpload.uploadedFiles, 1);
  assert.match(result.failures[0], /path row failed/);
  assert.equal(result.data.photoNotes[0].storagePath, undefined);
});

test('resolvePhotoBlob uses the local file before making an authenticated cloud request', async () => {
  const downloadCalls: DownloadCall[] = [];
  const localBlob = new Blob([Uint8Array.from([9])], { type: 'image/jpeg' });
  const result = await resolvePhotoBlob(
    photo('photo_local_first', realProject.id, `${userId}/photo_local_first.jpg`),
    fakePhotoClient({ downloadCalls }),
    { loadLocalPhoto: async () => localBlob },
  );

  assert.equal(result.source, 'local');
  assert.equal(result.blob, localBlob);
  assert.deepEqual(downloadCalls, []);
});

test('resolvePhotoBlob downloads a private cloud file and caches it locally', async () => {
  const downloadCalls: DownloadCall[] = [];
  const saved: Array<{ blob: Blob; id: string }> = [];
  const cloudPhoto = photo('photo_cloud_download', realProject.id, `${userId}/photo_cloud_download.jpg`);
  const result = await resolvePhotoBlob(cloudPhoto, fakePhotoClient({ downloadCalls }), {
    isOnline: () => true,
    loadLocalPhoto: async () => undefined,
    saveLocalPhoto: async (id, blob) => {
      saved.push({ blob, id });
    },
  });

  assert.equal(result.source, 'cloud');
  assert.equal(result.blob?.type, 'image/jpeg');
  assert.deepEqual(downloadCalls, [{ bucket: 'photos', path: cloudPhoto.storagePath }]);
  assert.equal(saved[0].id, cloudPhoto.id);
  assert.equal(saved[0].blob, result.blob);
});

test('resolvePhotoBlob still returns a cloud file when local cache read and write are unavailable', async () => {
  const downloadCalls: DownloadCall[] = [];
  const cloudPhoto = photo('photo_cloud_cache_failure', realProject.id, `${userId}/photo_cloud_cache_failure.jpg`);
  const result = await resolvePhotoBlob(cloudPhoto, fakePhotoClient({ downloadCalls }), {
    isOnline: () => true,
    loadLocalPhoto: async () => {
      throw new Error('IndexedDB read failed');
    },
    saveLocalPhoto: async () => {
      throw new Error('IndexedDB write failed');
    },
  });

  assert.equal(result.source, 'cloud');
  assert.ok(result.blob);
  assert.deepEqual(downloadCalls, [{ bucket: 'photos', path: cloudPhoto.storagePath }]);
});

test('resolvePhotoBlob refuses a cloud path outside the current user folder', async () => {
  const unsafe = photo('photo_wrong_owner', realProject.id, '999e4567-e89b-42d3-a456-426614174000/photo_wrong_owner.jpg');

  await assert.rejects(
    resolvePhotoBlob(unsafe, fakePhotoClient(), {
      isOnline: () => true,
      loadLocalPhoto: async () => undefined,
    }),
    /did not match the signed-in user/,
  );
});
