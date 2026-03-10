import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DeckTarget } from '../../game/jojGame';
import { normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition } from '../../game/types';
import type { Language } from '../i18n';
import type { SharedDeckTemplate } from './types';

type Params = {
  lang: Language;
  t: ReturnType<typeof import('../i18n').text>;
  serverUrl: string;
  adminHeaders: () => Record<string, string>;
  sharedDeckTemplate: SharedDeckTemplate;
  optimizeBlobForUpload: (
    blob: Blob,
    filename: string,
    options?: { maxWidth?: number; maxHeight?: number; quality?: number },
  ) => Promise<{ dataUrl: string; filename: string } | null>;
  uploadDataUrl: (filename: string, dataUrl: string, cardId?: string) => Promise<string | null>;
  onUpdateCard: (target: DeckTarget, index: number, card: CardDefinition) => void;
  onSetDeckBackImage: (path?: string) => void;
  setAdminActionError: (value: string) => void;
  setGitActionMessage: (value: string) => void;
  setGitActionLog: (value: string) => void;
  setImagePreviewNonce: Dispatch<SetStateAction<number>>;
};

export const useAdminImageRegeneration = ({
  t,
  serverUrl,
  adminHeaders,
  sharedDeckTemplate,
  optimizeBlobForUpload,
  uploadDataUrl,
  onUpdateCard,
  onSetDeckBackImage,
  setAdminActionError,
  setGitActionMessage,
  setGitActionLog,
  setImagePreviewNonce,
}: Params) => {
  const [imageRegenRunning, setImageRegenRunning] = useState(false);

  const regenerateAllTemplateImages = async () => {
    if (imageRegenRunning) return;
    setImageRegenRunning(true);
    setAdminActionError('');
    setGitActionMessage('');
    setGitActionLog('');

    const normalizeLocalCardPath = (value?: string) => {
      if (!value) return null;
      const normalized = normalizeImagePath(value);
      if (!normalized) return null;
      return normalized.startsWith('/cards/') ? normalized : null;
    };

    let scanned = 0;
    let updated = 0;
    let failed = 0;
    let skippedWebp = 0;
    let deletedOriginals = 0;
    const errorLines: string[] = [];
    const transformedBySource = new Map<string, string | null>();
    const originalsToDelete = new Set<string>();
    const pushRegenError = (stage: string, filePath: string, details?: string) => {
      failed += 1;
      if (errorLines.length < 80) {
        errorLines.push(`${stage}: ${filePath}${details ? ` :: ${details}` : ''}`);
      }
    };

    const deleteUploadedImage = async (imagePath: string): Promise<boolean> => {
      try {
        const response = await fetch(`${serverUrl}/api/admin/delete-card-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...adminHeaders(),
          },
          body: JSON.stringify({ path: imagePath }),
        });
        const payload = (await response.json()) as { ok?: boolean };
        return Boolean(response.ok && payload.ok);
      } catch {
        return false;
      }
    };

    const shouldConvertPath = (localPath: string) => {
      const clean = localPath.split('?')[0].toLowerCase();
      if (clean.endsWith('.webp')) return false;
      return clean.endsWith('.png') || clean.endsWith('.jpg') || clean.endsWith('.jpeg') || clean.endsWith('.bmp');
    };

    try {
      const processCardList = async (targetName: DeckTarget, cards: CardDefinition[]) => {
        for (let i = 0; i < cards.length; i += 1) {
          const card = cards[i];
          const localPath = normalizeLocalCardPath(card.image);
          if (!localPath) continue;
          scanned += 1;
          if (!shouldConvertPath(localPath)) {
            if (localPath.toLowerCase().split('?')[0].endsWith('.webp')) skippedWebp += 1;
            continue;
          }
          if (transformedBySource.has(localPath)) {
            const cachedNewPath = transformedBySource.get(localPath);
            if (cachedNewPath && cachedNewPath !== card.image) {
              onUpdateCard(targetName, i, { ...card, image: cachedNewPath });
              updated += 1;
            }
            continue;
          }
          try {
            const response = await fetch(`${localPath}${localPath.includes('?') ? '&' : '?'}regen=${Date.now()}`);
            if (!response.ok) {
              transformedBySource.set(localPath, null);
              pushRegenError('fetch', localPath, `HTTP ${response.status}`);
              continue;
            }
            const blob = await response.blob();
            const fileName = localPath.split('/').pop() || `${card.id}.png`;
            const optimized = await optimizeBlobForUpload(blob, fileName);
            if (!optimized?.dataUrl) {
              transformedBySource.set(localPath, null);
              pushRegenError('optimize', localPath, 'canvas encode failed');
              continue;
            }
            const nextPath = await uploadDataUrl(optimized.filename, optimized.dataUrl, card.id);
            if (!nextPath) {
              transformedBySource.set(localPath, null);
              pushRegenError('upload', localPath, 'upload endpoint failed');
              continue;
            }
            transformedBySource.set(localPath, nextPath);
            onUpdateCard(targetName, i, { ...card, image: nextPath });
            if (nextPath !== localPath) originalsToDelete.add(localPath);
            updated += 1;
          } catch {
            transformedBySource.set(localPath, null);
            pushRegenError('exception', localPath);
          }
        }
      };

      await processCardList('deck', sharedDeckTemplate.deck);
      await processCardList('legendaryDeck', sharedDeckTemplate.legendaryDeck);
      await processCardList('rankTrack', sharedDeckTemplate.rankTrack);

      const deckBackLocalPath = normalizeLocalCardPath(sharedDeckTemplate.deckBackImage);
      if (deckBackLocalPath) {
        scanned += 1;
        if (!shouldConvertPath(deckBackLocalPath)) {
          if (deckBackLocalPath.toLowerCase().split('?')[0].endsWith('.webp')) skippedWebp += 1;
        } else {
          try {
            const response = await fetch(`${deckBackLocalPath}${deckBackLocalPath.includes('?') ? '&' : '?'}regen=${Date.now()}`);
            if (response.ok) {
              const blob = await response.blob();
              const fileName = deckBackLocalPath.split('/').pop() || 'deck-back.png';
              const optimized = await optimizeBlobForUpload(blob, fileName, { maxWidth: 1600, maxHeight: 2400, quality: 0.85 });
              if (optimized?.dataUrl) {
                const nextPath = await uploadDataUrl(optimized.filename, optimized.dataUrl, 'deck-back');
                if (nextPath) {
                  onSetDeckBackImage(nextPath);
                  if (nextPath !== deckBackLocalPath) originalsToDelete.add(deckBackLocalPath);
                  updated += 1;
                } else {
                  pushRegenError('upload', deckBackLocalPath, 'upload endpoint failed');
                }
              } else {
                pushRegenError('optimize', deckBackLocalPath, 'canvas encode failed');
              }
            } else {
              pushRegenError('fetch', deckBackLocalPath, `HTTP ${response.status}`);
            }
          } catch {
            pushRegenError('exception', deckBackLocalPath);
          }
        }
      }

      for (const oldPath of originalsToDelete) {
        if (await deleteUploadedImage(oldPath)) deletedOriginals += 1;
        else if (errorLines.length < 80) errorLines.push(`delete: ${oldPath} :: failed`);
      }

      setGitActionMessage(
        `${t.regenDonePrefix}. ${t.regenScannedLabel}: ${scanned}, ${t.regenUpdatedLabel}: ${updated}, ${t.regenSkippedWebpLabel}: ${skippedWebp}, ${t.regenDeletedOriginalsLabel}: ${deletedOriginals}, ${t.regenFailedLabel}: ${failed}.`,
      );
      if (errorLines.length > 0) {
        setGitActionLog(
          [
            t.regenLogHeader,
            ...errorLines,
            failed > errorLines.length ? `... ${failed - errorLines.length} ${t.regenMoreErrors}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
      setImagePreviewNonce((v) => v + 1);
    } finally {
      setImageRegenRunning(false);
    }
  };

  return {
    imageRegenRunning,
    regenerateAllTemplateImages,
  };
};
