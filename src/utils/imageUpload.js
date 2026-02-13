import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_INLINE_IMAGE_BYTES = 700 * 1024;

const withTimeout = (promise, ms, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

export const fileToInlineDataUrl = (file, options = {}) => {
  const {
    maxBytes = DEFAULT_MAX_INLINE_IMAGE_BYTES,
    maxDimension = 1280,
    minQuality = 0.42,
    initialQuality = 0.82,
    maxAttempts = 10
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.width;
      let height = img.height;
      if (width > maxDimension || height > maxDimension) {
        const scale = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process image.'));
        return;
      }

      const tryCompress = (w, h, quality, attemptsRemaining) => {
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Could not process image.'));
            return;
          }

          if (blob.size <= maxBytes) {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not encode image.'));
            reader.readAsDataURL(blob);
            return;
          }

          if (attemptsRemaining <= 0) {
            reject(new Error('Image is too large. Please choose a smaller screenshot.'));
            return;
          }

          if (quality > minQuality) {
            tryCompress(w, h, quality - 0.12, attemptsRemaining - 1);
            return;
          }

          tryCompress(
            Math.max(320, Math.round(w * 0.82)),
            Math.max(320, Math.round(h * 0.82)),
            initialQuality,
            attemptsRemaining - 1
          );
        }, 'image/jpeg', quality);
      };

      tryCompress(width, height, initialQuality, maxAttempts);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read selected image file.'));
    };

    img.src = objectUrl;
  });
};

export const uploadImageWithFallback = async ({
  file,
  storage,
  pathPrefix,
  storageTimeoutMs = 12000,
  maxInlineBytes = DEFAULT_MAX_INLINE_IMAGE_BYTES
}) => {
  if (!file) {
    return { imageUrl: '', imageSource: '' };
  }

  try {
    const safeName = (file.name || 'image').replace(/\s+/g, '_');
    const imageRef = ref(storage, `${pathPrefix}/${Date.now()}_${safeName}`);
    await withTimeout(
      uploadBytes(imageRef, file),
      storageTimeoutMs,
      'Storage upload timed out.'
    );
    const imageUrl = await withTimeout(
      getDownloadURL(imageRef),
      Math.min(storageTimeoutMs, 9000),
      'Storage URL request timed out.'
    );

    return { imageUrl, imageSource: 'storage' };
  } catch {
    const imageUrl = await fileToInlineDataUrl(file, { maxBytes: maxInlineBytes });
    return { imageUrl, imageSource: 'inline' };
  }
};
