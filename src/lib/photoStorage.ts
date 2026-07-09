import type { PhotoNote } from '../types';

const PHOTO_DATABASE_NAME = 'turn-supervisor-os:media:v1';
const PHOTO_DATABASE_VERSION = 1;
const PHOTO_STORE_NAME = 'photos';
const MAX_LEGACY_PHOTO_BYTES = 8_000_000;

interface StoredPhotoBlob {
  id: string;
  blob: Blob;
  mimeType: string;
  byteSize: number;
  updatedAt: string;
}

export interface MigratedLegacyPhoto {
  id: string;
  sourceImageData: string;
  mimeType: string;
  byteSize: number;
}

export interface LegacyPhotoMigrationResult {
  migrated: MigratedLegacyPhoto[];
  failedIds: string[];
}

export type PhotoBlobReader = (photoId: string) => Promise<Blob | undefined>;
export type PhotoBlobWriter = (photoId: string, blob: Blob) => Promise<void>;

let databasePromise: Promise<IDBDatabase> | undefined;

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Photo storage request failed.'));
  });

const transactionComplete = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Photo storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Photo storage transaction was cancelled.'));
  });

const openPhotoDatabase = () => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Durable photo storage is unavailable in this browser.'));
  }

  if (databasePromise) {
    return databasePromise;
  }

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DATABASE_NAME, PHOTO_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        database.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Durable photo storage could not be opened.'));
    request.onblocked = () => reject(new Error('Durable photo storage is blocked by another app tab.'));
  });

  databasePromise = pending;
  void pending.catch(() => {
    if (databasePromise === pending) {
      databasePromise = undefined;
    }
  });

  return pending;
};

export const putPhotoBlob: PhotoBlobWriter = async (photoId, blob) => {
  const database = await openPhotoDatabase();
  const transaction = database.transaction(PHOTO_STORE_NAME, 'readwrite');
  const record: StoredPhotoBlob = {
    id: photoId,
    blob,
    mimeType: blob.type || 'application/octet-stream',
    byteSize: blob.size,
    updatedAt: new Date().toISOString(),
  };

  transaction.objectStore(PHOTO_STORE_NAME).put(record);
  await transactionComplete(transaction);
};

export const getPhotoBlob: PhotoBlobReader = async (photoId) => {
  const database = await openPhotoDatabase();
  const transaction = database.transaction(PHOTO_STORE_NAME, 'readonly');
  const record = await requestResult(
    transaction.objectStore(PHOTO_STORE_NAME).get(photoId) as IDBRequest<StoredPhotoBlob | undefined>,
  );
  return record?.blob;
};

export const getLocalPhotoBlob = async (photo: PhotoNote) => {
  if (photo.imageData) {
    return dataUrlToBlob(photo.imageData);
  }
  return getPhotoBlob(photo.id);
};

export const clearPhotoBlobs = async () => {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const database = await openPhotoDatabase();
  const transaction = database.transaction(PHOTO_STORE_NAME, 'readwrite');
  transaction.objectStore(PHOTO_STORE_NAME).clear();
  await transactionComplete(transaction);
};

const bytesToBinary = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return binary;
};

export const blobToDataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bytesToBinary(bytes))}`;
};

export const dataUrlToBlob = (dataUrl: string) => {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('Legacy photo data is not a valid data URL.');
  }

  const mimeType = match[1] || 'application/octet-stream';
  const encoded = match[3] ?? '';
  const estimatedBytes = match[2] ? Math.ceil((encoded.length * 3) / 4) : encoded.length;
  if (estimatedBytes > MAX_LEGACY_PHOTO_BYTES) {
    throw new Error('Legacy photo data is too large to migrate safely.');
  }
  const binary = match[2] ? atob(encoded) : decodeURIComponent(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
};

export const migrateLegacyPhotoPayloads = async (
  photoNotes: PhotoNote[],
  writePhoto: PhotoBlobWriter = putPhotoBlob,
): Promise<LegacyPhotoMigrationResult> => {
  const migrated: MigratedLegacyPhoto[] = [];
  const failedIds: string[] = [];

  for (const photo of photoNotes) {
    if (!photo.imageData) {
      continue;
    }

    try {
      const blob = dataUrlToBlob(photo.imageData);
      await writePhoto(photo.id, blob);
      migrated.push({
        id: photo.id,
        sourceImageData: photo.imageData,
        mimeType: blob.type,
        byteSize: blob.size,
      });
    } catch {
      failedIds.push(photo.id);
    }
  }

  return { migrated, failedIds };
};

export const applyLegacyPhotoMigration = (photoNotes: PhotoNote[], migrated: MigratedLegacyPhoto[]) => {
  if (migrated.length === 0) {
    return photoNotes;
  }

  const migratedById = new Map(migrated.map((photo) => [photo.id, photo]));
  return photoNotes.map((photo) => {
    const completed = migratedById.get(photo.id);
    if (!completed || photo.imageData !== completed.sourceImageData) {
      return photo;
    }

    const metadata = { ...photo };
    delete metadata.imageData;
    return {
      ...metadata,
      localImageAvailable: true,
      imageMimeType: completed.mimeType,
      imageByteSize: completed.byteSize,
    };
  });
};
