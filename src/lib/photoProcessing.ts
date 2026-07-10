const MAX_PHOTO_DIMENSION = 1600;
const PHOTO_JPEG_QUALITY = 0.72;
const MAX_UNCOMPRESSED_FALLBACK_BYTES = 500_000;

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

export const preparePhotoFile = async (file: File) => {
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
      blob,
      originalBytes: file.size,
      compressedBytes: blob.size,
    };
  } catch (error) {
    if (file.size <= MAX_UNCOMPRESSED_FALLBACK_BYTES) {
      return {
        blob: file,
        originalBytes: file.size,
        compressedBytes: file.size,
      };
    }

    throw error;
  }
};
