import { useState } from 'react';
import { Camera, ShieldAlert } from 'lucide-react';
import type { EntityId, PhotoCategory, PhotoNote } from '../types';
import { PHOTO_CATEGORIES, createId, nowISO } from '../lib/constants';
import { preparePhotoFile } from '../lib/photoProcessing';
import { blobToDataUrl, putPhotoBlob } from '../lib/photoStorage';
import { Field } from './FormControls';

interface PhotoCaptureProps {
  projectId: EntityId;
  unitId?: EntityId;
  issueId?: EntityId;
  onAdd: (photo: PhotoNote) => void;
}

const MAX_EMBEDDED_PHOTO_FALLBACK_BYTES = 450_000;

const bytesToKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function PhotoCapture({ projectId, unitId, issueId, onAdd }: PhotoCaptureProps) {
  const [isCompressing, setIsCompressing] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

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

    setIsCompressing(true);
    setError(undefined);
    setMessage(undefined);

    try {
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

      try {
        await putPhotoBlob(photoId, compressed.blob);
        onAdd(photo);
        setMessage(
          `Photo saved offline on this device at ${bytesToKb(compressed.compressedBytes)} instead of ${bytesToKb(compressed.originalBytes)}. Real Turn photos can upload when signed in and online.`,
        );
      } catch {
        if (compressed.blob.size > MAX_EMBEDDED_PHOTO_FALLBACK_BYTES) {
          throw new Error('Durable photo storage is unavailable and this photo is too large for the emergency fallback.');
        }

        onAdd({
          ...photo,
          imageData: await blobToDataUrl(compressed.blob),
          localImageAvailable: false,
        });
        setMessage('Photo saved in limited fallback storage. Export a JSON backup before clearing or reinstalling the app.');
      }
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
        <span>{isCompressing ? 'Compressing...' : 'Add Photo'}</span>
        <input accept="image/*" capture="environment" disabled={isCompressing} type="file" onChange={handleFile} />
      </label>
      {message ? <p className="photo-capture__status" aria-live="polite">{message}</p> : null}
      {error ? <p className="photo-capture__error" aria-live="assertive">{error}</p> : null}
      <p className="muted">Photo files are compressed and stored offline on this device. JSON backup includes files available here.</p>
    </form>
  );
}
