import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getPhotoBlob } from '../lib/photoStorage';
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

  useEffect(() => {
    if (photo.imageData) {
      setSource(photo.imageData);
      setIsLoading(false);
      return;
    }

    let active = true;
    let objectUrl = '';
    setSource('');
    setIsLoading(true);

    void getPhotoBlob(photo.id)
      .then((blob) => {
        if (!active || !blob) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => undefined)
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
  }, [photo.id, photo.imageData]);

  const unavailableMessage = photo.localImageAvailable
    ? 'Local photo file is missing'
    : 'Photo file is on its capture device';

  return (
    <figure className="photo-thumb">
      {source ? (
        <img alt={photo.caption || photo.category} decoding="async" loading="lazy" src={source} />
      ) : (
        <div className="photo-thumb__unavailable" role="img" aria-label={isLoading ? 'Loading photo' : unavailableMessage}>
          <ImageOff size={22} aria-hidden="true" />
          <span>{isLoading ? 'Loading photo...' : unavailableMessage}</span>
        </div>
      )}
      <figcaption>
        <span>{photo.caption || photo.category}</span>
        {photo.imageByteSize ? <small>{formatPhotoSize(photo.imageByteSize)} on this device</small> : null}
      </figcaption>
    </figure>
  );
}
