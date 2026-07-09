import { useEffect, useState } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import { resolvePhotoBlob, type ResolvedPhotoBlob } from '../lib/supabase/photoSync';
import type { PhotoNote } from '../types';

const formatPhotoSize = (bytes?: number) => {
  if (!bytes) {
    return '';
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export function PhotoThumbnail({ photo }: { photo: PhotoNote }) {
  const [source, setSource] = useState(photo.imageData ?? '');
  const [isLoading, setIsLoading] = useState(!photo.imageData);
  const [loadSource, setLoadSource] = useState<ResolvedPhotoBlob['source']>(photo.imageData ? 'local' : 'missing');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (photo.imageData) {
      setSource(photo.imageData);
      setIsLoading(false);
      setLoadSource('local');
      return;
    }

    let active = true;
    let objectUrl = '';
    setSource('');
    setIsLoading(true);

    void resolvePhotoBlob(photo)
      .then((result) => {
        if (!active) {
          return;
        }
        setLoadSource(result.source);
        if (result.blob) {
          objectUrl = URL.createObjectURL(result.blob);
          setSource(objectUrl);
        }
      })
      .catch(() => {
        if (active) {
          setLoadSource('missing');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [photo, photo.id, photo.imageData, photo.storagePath, retryKey]);

  const unavailableMessage = isLoading
    ? photo.storagePath
      ? 'Downloading photo...'
      : 'Loading photo...'
    : loadSource === 'offline'
      ? 'Photo downloads when back online'
      : loadSource === 'signed_out'
        ? 'Sign in to load cloud photo'
        : photo.storagePath
          ? 'Cloud photo is unavailable'
          : photo.localImageAvailable
            ? 'Local photo file is missing'
            : 'Photo file is on its capture device';

  return (
    <figure className="photo-thumb">
      {source ? (
        <img alt={photo.caption || photo.category} decoding="async" loading="lazy" src={source} />
      ) : (
        <div className="photo-thumb__unavailable" role="status" aria-live="polite">
          <ImageOff size={22} aria-hidden="true" />
          <span>{unavailableMessage}</span>
          {photo.storagePath && !isLoading ? (
            <button className="photo-thumb__retry" type="button" onClick={() => setRetryKey((value) => value + 1)}>
              <RefreshCw size={14} aria-hidden="true" />
              Retry
            </button>
          ) : null}
        </div>
      )}
      <figcaption>
        <span>{photo.caption || photo.category}</span>
        <small>
          {[
            photo.imageByteSize ? formatPhotoSize(photo.imageByteSize) : '',
            photo.storagePath ? 'Cloud copy ready' : loadSource === 'local' ? 'On this device' : 'Not uploaded',
          ]
            .filter(Boolean)
            .join(' · ')}
        </small>
      </figcaption>
    </figure>
  );
}
