import { useState } from 'react';
import { Camera, RotateCcw, ShieldAlert, X } from 'lucide-react';
import type { EntityId, PhotoCategory, PhotoNote } from '../types';
import { PHOTO_CATEGORIES, createId, nowISO } from '../lib/constants';
import { preparePhotoFile } from '../lib/photoProcessing';
import { persistPhotoRecord } from '../lib/photoStorage';
import { Button, Field } from './FormControls';

interface PhotoCaptureProps {
  projectId: EntityId;
  unitId?: EntityId;
  issueId?: EntityId;
  onAdd: (photo: PhotoNote) => boolean | Promise<boolean>;
}

const bytesToKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

interface PendingPhotoAttempt {
  blob: Blob;
  compressedBytes: number;
  fileName: string;
  originalBytes: number;
  photo: PhotoNote;
}

export function PhotoCapture({ projectId, unitId, issueId, onAdd }: PhotoCaptureProps) {
  const [isCompressing, setIsCompressing] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhotoAttempt>();

  const savePreparedPhoto = async (attempt: PendingPhotoAttempt) => {
    setIsCompressing(true);
    setError(undefined);
    setMessage(undefined);

    const result = await persistPhotoRecord(attempt.photo, attempt.blob, onAdd);
    if (result.status === 'saved') {
      setPendingPhoto(undefined);
      setMessage(
        `Photo saved offline on this device at ${bytesToKb(attempt.compressedBytes)} instead of ${bytesToKb(attempt.originalBytes)}. Real Turn photos can upload when signed in and online.`,
      );
      setIsCompressing(false);
      return;
    }

    setPendingPhoto(attempt);
    const failure = result.status === 'file_failed'
      ? 'Offline photo storage is unavailable.'
      : 'The photo file was stored, but its app record could not be saved.';
    setError(
      `${failure} This photo is not saved. Retry after freeing browser storage, or remove it and continue without the photo.${result.cleanupFailed ? ' A temporary unreferenced photo file may remain on this device.' : ''}`,
    );
    setIsCompressing(false);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const category = (event.currentTarget.form?.elements.namedItem('photoCategory') as HTMLSelectElement | null)?.value as
      | PhotoCategory
      | undefined;
    const caption = (event.currentTarget.form?.elements.namedItem('photoCaption') as HTMLInputElement | null)?.value ?? '';

    try {
      setIsCompressing(true);
      setError(undefined);
      setMessage(undefined);
      const compressed = await preparePhotoFile(file);
      const now = nowISO();
      const photoId = createId('photo');
      const photo: PhotoNote = {
        id: photoId,
        projectId,
        unitId,
        issueId,
        localImageAvailable: true,
        imageMimeType: compressed.blob.type,
        imageByteSize: compressed.blob.size,
        category: category ?? 'Other',
        caption,
        createdAt: now,
        updatedAt: now,
      };

      await savePreparedPhoto({
        blob: compressed.blob,
        compressedBytes: compressed.compressedBytes,
        fileName: file.name || 'Field photo',
        originalBytes: compressed.originalBytes,
        photo,
      });
    } catch (compressError) {
      setError(
        compressError instanceof Error
          ? `${compressError.message} Try a smaller photo or screenshot.`
          : 'Photo could not be compressed. Try a smaller photo or screenshot.',
      );
    } finally {
      setIsCompressing(false);
      input.value = '';
    }
  };

  return (
    <form className="photo-capture">
      <div className="privacy-note">
        <ShieldAlert size={17} aria-hidden="true" />
        <span>Only capture work-related photos with permission and avoid personal/private information.</span>
      </div>
      <div className="grid two">
        <Field label="Category">
          <select name="photoCategory" defaultValue="Problem">
            {PHOTO_CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
        <Field label="Caption">
          <input name="photoCaption" placeholder="Short field note" />
        </Field>
      </div>
      <label className="button button--secondary photo-input">
        <Camera size={18} aria-hidden="true" />
        <span>{isCompressing ? 'Saving photo...' : 'Add Photo'}</span>
        <input accept="image/*" capture="environment" disabled={isCompressing || Boolean(pendingPhoto)} type="file" onChange={handleFile} />
      </label>
      {pendingPhoto ? (
        <div className="photo-capture__pending" role="group" aria-label="Failed photo">
          <div>
            <strong>{pendingPhoto.fileName}</strong>
            <small>Not saved. Your notes and other updates can still be saved.</small>
          </div>
          <div className="button-row">
            <Button disabled={isCompressing} onClick={() => void savePreparedPhoto(pendingPhoto)} variant="secondary">
              <RotateCcw size={17} aria-hidden="true" />
              Retry photo
            </Button>
            <Button
              disabled={isCompressing}
              onClick={() => {
                setPendingPhoto(undefined);
                setError(undefined);
              }}
              variant="ghost"
            >
              <X size={17} aria-hidden="true" />
              Remove
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <p className="photo-capture__status" aria-live="polite">{message}</p> : null}
      {error ? <p className="photo-capture__error" role="alert">{error}</p> : null}
      <p className="muted">Photo files are compressed and stored offline on this device. JSON backup includes files available here.</p>
    </form>
  );
}
