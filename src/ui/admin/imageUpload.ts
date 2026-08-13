import {
  DEFAULT_UPLOAD_QUALITY,
  MAX_CARD_UPLOAD_HEIGHT,
  MAX_CARD_UPLOAD_WIDTH,
} from './helpers';

export const blobToDataUrl = async (blob: Blob): Promise<string> =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });

export const optimizeBlobForUpload = async (
  blob: Blob,
  filename: string,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<{ dataUrl: string; filename: string } | null> => {
  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = sourceUrl;
    });
    if (!loaded || !image.width || !image.height) return null;

    const maxWidth = options?.maxWidth ?? MAX_CARD_UPLOAD_WIDTH;
    const maxHeight = options?.maxHeight ?? MAX_CARD_UPLOAD_HEIGHT;
    const quality = options?.quality ?? DEFAULT_UPLOAD_QUALITY;

    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    let dataUrl = canvas.toDataURL('image/webp', quality);
    let ext = 'webp';
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      ext = 'jpg';
    }

    const parsed = filename.split('.');
    if (parsed.length > 1) parsed.pop();
    const baseName = (parsed.join('.') || 'card-image').trim();
    return { dataUrl, filename: `${baseName}.${ext}` };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

export const uploadAdminImageDataUrl = async ({
  serverUrl,
  adminHeaders,
  filename,
  dataUrl,
  cardId,
  moduleId,
}: {
  serverUrl: string;
  adminHeaders: () => Record<string, string>;
  filename: string;
  dataUrl: string;
  cardId?: string;
  moduleId?: string;
}): Promise<{ path: string | null; error?: string }> => {
  try {
    const response = await fetch(`${serverUrl}/api/upload-card-image`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...adminHeaders(),
      },
      body: JSON.stringify({
        filename,
        dataUrl,
        cardId,
        moduleId,
      }),
    });
    const payload = (await response.json()) as { path?: string; error?: string };
    if (!response.ok || !payload.path) {
      return { path: null, error: payload.error };
    }
    return { path: payload.path };
  } catch {
    return { path: null };
  }
};
