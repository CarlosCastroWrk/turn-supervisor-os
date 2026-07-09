import type { AppData, PhotoNote } from '../types';
import { buildJsonBackup } from './exporters';
import { blobToDataUrl, getPhotoBlob, type PhotoBlobReader } from './photoStorage';

export interface PhotoBackupResult {
  text: string;
  includedPhotoFiles: number;
  missingPhotoFiles: number;
  totalPhotoRecords: number;
}

export const buildJsonBackupWithLocalPhotos = async (
  data: AppData,
  readPhoto: PhotoBlobReader = getPhotoBlob,
): Promise<PhotoBackupResult> => {
  const photoNotes: PhotoNote[] = [];
  let includedPhotoFiles = 0;
  let missingPhotoFiles = 0;

  for (const photo of data.photoNotes) {
    let imageData = photo.imageData;

    if (!imageData) {
      try {
        const blob = await readPhoto(photo.id);
        if (blob) {
          imageData = await blobToDataUrl(blob);
        }
      } catch {
        imageData = undefined;
      }
    }

    if (imageData) {
      includedPhotoFiles += 1;
      photoNotes.push({ ...photo, imageData });
    } else {
      missingPhotoFiles += 1;
      photoNotes.push(photo);
    }
  }

  const backupData = { ...data, photoNotes };
  return {
    text: buildJsonBackup(backupData, {
      includedLocalPhotoFiles: includedPhotoFiles,
      missingLocalPhotoFiles: missingPhotoFiles,
      totalPhotoRecords: data.photoNotes.length,
    }),
    includedPhotoFiles,
    missingPhotoFiles,
    totalPhotoRecords: data.photoNotes.length,
  };
};
