import { useEffect, useMemo, useState } from 'react';
import type { DeckTarget } from '../game/jojGame';
import { normalizeImagePath } from '../game/imagePaths';
import type { CardCategory, CardDefinition, EffectResource } from '../game/types';
import { rankLabel } from './i18n';
import { text } from './i18n';
import { HoverImage } from './admin/HoverImage';
import { blobToDataUrl, optimizeBlobForUpload, uploadAdminImageDataUrl } from './admin/imageUpload';
import { useAdminGitActions } from './admin/useAdminGitActions';
import { useAdminImageTools } from './admin/useAdminImageTools';
import { useAdminRanksEditor } from './admin/useAdminRanksEditor';
import { useAdminSimulation } from './admin/useAdminSimulation';
import {
  blankCard,
  categories,
  effectResourceKeys,
  effectsToValues,
  getAspectLockedCropRect,
  rankResourceKeys,
  valuesToEffects,
  zeroEffectValues,
} from './admin/helpers';
import type {
  AdminStorageMode,
  AdminPageProps,
  AdminTab,
  CategoryFilter,
  ImportCategoryMode,
  SharedDeckTemplate,
} from './admin/types';
import {
  AdminImportTab,
  AdminDeckTab,
  AdminDatabaseTab,
  AdminMatchesTab,
  AdminRanksTab,
  AdminSettingsTab,
  AdminSimulationTab,
  AdminStateTab,
  AdminTabButtons,
} from './admin/tabs';

export const AdminPage = ({
  lang,
  adminToken,
  serverUrl,
  serverUrlDraft,
  onServerUrlDraftChange,
  onSaveServerUrl,
  onResetServerUrl,
  storageMode,
  onStorageModeChange,
  dbConfigDraft,
  onDbConfigDraftChange,
  onSaveDbConfigDraft,
  onTestDbConnection,
  dbConfigSaveStatus,
  dbConnectionTestStatus,
  dbConnectionTestError,
  dbConnectionTestRunning,
  onExportDbSchema,
  onImportDbSchema,
  onImportJsonConfigToDb,
  onExportDbBackup,
  onRestoreDbBackup,
  dbExportSchemaStatus,
  dbExportSchemaError,
  dbExportSchemaRunning,
  dbImportSchemaStatus,
  dbImportSchemaError,
  dbImportSchemaRunning,
  dbImportJsonConfigStatus,
  dbImportJsonConfigError,
  dbImportJsonConfigRunning,
  dbExportBackupStatus,
  dbExportBackupError,
  dbExportBackupRunning,
  dbRestoreBackupStatus,
  dbRestoreBackupError,
  dbRestoreBackupRunning,
  matches,
  activeMatchId,
  onActiveMatchIdChange,
  snapshot,
  deckStats,
  sharedDeckTemplate,
  cardCatalog,
  sharedRanks,
  sharedConfigLoaded,
  onCreateMatch,
  onResetMatch,
  onDeleteMatch,
  onResetAll,
  onRestartServer,
  onShuffleDeck,
  onAddCard,
  onAddCustomCard,
  onUpdateCard,
  onRemoveCard,
  onResetTemplate,
  onSetDeckBackImage,
  onExportTemplate,
  onImportTemplate,
  onUpdateRanks,
  onResetRanks,
  onStopGame,
  onRunSimulations,
}: AdminPageProps) => {
  const t = text(lang);
  const adminHeaders = () => ({ ...(adminToken.trim() ? { 'x-admin-token': adminToken.trim() } : {}) });
  const localizedRankName = (rankId: string) =>
    sharedRanks.find((row) => row.id === rankId)?.name ?? rankLabel(rankId, lang);
  const activeMatch = matches.find((m) => m.id === activeMatchId);
  const [target, setTarget] = useState<DeckTarget>('deck');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [selectedCardId, setSelectedCardId] = useState<string>(cardCatalog[0]?.id ?? '');
  const targetAwareCatalog = useMemo(() => {
    const isLegendaryId = (id: string) => /^legendary-/i.test(id);
    if (target === 'deck') {
      return cardCatalog.filter((card) => !isLegendaryId(card.id));
    }
    if (target === 'legendaryDeck') {
      return cardCatalog.filter((card) => isLegendaryId(card.id));
    }
    return cardCatalog;
  }, [cardCatalog, target]);
  const filteredCatalog = useMemo(
    () => (
      categoryFilter === 'ALL'
        ? targetAwareCatalog
        : targetAwareCatalog.filter((card) => card.category === categoryFilter)
    ),
    [targetAwareCatalog, categoryFilter],
  );
  const selectedCard = useMemo(
    () => filteredCatalog.find((card) => card.id === selectedCardId),
    [filteredCatalog, selectedCardId],
  );
  useEffect(() => {
    const exists = filteredCatalog.some((card) => card.id === selectedCardId);
    if (!exists) {
      setSelectedCardId(filteredCatalog[0]?.id ?? '');
    }
  }, [filteredCatalog, selectedCardId]);

  const [editTarget, setEditTarget] = useState<DeckTarget>('deck');
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [editCard, setEditCard] = useState<CardDefinition>(blankCard());
  const [editEffectValues, setEditEffectValues] = useState<Record<EffectResource, number>>(zeroEffectValues());
  const [editEffectsText, setEditEffectsText] = useState<string>('[]');
  const [editError, setEditError] = useState<string>('');
  const [importJson, setImportJson] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [importStatus, setImportStatus] = useState<string>('');
  const [importTarget, setImportTarget] = useState<DeckTarget>('deck');
  const [importCategoryMode, setImportCategoryMode] = useState<ImportCategoryMode>('AS_IS');
  const [imagePreviewNonce, setImagePreviewNonce] = useState<number>(0);
  const [restartingServer, setRestartingServer] = useState<boolean>(false);
  const [adminActionError, setAdminActionError] = useState<string>('');
  const [imageRegenRunning, setImageRegenRunning] = useState<boolean>(false);
  const [stopGameRunning, setStopGameRunning] = useState<boolean>(false);
  const [stopGameError, setStopGameError] = useState<string>('');
  const [stopGameStatus, setStopGameStatus] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminTab>('matches');
  const [deckBackImageInput, setDeckBackImageInput] = useState<string>(sharedDeckTemplate.deckBackImage ?? '');
  const {
    simulationPlayers,
    setSimulationPlayers,
    simulationCount,
    setSimulationCount,
    simulationGameMode,
    setSimulationGameMode,
    simulationReport,
    simulationRunning,
    simulationError,
    simulationBlockedReason,
    runSimulation,
  } = useAdminSimulation({
    onRunSimulations,
    configSignature: JSON.stringify({
      loaded: sharedConfigLoaded,
      deck: sharedDeckTemplate.deck.length,
      legendaryDeck: sharedDeckTemplate.legendaryDeck.length,
      ranks: sharedRanks.length,
    }),
    blockedReason: sharedConfigLoaded
      ? ''
      : (lang === 'uk'
        ? 'Симуляція буде доступна після завантаження шаблону колоди та звань.'
        : 'Simulation will be available after deck template and ranks are loaded.'),
  });
  const {
    gitStatus,
    gitStatusLoading,
    gitUpdateRunning,
    gitDeployRunning,
    gitActionMessage,
    gitActionLog,
    setGitActionMessage,
    setGitActionLog,
    checkGitUpdates,
    applyGitUpdate,
    applyGitDeploy,
  } = useAdminGitActions({
    lang,
    serverUrl,
    adminHeaders,
    setAdminActionError,
  });

  useEffect(() => {
    setDeckBackImageInput(sharedDeckTemplate.deckBackImage ?? '');
  }, [sharedDeckTemplate.deckBackImage]);

  useEffect(() => {
    setStopGameError('');
    setStopGameStatus('');
  }, [activeMatchId]);

  const stopGame = async () => {
    if (!activeMatchId || stopGameRunning) return;
    setStopGameError('');
    setStopGameStatus('');
    setStopGameRunning(true);
    try {
      const result = await onStopGame(activeMatchId);
      if (!result.ok) {
        setStopGameError(result.error ?? t.stateStopGameFailed);
        return;
      }
      setStopGameStatus(t.stateStopGameSuccess);
    } catch {
      setStopGameError(t.stateStopGameFailed);
    } finally {
      setStopGameRunning(false);
    }
  };

  const beginEdit = (nextTarget: DeckTarget, index: number, card: CardDefinition) => {
    setEditTarget(nextTarget);
    setEditIndex(index);
    setEditCard({
      ...card,
      image: card.image ?? '',
      flavor: card.flavor ?? '',
      effects: card.effects?.map((effect) => ({ ...effect })),
    });
    const nextEffectValues = effectsToValues(card.effects);
    setEditEffectValues(nextEffectValues);
    setEditEffectsText(JSON.stringify(valuesToEffects(nextEffectValues), null, 2));
    setEditError('');
  };

  const parseEffects = (): CardDefinition['effects'] | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editEffectsText || '[]');
    } catch {
      setEditError(t.invalidEffectsJson);
      return null;
    }
    if (!Array.isArray(parsed)) {
      setEditError(t.effectsMustBeArray);
      return null;
    }
    const effects: NonNullable<CardDefinition['effects']> = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        setEditError(t.invalidEffectItem);
        return null;
      }
      const row = item as Record<string, unknown>;
      if (typeof row.resource !== 'string' || !effectResourceKeys.includes(row.resource as EffectResource)) {
        setEditError(t.invalidEffectResource);
        return null;
      }
      if (typeof row.value !== 'number') {
        setEditError(t.invalidEffectValue);
        return null;
      }
      effects.push({ resource: row.resource as EffectResource, value: row.value });
    }
    setEditEffectValues(effectsToValues(effects));
    setEditError('');
    return effects;
  };

  const saveEdit = () => {
    if (editIndex < 0) return;
    if (!editCard.id.trim() || !editCard.title.trim()) return;
    const effects = parseEffects();
    if (effects === null) return;
    onUpdateCard(editTarget, editIndex, {
      ...editCard,
      id: editCard.id.trim(),
      title: editCard.title.trim(),
      image: normalizeImagePath(editCard.image?.trim()),
      flavor: editCard.flavor?.trim() || undefined,
      effects,
    });
  };

  const addFromForm = () => {
    if (!editCard.id.trim() || !editCard.title.trim()) return;
    const effects = parseEffects();
    if (effects === null) return;
    onAddCustomCard(editTarget, {
      ...editCard,
      id: editCard.id.trim(),
      title: editCard.title.trim(),
      image: normalizeImagePath(editCard.image?.trim()),
      flavor: editCard.flavor?.trim() || undefined,
      effects,
    });
  };

  const runImport = () => {
    setImportStatus('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setImportError(t.invalidJson);
      return;
    }

    const toCardList = (value: unknown): CardDefinition[] | null => {
      if (Array.isArray(value)) return value as CardDefinition[];
      if (!value || typeof value !== 'object') return null;
      const raw = value as Record<string, unknown>;
      const deck = Array.isArray(raw.deck) ? (raw.deck as CardDefinition[]) : [];
      const legendaryDeck = Array.isArray(raw.legendaryDeck) ? (raw.legendaryDeck as CardDefinition[]) : [];
      const rankTrack = Array.isArray(raw.rankTrack) ? (raw.rankTrack as CardDefinition[]) : [];
      const catalog = Array.isArray(raw.catalog) ? (raw.catalog as CardDefinition[]) : [];
      const merged = [...deck, ...legendaryDeck, ...rankTrack];
      if (merged.length > 0) return merged;
      if (catalog.length > 0) return catalog;
      return null;
    };

    const cards = toCardList(parsed);
    if (!cards) {
      setImportError(t.importShapeError);
      return;
    }

    const canOverrideImportCategory = importTarget === 'deck';
    const effectiveImportCategoryMode: ImportCategoryMode = canOverrideImportCategory ? importCategoryMode : 'AS_IS';

    const normalizedCards = cards.map((card) => ({
      ...card,
      category: effectiveImportCategoryMode === 'AS_IS' ? card.category : effectiveImportCategoryMode,
      image: normalizeImagePath(card.image),
    }));

    const nextTemplate: SharedDeckTemplate = {
      deck: sharedDeckTemplate.deck.map((card) => ({ ...card })),
      legendaryDeck: sharedDeckTemplate.legendaryDeck.map((card) => ({ ...card })),
      rankTrack: sharedDeckTemplate.rankTrack.map((card) => ({ ...card })),
      deckBackImage: sharedDeckTemplate.deckBackImage,
      [importTarget]: [...sharedDeckTemplate[importTarget], ...normalizedCards],
    };

    const error = onImportTemplate(JSON.stringify(nextTemplate, null, 2));
    if (error) {
      setImportError(error);
      setImportStatus('');
      return;
    }
    setImportError('');
    const targetLabel = importTarget === 'deck'
      ? t.mainDeck
      : importTarget === 'legendaryDeck'
        ? t.legendaryDeckLabel
        : t.rankTrackDeckLabel;
    const suffix = effectiveImportCategoryMode === 'AS_IS' ? t.importCategoryAsIs : effectiveImportCategoryMode;
    setImportStatus(
      lang === 'uk'
        ? `Імпорт успішний: додано ${normalizedCards.length} карт у «${targetLabel}» (категорія: ${suffix}).`
        : `Import successful: added ${normalizedCards.length} cards to "${targetLabel}" (category: ${suffix}).`,
    );
  };
  const exportToFile = () => {
    const json = onExportTemplate();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `joj-shared-deck-template-${stamp}.json`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setImportJson(json);
  };
  const uploadDataUrl = async (filename: string, dataUrl: string, cardId?: string): Promise<string | null> => {
    const { path, error } = await uploadAdminImageDataUrl({
      serverUrl,
      adminHeaders,
      filename,
      dataUrl,
      cardId,
    });
    if (!path) {
      setEditError(error ?? (lang === 'uk' ? 'Помилка завантаження' : 'Upload failed'));
      return null;
    }
    return path;
  };
  const {
    cropDraft,
    setCropDraft,
    cropPreviewRef,
    attachImageFile,
    startCropFromCurrentImage,
    uploadOriginalFromCropDraft,
    applyCropAndUpload,
    cancelCropDraft,
    uploadDeckBackImage,
  } = useAdminImageTools({
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
    cropQuality: 0.85,
  });
  const {
    editableRanks,
    rankDraft,
    setRankDraft,
    ranksJson,
    setRanksJson,
    ranksImportError,
    setRanksImportError,
    ranksImportStatus,
    setRanksImportStatus,
    updateRankAt,
    attachRankImageFile,
    attachRankDraftImageFile,
    saveRanks,
    addRank,
    removeRankAt,
    exportRanksToFile,
    importRanks,
    importRanksFromFile,
  } = useAdminRanksEditor({
    lang,
    t,
    sharedRanks,
    onUpdateRanks,
    optimizeBlobForUpload,
    uploadDataUrl,
  });
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
        // Ignore delete failures for files that may already be gone or reused.
        if (await deleteUploadedImage(oldPath)) deletedOriginals += 1;
        else if (errorLines.length < 80) errorLines.push(`delete: ${oldPath} :: failed`);
      }

      setGitActionMessage(
        lang === 'uk'
          ? `Перегенерацію завершено. Перевірено: ${scanned}, оновлено: ${updated}, пропущено webp: ${skippedWebp}, видалено оригінали: ${deletedOriginals}, помилок: ${failed}.`
          : `Regeneration complete. Scanned: ${scanned}, updated: ${updated}, skipped webp: ${skippedWebp}, deleted originals: ${deletedOriginals}, failed: ${failed}.`,
      );
      if (errorLines.length > 0) {
        setGitActionLog(
          [
            lang === 'uk' ? 'Лог перегенерації (перші помилки):' : 'Regeneration log (first errors):',
            ...errorLines,
            failed > errorLines.length
              ? (lang === 'uk'
                  ? `... ще ${failed - errorLines.length} помилок`
                  : `... and ${failed - errorLines.length} more errors`)
              : '',
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
  const importFromFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setImportJson(text);
    };
    reader.readAsText(file);
  };

  const withCacheBust = (src?: string) => {
    const value = src ?? '';
    return `${value}${value.includes('?') ? '&' : '?'}v=${imagePreviewNonce}`;
  };
  const imageSrc = normalizeImagePath(selectedCard?.image) ?? (selectedCard ? `/cards/${selectedCard.id}.png` : '');
  const getImageSrc = (card: CardDefinition) => normalizeImagePath(card.image) ?? `/cards/${card.id}.png`;
  const closeEditor = () => {
    setEditIndex(-1);
    setEditError('');
  };
  const inlineEditor = (
    <div className="admin-inline-editor">
      <h4>{t.cardEditor}</h4>
      <div className="admin-editor-grid">
        <label>{t.fieldId}<input value={editCard.id} onChange={(e) => setEditCard((prev) => ({ ...prev, id: e.target.value }))} /></label>
        <label>{t.fieldTitle}<input value={editCard.title} onChange={(e) => setEditCard((prev) => ({ ...prev, title: e.target.value }))} /></label>
        {editTarget !== 'legendaryDeck' ? (
          <label>{t.fieldCategory}
            <select value={editCard.category} onChange={(e) => setEditCard((prev) => ({ ...prev, category: e.target.value as CardCategory }))}>
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </label>
        ) : null}
        <label>{t.fieldImagePath}
          <input value={editCard.image ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, image: e.target.value }))} />
        </label>
        <label>{t.fieldImageFile}
          <input type="file" accept="image/*" onChange={(e) => attachImageFile(e.target.files?.[0] ?? null)} />
        </label>
        {cropDraft ? (
          <div className="admin-crop-editor">
            <p><strong>{t.cropEditorTitle}</strong></p>
            <p>{t.cropAspectLocked}</p>
            {cropDraft.sourceWidth > 0 && cropDraft.sourceHeight > 0 ? (
              <p>{t.cropSourceSize}: {cropDraft.sourceWidth}x{cropDraft.sourceHeight}px</p>
            ) : null}
            <div className="admin-crop-grid">
              <label>{t.cropTop}
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropDraft.sourceHeight - 1)}
                  value={cropDraft.topPx}
                  onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, topPx: Number(e.target.value || 0) } : prev))}
                />
              </label>
              <label>{t.cropRight}
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropDraft.sourceWidth - 1)}
                  value={cropDraft.rightPx}
                  onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, rightPx: Number(e.target.value || 0) } : prev))}
                />
              </label>
              <label>{t.cropBottom}
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropDraft.sourceHeight - 1)}
                  value={cropDraft.bottomPx}
                  onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, bottomPx: Number(e.target.value || 0) } : prev))}
                />
              </label>
              <label>{t.cropLeft}
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropDraft.sourceWidth - 1)}
                  value={cropDraft.leftPx}
                  onChange={(e) => setCropDraft((prev) => (prev ? { ...prev, leftPx: Number(e.target.value || 0) } : prev))}
                />
              </label>
            </div>
            <canvas className="admin-crop-preview" ref={cropPreviewRef} />
            <p className="admin-controls">
              <button type="button" onClick={applyCropAndUpload}>{t.applyCropUpload}</button>
              <button type="button" onClick={uploadOriginalFromCropDraft}>{t.uploadWithoutCrop}</button>
              <button type="button" onClick={cancelCropDraft}>{t.cancelCrop}</button>
            </p>
          </div>
        ) : null}
        {editCard.image ? (
          <label>{t.fieldImagePreview}
            <HoverImage
              src={withCacheBust(editCard.image)}
              className="admin-thumb"
              alt={t.fieldImagePreview}
              onLoad={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'inline-block';
                (e.currentTarget as HTMLImageElement).style.visibility = 'visible';
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="admin-controls">
              <button type="button" onClick={startCropFromCurrentImage}>
                {t.cropCurrentImage}
              </button>
            </span>
          </label>
        ) : null}
        <label>{t.fieldQuickImagePath}
          <span className="admin-controls">
            <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/cards/${prev.id || 'card-id'}.png` }))}>
              /cards/&lt;id&gt;.png
            </button>
            <button type="button" onClick={() => setEditCard((prev) => ({ ...prev, image: `/cards/${prev.id || 'card-id'}.webp` }))}>
              /cards/&lt;id&gt;.webp
            </button>
          </span>
        </label>
        <label>{t.fieldFlavor}
          <input value={editCard.flavor ?? ''} onChange={(e) => setEditCard((prev) => ({ ...prev, flavor: e.target.value }))} />
        </label>
      </div>
      <label>
        {t.effectsJson}
        <textarea
          className="admin-textarea"
          value={editEffectsText}
          onChange={(e) => {
            const next = e.target.value;
            setEditEffectsText(next);
            try {
              const parsed = JSON.parse(next || '[]');
              if (Array.isArray(parsed)) {
                const effects: NonNullable<CardDefinition['effects']> = [];
                for (const item of parsed) {
                  if (!item || typeof item !== 'object') continue;
                  const row = item as Record<string, unknown>;
                  if (
                    typeof row.resource === 'string' &&
                    effectResourceKeys.includes(row.resource as EffectResource) &&
                    typeof row.value === 'number'
                  ) {
                    effects.push({ resource: row.resource as EffectResource, value: row.value });
                  }
                }
                setEditEffectValues(effectsToValues(effects));
              }
            } catch {
              // keep current numeric values while JSON is being typed
            }
          }}
        />
      </label>
      <h5>{t.effectsDelta}</h5>
      <div className="admin-editor-grid">
        {effectResourceKeys.map((key) => (
          <label key={`effect-${key}`}>{key}
            <input
              type="number"
              value={editEffectValues[key]}
              onChange={(e) => {
                const value = Number(e.target.value || 0);
                setEditEffectValues((prev) => {
                  const next = { ...prev, [key]: value };
                  setEditEffectsText(JSON.stringify(valuesToEffects(next), null, 2));
                  return next;
                });
              }}
            />
          </label>
        ))}
      </div>
      {editError ? <p className="admin-error">{editError}</p> : null}
      <p className="admin-controls">
        <button type="button" onClick={saveEdit}>{t.saveCard}</button>
        <button type="button" onClick={addFromForm}>{t.addCustomCard}</button>
        <button type="button" onClick={closeEditor}>{t.close}</button>
      </p>
    </div>
  );

  return (
    <section className="board admin-panel">
      <h2>{t.adminTitle}</h2>
      <AdminTabButtons t={t} activeTab={activeTab} setActiveTab={setActiveTab} />
      <hr />
      {activeTab === 'matches' ? (
        <AdminMatchesTab
          t={t}
          matchIds={matches.map((m) => m.id)}
          matchesCount={matches.length}
          activeMatchId={activeMatchId}
          onActiveMatchIdChange={onActiveMatchIdChange}
          activeMatchCreatedAt={activeMatch?.createdAt}
          onCreateMatch={onCreateMatch}
          onResetMatch={onResetMatch}
          onDeleteMatch={onDeleteMatch}
          canDelete={matches.length > 0}
        />
      ) : null}

      {activeTab === 'settings' ? (
        <AdminSettingsTab
          t={t}
          lang={lang}
          serverUrlDraft={serverUrlDraft}
          onServerUrlDraftChange={onServerUrlDraftChange}
          onSaveServerUrl={onSaveServerUrl}
          onResetServerUrl={onResetServerUrl}
          serverUrl={serverUrl}
          checkGitUpdates={checkGitUpdates}
          applyGitUpdate={applyGitUpdate}
          applyGitDeploy={applyGitDeploy}
          gitStatus={gitStatus}
          gitStatusLoading={gitStatusLoading}
          gitUpdateRunning={gitUpdateRunning}
          gitDeployRunning={gitDeployRunning}
          gitActionMessage={gitActionMessage}
          gitActionLog={gitActionLog}
          onResetAll={onResetAll}
          regenerateAllTemplateImages={regenerateAllTemplateImages}
          imageRegenRunning={imageRegenRunning}
          restartingServer={restartingServer}
          setAdminActionError={setAdminActionError}
          setRestartingServer={setRestartingServer}
          onRestartServer={onRestartServer}
          adminActionError={adminActionError}
        />
      ) : null}
      {activeTab === 'database' ? (
        <AdminDatabaseTab
          t={t}
          storageMode={storageMode as AdminStorageMode}
          onStorageModeChange={onStorageModeChange}
          dbConfigDraft={dbConfigDraft}
          onDbConfigDraftChange={onDbConfigDraftChange}
          onSaveDbConfigDraft={onSaveDbConfigDraft}
          onTestDbConnection={onTestDbConnection}
          dbConfigSaveStatus={dbConfigSaveStatus}
          dbConnectionTestStatus={dbConnectionTestStatus}
          dbConnectionTestError={dbConnectionTestError}
          dbConnectionTestRunning={dbConnectionTestRunning}
          onExportDbSchema={onExportDbSchema}
          onImportDbSchema={onImportDbSchema}
          onImportJsonConfigToDb={onImportJsonConfigToDb}
          onExportDbBackup={onExportDbBackup}
          onRestoreDbBackup={onRestoreDbBackup}
          dbExportSchemaStatus={dbExportSchemaStatus}
          dbExportSchemaError={dbExportSchemaError}
          dbExportSchemaRunning={dbExportSchemaRunning}
          dbImportSchemaStatus={dbImportSchemaStatus}
          dbImportSchemaError={dbImportSchemaError}
          dbImportSchemaRunning={dbImportSchemaRunning}
          dbImportJsonConfigStatus={dbImportJsonConfigStatus}
          dbImportJsonConfigError={dbImportJsonConfigError}
          dbImportJsonConfigRunning={dbImportJsonConfigRunning}
          dbExportBackupStatus={dbExportBackupStatus}
          dbExportBackupError={dbExportBackupError}
          dbExportBackupRunning={dbExportBackupRunning}
          dbRestoreBackupStatus={dbRestoreBackupStatus}
          dbRestoreBackupError={dbRestoreBackupError}
          dbRestoreBackupRunning={dbRestoreBackupRunning}
        />
      ) : null}

      {activeTab === 'deck' ? (
        <AdminDeckTab
          t={t}
          lang={lang}
          deckStats={deckStats}
          target={target === 'rankTrack' ? 'deck' : target}
          setTarget={(v) => setTarget(v as DeckTarget)}
          categoryFilter={categoryFilter}
          setCategoryFilter={(v) => setCategoryFilter(v as CategoryFilter)}
          categories={categories}
          selectedCardId={selectedCardId}
          setSelectedCardId={setSelectedCardId}
          filteredCatalog={filteredCatalog}
          onAddCard={(tabTarget, cardId) => onAddCard(tabTarget as DeckTarget, cardId)}
          selectedCard={selectedCard}
          withCacheBust={withCacheBust}
          imageSrc={imageSrc}
          onShuffleDeck={onShuffleDeck}
          onResetTemplate={onResetTemplate}
          deckBackImageInput={deckBackImageInput}
          setDeckBackImageInput={setDeckBackImageInput}
          onSetDeckBackImage={onSetDeckBackImage}
          uploadDeckBackImage={uploadDeckBackImage}
          sharedDeckTemplate={sharedDeckTemplate}
          getImageSrc={getImageSrc}
          beginEdit={(tabTarget, index, card) => beginEdit(tabTarget as DeckTarget, index, card)}
          onRemoveCard={(tabTarget, index) => onRemoveCard(tabTarget as DeckTarget, index)}
          editTarget={editTarget === 'rankTrack' ? 'deck' : editTarget}
          editIndex={editIndex}
          inlineEditor={inlineEditor}
        />
      ) : null}

      {activeTab === 'import' ? (
        <AdminImportTab
          t={t}
          importTarget={importTarget === 'rankTrack' ? 'deck' : importTarget}
          setImportTarget={(v) => setImportTarget(v as DeckTarget)}
          importCategoryMode={importCategoryMode}
          setImportCategoryMode={(v) => setImportCategoryMode(v as ImportCategoryMode)}
          categories={categories}
          runImport={runImport}
          importFromFile={importFromFile}
          exportToFile={exportToFile}
          importError={importError}
          importStatus={importStatus}
          importJson={importJson}
          setImportJson={setImportJson}
          clearImportStatus={() => setImportStatus('')}
        />
      ) : null}

      {activeTab === 'state' ? (
        <AdminStateTab
          t={t}
          snapshot={snapshot}
          activeMatchId={activeMatchId}
          stopGameRunning={stopGameRunning}
          stopGameError={stopGameError}
          stopGameStatus={stopGameStatus}
          localizedRankName={localizedRankName}
          onStopGame={() => { void stopGame(); }}
        />
      ) : null}
      {activeTab === 'ranks' ? (
        <AdminRanksTab
          t={t}
          exportRanksToFile={exportRanksToFile}
          importRanks={importRanks}
          importRanksFromFile={importRanksFromFile}
          ranksImportError={ranksImportError}
          ranksImportStatus={ranksImportStatus}
          ranksJson={ranksJson}
          setRanksJson={setRanksJson}
          setRanksImportError={setRanksImportError}
          setRanksImportStatus={setRanksImportStatus}
          editableRanks={editableRanks}
          updateRankAt={updateRankAt}
          attachRankImageFile={attachRankImageFile}
          rankResourceKeys={rankResourceKeys}
          removeRankAt={removeRankAt}
          rankDraft={rankDraft}
          setRankDraft={setRankDraft}
          attachRankDraftImageFile={attachRankDraftImageFile}
          saveRanks={saveRanks}
          addRank={addRank}
          onResetRanks={onResetRanks}
        />
      ) : null}
      {activeTab === 'simulation' ? (
        <AdminSimulationTab
          t={t}
          lang={lang}
          simulationPlayers={simulationPlayers}
          setSimulationPlayers={setSimulationPlayers}
          simulationCount={simulationCount}
          setSimulationCount={setSimulationCount}
          simulationGameMode={simulationGameMode}
          setSimulationGameMode={setSimulationGameMode}
          simulationRunning={simulationRunning}
          runSimulation={runSimulation}
          simulationReport={simulationReport}
          simulationError={simulationError}
          simulationBlockedReason={simulationBlockedReason}
          localizedRankName={localizedRankName}
        />
      ) : null}
      <p>
        <a href="/">{t.openGame}</a>
      </p>
    </section>
  );
};
