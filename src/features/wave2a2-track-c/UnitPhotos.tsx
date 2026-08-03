import { Camera, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PhotoNote } from '../../types';
import { createId, nowISO } from '../../lib/constants';
import { preparePhotoFile } from '../../lib/photoProcessing';
import { getLocalPhotoBlob, persistPhotoRecord } from '../../lib/photoStorage';

export type UnitPhotoCommitter = (photo: PhotoNote) => boolean | Promise<boolean>;

interface UnitPhotoSaverInput {
  readonly projectId: string;
  readonly unitId: string;
  readonly unitNumber: string;
  readonly onCommitPhoto: UnitPhotoCommitter;
}

const MAX_FILES_PER_PICK = 8;

const useUnitPhotoSaver = ({
  projectId,
  unitId,
  unitNumber,
  onCommitPhoto,
}: UnitPhotoSaverInput) => {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>();

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).slice(0, MAX_FILES_PER_PICK);
    if (files.length === 0) return;
    setSaving(true);
    setStatus(undefined);
    let saved = 0;
    let failed = 0;
    for (const file of files) {
      try {
        const compressed = await preparePhotoFile(file);
        const now = nowISO();
        const photo: PhotoNote = {
          id: createId('photo'),
          projectId,
          unitId,
          localImageAvailable: true,
          imageMimeType: compressed.blob.type,
          imageByteSize: compressed.blob.size,
          category: 'Other',
          caption: `Unit ${unitNumber} field photo`,
          createdAt: now,
          updatedAt: now,
        };
        const result = await persistPhotoRecord(photo, compressed.blob, onCommitPhoto);
        if (result.status === 'saved') saved += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setStatus(
      failed === 0
        ? `${saved} photo${saved === 1 ? '' : 's'} saved to Unit ${unitNumber} on this phone.`
        : `${saved} saved · ${failed} failed — free up storage or try a smaller photo.`,
    );
    setSaving(false);
  };

  return { handleFiles, saving, status };
};

const sharePhoto = async (photo: PhotoNote, unitNumber: string, fallbackUrl?: string) => {
  const blob = await getLocalPhotoBlob(photo).catch(() => undefined);
  if (!blob) return;
  const file = new File(
    [blob],
    `unit-${unitNumber}-${photo.id}.jpg`,
    { type: blob.type || 'image/jpeg' },
  );
  const text = `Unit ${unitNumber} — ${new Date(photo.createdAt).toLocaleDateString()}`;
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], text }).catch(() => undefined);
    return;
  }
  if (fallbackUrl) {
    window.open(fallbackUrl, '_blank', 'noopener');
  }
};

export const UnitPhotoAddButton = (props: UnitPhotoSaverInput & { compact?: boolean }) => {
  const { handleFiles, saving, status } = useUnitPhotoSaver(props);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        className="track-c-unit-note-button track-c-photo-add"
        data-track-c-critical-target="true"
        disabled={saving}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <Camera aria-hidden="true" size={17} />
        {saving ? 'Saving…' : props.compact ? 'Photo' : `Add photo to Unit ${props.unitNumber}`}
      </button>
      <input
        accept="image/*"
        hidden
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files;
          event.currentTarget.value = '';
          void handleFiles(files);
        }}
        ref={inputRef}
        type="file"
      />
      {status ? (
        <p aria-live="polite" className="track-c-photo-status">{status}</p>
      ) : null}
    </>
  );
};

export const UnitPhotoStrip = ({
  photos,
  unitNumber,
}: {
  readonly photos: readonly PhotoNote[];
  readonly unitNumber: string;
}) => {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const photo of photos) {
        try {
          const blob = await getLocalPhotoBlob(photo);
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          created.push(url);
          next[photo.id] = url;
        } catch {
          // Unreadable photo file — skip the thumbnail, keep the record.
        }
      }
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setUrls(next);
    })();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos]);

  if (photos.length === 0) return null;

  return (
    <section aria-label={`Unit ${unitNumber} photos`} className="track-c-photos">
      <header className="track-c-photos__header">
        <h2>Photos · {photos.length}</h2>
        <span><Share2 aria-hidden="true" size={13} /> Tap a photo to send it</span>
      </header>
      <div className="track-c-photos__strip">
        {photos.map((photo) => (
          <button
            aria-label={`Share Unit ${unitNumber} photo from ${new Date(photo.createdAt).toLocaleDateString()}`}
            className="track-c-photos__thumb"
            key={photo.id}
            onClick={() => void sharePhoto(photo, unitNumber, urls[photo.id])}
            type="button"
          >
            {urls[photo.id]
              ? <img alt="" loading="lazy" src={urls[photo.id]} />
              : <span className="track-c-photos__pending">…</span>}
            <small>{new Date(photo.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small>
          </button>
        ))}
      </div>
    </section>
  );
};
