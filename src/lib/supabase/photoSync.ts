import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppData, PhotoNote } from '../../types';
import { nowISO } from '../constants';
import { getLocalPhotoBlob, putPhotoBlob } from '../photoStorage';
import { getSupabaseClient } from './client';
import { filterUploadableSyncItems } from './syncBoundary';

const PHOTO_BUCKET = 'photos';
const MAX_CLOUD_PHOTO_BYTES = 5_242_880;
const PHOTO_UPLOAD_CONCURRENCY = 3;
const PHOTO_CLOUD_TIMEOUT_MS = 20_000;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const extensionByMimeType = new Map([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

type PhotoBlobLoader = (photo: PhotoNote) => Promise<Blob | undefined>;
type PhotoBlobSaver = (photoId: string, blob: Blob) => Promise<void>;

export interface PhotoSyncDependencies {
  cloudTimeoutMs: number;
  isOnline: () => boolean;
  loadLocalPhoto: PhotoBlobLoader;
  now: () => string;
  saveLocalPhoto: PhotoBlobSaver;
}

export interface PhotoFileUploadResult {
  data: AppData;
  failedFiles: number;
  failures: string[];
  unavailableLocalFiles: number;
  uploadedFiles: number;
}

export interface ResolvedPhotoBlob {
  blob?: Blob;
  source: 'local' | 'cloud' | 'missing' | 'offline' | 'signed_out';
}

const defaultDependencies: PhotoSyncDependencies = {
  cloudTimeoutMs: PHOTO_CLOUD_TIMEOUT_MS,
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  loadLocalPhoto: getLocalPhotoBlob,
  now: nowISO,
  saveLocalPhoto: putPhotoBlob,
};

const withTimeout = async <T>(request: PromiseLike<T>, timeoutMs: number) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Photo cloud request timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const withDependencies = (overrides?: Partial<PhotoSyncDependencies>): PhotoSyncDependencies => ({
  ...defaultDependencies,
  ...overrides,
});

const photoErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Photo file sync failed.';
};

const hashPhotoId = (value: string) => {
  let hash = 2166136261;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return (hash >>> 0).toString(36);
};

const normalizedPhotoMimeType = (blob: Blob) => {
  const mimeType = blob.type.toLowerCase().split(';', 1)[0];
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
};

const validateCloudPhoto = (blob: Blob) => {
  const mimeType = normalizedPhotoMimeType(blob);
  const extension = extensionByMimeType.get(mimeType);
  if (!extension) {
    throw new Error(`Unsupported cloud photo format: ${mimeType || 'unknown'}.`);
  }
  if (blob.size > MAX_CLOUD_PHOTO_BYTES) {
    throw new Error('Photo is larger than the 5 MB private cloud limit.');
  }
  return { extension, mimeType };
};

export const buildPhotoStoragePath = (userId: string, photoId: string, mimeType: string) => {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new Error('Photo upload requires a valid signed-in user id.');
  }

  const extension = extensionByMimeType.get(mimeType.toLowerCase().split(';', 1)[0]);
  if (!extension) {
    throw new Error(`Unsupported cloud photo format: ${mimeType || 'unknown'}.`);
  }

  const safePhotoId = photoId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140) || 'photo';
  const fileStem = safePhotoId === photoId ? safePhotoId : `${safePhotoId}-${hashPhotoId(photoId)}`;
  return `${userId}/${fileStem}.${extension}`;
};

export const uploadPendingPhotoFiles = async (
  client: SupabaseClient,
  userId: string,
  data: AppData,
  dependencyOverrides?: Partial<PhotoSyncDependencies>,
): Promise<PhotoFileUploadResult> => {
  const dependencies = withDependencies(dependencyOverrides);
  const candidates = filterUploadableSyncItems(data, 'photoNotes', data.photoNotes).filter((photo) => !photo.storagePath);
  const uploaded = new Map<string, PhotoNote>();
  const failures: string[] = [];
  let unavailableLocalFiles = 0;
  let nextIndex = 0;

  const uploadNext = async () => {
    while (nextIndex < candidates.length) {
      const photo = candidates[nextIndex];
      nextIndex += 1;

      try {
        const blob = await dependencies.loadLocalPhoto(photo);
        if (!blob) {
          unavailableLocalFiles += 1;
          continue;
        }

        const { mimeType } = validateCloudPhoto(blob);
        const storagePath = buildPhotoStoragePath(userId, photo.id, mimeType);
        const { error } = await withTimeout(
          client.storage.from(PHOTO_BUCKET).upload(storagePath, blob, {
            cacheControl: '3600',
            contentType: mimeType,
            upsert: true,
          }),
          dependencies.cloudTimeoutMs,
        );
        if (error) {
          throw error;
        }

        uploaded.set(photo.id, {
          ...photo,
          storagePath,
          updatedAt: dependencies.now(),
        });
      } catch (error) {
        failures.push(`${photo.id}: ${photoErrorMessage(error)}`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PHOTO_UPLOAD_CONCURRENCY, candidates.length) }, () => uploadNext()),
  );

  const nextData =
    uploaded.size > 0
      ? {
          ...data,
          photoNotes: data.photoNotes.map((photo) => uploaded.get(photo.id) ?? photo),
        }
      : data;

  return {
    data: nextData,
    failedFiles: failures.length,
    failures,
    unavailableLocalFiles,
    uploadedFiles: uploaded.size,
  };
};

export const resolvePhotoBlob = async (
  photo: PhotoNote,
  client: SupabaseClient | null = getSupabaseClient(),
  dependencyOverrides?: Partial<PhotoSyncDependencies>,
): Promise<ResolvedPhotoBlob> => {
  const dependencies = withDependencies(dependencyOverrides);
  let localBlob: Blob | undefined;
  let localReadError: unknown;
  try {
    localBlob = await dependencies.loadLocalPhoto(photo);
  } catch (error) {
    localReadError = error;
  }
  if (localBlob) {
    return { blob: localBlob, source: 'local' };
  }
  if (!photo.storagePath) {
    if (localReadError) {
      throw localReadError;
    }
    return { source: 'missing' };
  }
  if (!dependencies.isOnline()) {
    return { source: 'offline' };
  }
  if (!client) {
    return { source: 'signed_out' };
  }

  const { data: authData } = await client.auth.getSession();
  const userId = authData.session?.user.id;
  if (!userId) {
    return { source: 'signed_out' };
  }
  if (!photo.storagePath.startsWith(`${userId}/`) || photo.storagePath.includes('..')) {
    throw new Error('Cloud photo path did not match the signed-in user.');
  }

  const { data: cloudBlob, error } = await withTimeout(
    client.storage.from(PHOTO_BUCKET).download(photo.storagePath),
    dependencies.cloudTimeoutMs,
  );
  if (error) {
    throw new Error(photoErrorMessage(error));
  }
  if (!cloudBlob) {
    throw new Error('Cloud photo returned no file data.');
  }

  validateCloudPhoto(cloudBlob);
  try {
    await dependencies.saveLocalPhoto(photo.id, cloudBlob);
  } catch {
    // The authenticated cloud file is still usable for this view even if local caching is unavailable.
  }
  return { blob: cloudBlob, source: 'cloud' };
};
