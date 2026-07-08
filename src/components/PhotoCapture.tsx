import { useState } from 'react';
import { Camera, ShieldAlert } from 'lucide-react';
import type { EntityId, PhotoCategory, PhotoNote } from '../types';
import { PHOTO_CATEGORIES, createId, nowISO } from '../lib/constants';
import { Field } from './FormControls';

interface PhotoCaptureProps {
  projectId: EntityId;
  unitId?: EntityId;
  issueId?: EntityId;
  onAdd: (photo: PhotoNote) => void;
}

const MAX_PHOTO_DIMENSION = 1600;
const PHOTO_JPEG_QUALITY = 0.72;
const MAX_UNCOMPRESSED_FALLBACK_BYTES = 500_000;

const bytesToKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

const readFileAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Photo could not be read.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Photo could not be read.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Photo format is not supported by this browser.'));
    };
    image.src = url;
  });

const canvasToJpegBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Photo could not be compressed.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      PHOTO_JPEG_QUALITY,
    );
  });

const compressPhoto = async (file: File) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }

  try {
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Photo compression is not available in this browser.');
    }

    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToJpegBlob(canvas);

    return {
      dataUrl: await readFileAsDataUrl(blob),
      originalBytes: file.size,
      compressedBytes: blob.size,
    };
  } catch (error) {
    if (file.size <= MAX_UNCOMPRESSED_FALLBACK_BYTES) {
      return {
        dataUrl: await readFileAsDataUrl(file),
        originalBytes: file.size,
        compressedBytes: file.size,
      };
    }

    throw error;
  }
};

export function PhotoCapture({ projectId, unitId, issueId, onAdd }: PhotoCaptureProps) {
  const [isCompressing, setIsCompressing] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
      const compressed = await compressPhoto(file);
      const now = nowISO();
      onAdd({
        id: createId('photo'),
        projectId,
        unitId,
        issueId,
        imageData: compressed.dataUrl,
        category: category ?? 'Other',
        caption,
        createdAt: now,
        updatedAt: now,
      });
      setMessage(`Photo saved at ${bytesToKb(compressed.compressedBytes)} instead of ${bytesToKb(compressed.originalBytes)}.`);
    } catch (compressError) {
      setError(
        compressError instanceof Error
          ? `${compressError.message} Try a smaller photo or screenshot.`
          : 'Photo could not be compressed. Try a smaller photo or screenshot.',
      );
    } finally {
      setIsCompressing(false);
      event.target.value = '';
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
      <p className="muted">Photo data is compressed before saving and stays local on this device.</p>
    </form>
  );
}
