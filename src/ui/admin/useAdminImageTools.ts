import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition } from '../../game/types';
import type { CropDraft } from './types';

type Params = {
  lang: 'uk' | 'en';
  editCard: CardDefinition;
  setEditCard: Dispatch<SetStateAction<CardDefinition>>;
  setEditError: (value: string) => void;
  setImagePreviewNonce: Dispatch<SetStateAction<number>>;
  onSetDeckBackImage: (path?: string) => void;
  setDeckBackImageInput: Dispatch<SetStateAction<string>>;
  uploadDataUrl: (filename: string, dataUrl: string, cardId?: string, moduleId?: string) => Promise<string | null>;
  blobToDataUrl: (blob: Blob) => Promise<string>;
  optimizeBlobForUpload: (
    blob: Blob,
    filename: string,
    options?: { maxWidth?: number; maxHeight?: number; quality?: number },
  ) => Promise<{ dataUrl: string; filename: string } | null>;
  getAspectLockedCropRect: (
    draft: CropDraft,
    imageWidth: number,
    imageHeight: number,
  ) => { sx: number; sy: number; sw: number; sh: number };
  cropQuality: number;
  cardModuleId?: string;
};

const createAdminImageToolErrors = (lang: 'uk' | 'en') => ({
  loadCurrentImage: lang === 'uk' ? 'Не вдалося завантажити поточне зображення' : 'Failed to load current image',
  readImage: lang === 'uk' ? 'Не вдалося прочитати зображення' : 'Failed to read image',
  processImage: lang === 'uk' ? 'Не вдалося обробити зображення' : 'Failed to process image',
  readImageFile: lang === 'uk' ? 'Не вдалося прочитати файл зображення' : 'Failed to read image file',
});

export const useAdminImageTools = ({
  lang,
  editCard,
  setEditCard,
  setEditError,
  setImagePreviewNonce,
  onSetDeckBackImage,
  setDeckBackImageInput,
  uploadDataUrl,
  blobToDataUrl,
  optimizeBlobForUpload,
  getAspectLockedCropRect,
  cropQuality,
  cardModuleId,
}: Params) => {
  const imageToolErrors = createAdminImageToolErrors(lang);
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const cropPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const cropObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const current = cropDraft?.sourceUrl ?? null;
    const prev = cropObjectUrlRef.current;
    if (prev && prev !== current) {
      URL.revokeObjectURL(prev);
    }
    cropObjectUrlRef.current = current;
  }, [cropDraft?.sourceUrl]);

  useEffect(() => () => {
    if (cropObjectUrlRef.current) {
      URL.revokeObjectURL(cropObjectUrlRef.current);
    }
  }, []);

  useEffect(() => {
    if (!cropDraft || !cropPreviewRef.current) return;
    const canvas = cropPreviewRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const image = new Image();
    image.onload = () => {
      if (cropDraft.sourceWidth !== image.width || cropDraft.sourceHeight !== image.height) {
        setCropDraft((prev) => (prev ? { ...prev, sourceWidth: image.width, sourceHeight: image.height } : prev));
      }
      const { sx, sy, sw, sh } = getAspectLockedCropRect(cropDraft, image.width, image.height);
      canvas.width = sw;
      canvas.height = sh;
      ctx.clearRect(0, 0, sw, sh);
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    };
    image.src = cropDraft.sourceUrl;
  }, [cropDraft, getAspectLockedCropRect]);

  const attachImageFile = async (file: File | null) => {
    if (!file) return;
    const sourceUrl = URL.createObjectURL(file);
    setCropDraft({
      filename: file.name,
      sourceBlob: file,
      sourceUrl,
      mime: file.type || 'image/png',
      sourceWidth: 0,
      sourceHeight: 0,
      topPx: 0,
      rightPx: 0,
      bottomPx: 0,
      leftPx: 0,
    });
    setEditError('');
  };

  const startCropFromCurrentImage = async () => {
    const src = normalizeImagePath(editCard.image?.trim());
    if (!src) return;
    try {
      const response = await fetch(src);
      if (!response.ok) {
        setEditError(imageToolErrors.loadCurrentImage);
        return;
      }
      const blob = await response.blob();
      const nameFromPath = src.split('/').pop() || `${editCard.id || 'card-image'}.png`;
      const sourceUrl = URL.createObjectURL(blob);
      setCropDraft({
        filename: nameFromPath,
        sourceBlob: blob,
        sourceUrl,
        mime: blob.type || 'image/png',
        sourceWidth: 0,
        sourceHeight: 0,
        topPx: 0,
        rightPx: 0,
        bottomPx: 0,
        leftPx: 0,
      });
      setEditError('');
    } catch {
      setEditError(imageToolErrors.loadCurrentImage);
    }
  };

  const uploadOriginalFromCropDraft = async () => {
    if (!cropDraft) return;
    const optimized = await optimizeBlobForUpload(cropDraft.sourceBlob, cropDraft.filename);
    const dataUrl = optimized?.dataUrl ?? (await blobToDataUrl(cropDraft.sourceBlob));
    if (!dataUrl) {
      setEditError(imageToolErrors.readImage);
      return;
    }
    const path = await uploadDataUrl(optimized?.filename ?? cropDraft.filename, dataUrl, editCard.id, cardModuleId);
    if (!path) return;
    setEditError('');
    setEditCard((prev) => ({ ...prev, image: path }));
    setImagePreviewNonce((v) => v + 1);
    setCropDraft(null);
  };

  const applyCropAndUpload = async () => {
    if (!cropDraft) return;
    const image = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = cropDraft.sourceUrl;
    });
    if (!loaded) {
      setEditError(imageToolErrors.processImage);
      return;
    }

    const { sx, sy, sw, sh } = getAspectLockedCropRect(cropDraft, image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setEditError(imageToolErrors.processImage);
      return;
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

    let outDataUrl = canvas.toDataURL('image/webp', cropQuality);
    let outFilename = cropDraft.filename.replace(/\.[^.]+$/u, '') || cropDraft.filename || 'card-image';
    outFilename = `${outFilename}.webp`;
    if (!outDataUrl.startsWith('data:image/webp')) {
      outDataUrl = canvas.toDataURL('image/jpeg', cropQuality);
      outFilename = outFilename.replace(/\.webp$/u, '.jpg');
    }
    const path = await uploadDataUrl(outFilename, outDataUrl, editCard.id, cardModuleId);
    if (!path) return;
    setEditError('');
    setEditCard((prev) => ({ ...prev, image: path }));
    setImagePreviewNonce((v) => v + 1);
    setCropDraft(null);
  };

  const cancelCropDraft = () => {
    setCropDraft(null);
    setEditError('');
  };

  const uploadDeckBackImage = async (file: File | null) => {
    if (!file) return;
    const optimized = await optimizeBlobForUpload(file, file.name, { maxWidth: 1600, maxHeight: 2400, quality: 0.85 });
    const dataUrl = optimized?.dataUrl ?? (await blobToDataUrl(file));
    if (!dataUrl) {
      setEditError(imageToolErrors.readImageFile);
      return;
    }
    const path = await uploadDataUrl(optimized?.filename ?? file.name, dataUrl, 'deck-back');
    if (!path) return;
    onSetDeckBackImage(path);
    setDeckBackImageInput(path);
    setImagePreviewNonce((v) => v + 1);
  };

  return {
    cropDraft,
    setCropDraft,
    cropPreviewRef,
    attachImageFile,
    startCropFromCurrentImage,
    uploadOriginalFromCropDraft,
    applyCropAndUpload,
    cancelCropDraft,
    uploadDeckBackImage,
  };
};
