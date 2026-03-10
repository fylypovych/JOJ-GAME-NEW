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
import { useAdminTemplateManager } from './admin/useAdminTemplateManager';
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
  ImportCategoryMode,
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
  uiVariant,
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
  onShuffleDeck: _onShuffleDeck,
  onAddCard: _onAddCard,
  onAddCustomCard,
  onUpdateCard,
  onRemoveCard: _onRemoveCard,
  onResetTemplate: _onResetTemplate,
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

  const [editTarget, setEditTarget] = useState<DeckTarget>('deck');
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [editCard, setEditCard] = useState<CardDefinition>(blankCard());
  const [editOriginalCardId, setEditOriginalCardId] = useState<string>('');
  const [editEffectValues, setEditEffectValues] = useState<Record<EffectResource, number>>(zeroEffectValues());
  const [editEffectsText, setEditEffectsText] = useState<string>('[]');
  const [editError, setEditError] = useState<string>('');
  const [imagePreviewNonce, setImagePreviewNonce] = useState<number>(0);
  const [restartingServer, setRestartingServer] = useState<boolean>(false);
  const [adminActionError, setAdminActionError] = useState<string>('');
  const [imageRegenRunning, setImageRegenRunning] = useState<boolean>(false);
  const [stopGameRunning, setStopGameRunning] = useState<boolean>(false);
  const [stopGameError, setStopGameError] = useState<string>('');
  const [stopGameStatus, setStopGameStatus] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminTab>('matches');
  const [createCardModuleId, setCreateCardModuleId] = useState<string>('');
  const [, setDeckBackImageInput] = useState<string>(sharedDeckTemplate.deckBackImage ?? '');
  const optionalSimulationModules = useMemo(
    () => (sharedDeckTemplate.modules ?? [])
      .filter((module) => module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck')
      .map((module) => ({
        id: module.id,
        name: module.name,
        alwaysOn: module.category === 'VVNZ',
      })),
    [sharedDeckTemplate.modules],
  );
  const {
    simulationPlayers,
    setSimulationPlayers,
    simulationCount,
    setSimulationCount,
    simulationGameMode,
    setSimulationGameMode,
    simulationOptionalModuleIds,
    setSimulationOptionalModuleIds,
    simulationReport,
    simulationRunning,
    simulationError,
    simulationBlockedReason,
    runSimulation,
  } = useAdminSimulation({
    onRunSimulations,
    optionalModules: optionalSimulationModules,
    configSignature: JSON.stringify({
      loaded: sharedConfigLoaded,
      deck: sharedDeckTemplate.deck.length,
      legendaryDeck: sharedDeckTemplate.legendaryDeck.length,
      ranks: sharedRanks.length,
    }),
    blockedReason: sharedConfigLoaded
      ? ''
      : t.simulationBlockedByConfig,
  });
  const {
    applyTemplateUpdate,
    deckModules,
    deckManagerStatus,
    setDeckManagerStatus,
    applyModuleAction,
    saveDeckModule,
    deleteDeckModule,
    setLegendaryDeckMode,
    importJson,
    setImportJson,
    importError,
    setImportStatus,
    importStatus,
    importTarget,
    setImportTarget,
    importCategoryMode,
    setImportCategoryMode,
    runImport,
  } = useAdminTemplateManager({
    lang,
    sharedDeckTemplate,
    cardCatalog,
    onImportTemplate,
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

  const openCardEditorAt = (target: DeckTarget, index: number) => {
    const sourceList = sharedDeckTemplate[target];
    const card = sourceList?.[index];
    if (!card) return;
    setEditTarget(target);
    setEditIndex(index);
    setEditOriginalCardId(card.id);
    setEditCard({
      ...card,
      image: card.image ?? '',
      flavor: card.flavor ?? '',
      effects: card.effects?.map((effect) => ({ ...effect })),
    });
    const nextEffectValues = effectsToValues(card.effects);
    setEditEffectValues(nextEffectValues);
    setEditEffectsText(JSON.stringify(valuesToEffects(nextEffectValues), null, 2));
    setCreateCardModuleId('');
    setEditError('');
  };

  const openCardEditorById = (target: DeckTarget, cardId: string) => {
    const list = sharedDeckTemplate[target];
    const inTargetIndex = list.findIndex((row) => row.id === cardId);
    if (inTargetIndex >= 0) {
      openCardEditorAt(target, inTargetIndex);
      return;
    }
    const catalogCard = cardCatalog.find((row) => row.id === cardId);
    if (!catalogCard) return;
    const nextEffectValues = effectsToValues(catalogCard.effects);
    setEditTarget(target);
    setEditIndex(-3);
    setEditOriginalCardId(catalogCard.id);
    setEditCard({
      ...catalogCard,
      image: catalogCard.image ?? '',
      flavor: catalogCard.flavor ?? '',
      effects: catalogCard.effects?.map((effect) => ({ ...effect })),
    });
    setEditEffectValues(nextEffectValues);
    setEditEffectsText(JSON.stringify(valuesToEffects(nextEffectValues), null, 2));
    setCreateCardModuleId('');
    setEditError('');
  };

  const saveEdit = () => {
    if (editIndex < 0 && editIndex !== -3) return;
    if (!editCard.id.trim() || !editCard.title.trim()) return;
    const effects = parseEffects();
    if (effects === null) return;
    const nextCard: CardDefinition = {
      ...editCard,
      id: editCard.id.trim(),
      title: editCard.title.trim(),
      image: normalizeImagePath(editCard.image?.trim()),
      flavor: editCard.flavor?.trim() || undefined,
      effects,
    };
    if (editIndex === -3) {
      const sourceId = editOriginalCardId || nextCard.id;
      const ok = applyTemplateUpdate((nextTemplate) => {
        const rewrite = (cards: CardDefinition[]) => cards.map((row) => (row.id === sourceId ? { ...nextCard } : row));
        const rewriteCatalog = (cards: CardDefinition[]) => {
          let replaced = false;
          const mapped = cards.map((row) => {
            if (row.id !== sourceId) return row;
            replaced = true;
            return { ...nextCard };
          });
          if (!replaced) mapped.push({ ...nextCard });
          return mapped;
        };
        nextTemplate.deck = rewrite(nextTemplate.deck);
        nextTemplate.legendaryDeck = rewrite(nextTemplate.legendaryDeck);
        nextTemplate.rankTrack = rewrite(nextTemplate.rankTrack);
        nextTemplate.catalog = rewriteCatalog(nextTemplate.catalog ?? []);
        nextTemplate.modules = (nextTemplate.modules ?? []).map((module) => ({
          ...module,
          cardIds: module.cardIds.map((id) => (id === sourceId ? nextCard.id : id)),
        }));
      });
      if (!ok) return;
    } else {
      onUpdateCard(editTarget, editIndex, nextCard);
    }
    setCreateCardModuleId('');
    setEditOriginalCardId(nextCard.id);
  };

  const addFromForm = () => {
    if (editIndex !== -2) return;
    if (!editCard.id.trim() || !editCard.title.trim()) return;
    const effects = parseEffects();
    if (effects === null) return;
    const nextCard: CardDefinition = {
      ...editCard,
      id: editCard.id.trim(),
      title: editCard.title.trim(),
      image: normalizeImagePath(editCard.image?.trim()),
      flavor: editCard.flavor?.trim() || undefined,
      effects,
    };
    if (createCardModuleId) {
      const ok = applyTemplateUpdate((nextTemplate) => {
        nextTemplate[editTarget] = [...nextTemplate[editTarget], nextCard];
        nextTemplate.modules = (nextTemplate.modules ?? []).map((module) => (
          module.id === createCardModuleId && !module.cardIds.includes(nextCard.id)
            ? { ...module, cardIds: [...module.cardIds, nextCard.id], cardCount: Math.max(module.cardCount, module.cardIds.length + 1) }
            : module
        ));
      });
      if (!ok) return;
    } else {
      onAddCustomCard(editTarget, nextCard);
    }
    setEditIndex(-1);
    setCreateCardModuleId('');
    setEditError('');
  };

  const startCreateCardForModule = (moduleId: string) => {
    const module = deckModules.find((row) => row.id === moduleId);
    if (module?.category === 'RANK' || module?.target === 'rankTrack') {
      setDeckManagerStatus(t.rankCardsManagedInRanks);
      return;
    }
    const nextTarget: DeckTarget = module?.target ?? 'deck';
    const defaultCategory: CardCategory = module?.defaultCategory
      ?? (module?.category === 'COMMAND' ? 'COMMAND' : undefined)
      ?? (nextTarget === 'legendaryDeck' ? 'LEGENDARY' : 'SUPPORT');
    const fresh = blankCard();
    setEditTarget(nextTarget);
    setEditIndex(-2);
    setEditCard({
      ...fresh,
      category: defaultCategory,
      image: '',
      flavor: '',
      effects: [],
    });
    const nextEffectValues = zeroEffectValues();
    setEditEffectValues(nextEffectValues);
    setEditEffectsText(JSON.stringify(valuesToEffects(nextEffectValues), null, 2));
    setCreateCardModuleId(moduleId);
    setEditError('');
  };

  const removeCardAtFromEditor = (target: DeckTarget, index: number) => {
    const card = sharedDeckTemplate[target]?.[index];
    if (!card) return;
    const ok = applyTemplateUpdate((nextTemplate) => {
      nextTemplate[target] = nextTemplate[target].filter((_, i) => i !== index);
      nextTemplate.modules = (nextTemplate.modules ?? []).map((module) => (
        module.cardIds.includes(card.id)
          ? { ...module, cardIds: module.cardIds.filter((id) => id !== card.id), cardCount: Math.max(0, module.cardCount - 1) }
          : module
      ));
    });
    if (!ok) return;
    if (editTarget === target && editIndex === index) {
      setEditIndex(-1);
      setCreateCardModuleId('');
      setEditOriginalCardId('');
    }
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
      setEditError(error ?? t.uploadFailedGeneric);
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
    uploadDeckBackImage: _uploadDeckBackImage,
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
    attachRankVariantImageFile,
    attachRankDraftImageFile,
    attachRankDraftVariantImageFile,
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
        `${t.regenDonePrefix}. ${t.regenScannedLabel}: ${scanned}, ${t.regenUpdatedLabel}: ${updated}, ${t.regenSkippedWebpLabel}: ${skippedWebp}, ${t.regenDeletedOriginalsLabel}: ${deletedOriginals}, ${t.regenFailedLabel}: ${failed}.`,
      );
      if (errorLines.length > 0) {
        setGitActionLog(
          [
            t.regenLogHeader,
            ...errorLines,
            failed > errorLines.length
              ? `... ${failed - errorLines.length} ${t.regenMoreErrors}`
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
  const closeEditor = () => {
    setEditIndex(-1);
    setCreateCardModuleId('');
    setEditError('');
  };
  const isCreateCardMode = editIndex === -2;
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
          <label key={`effect-${key}`}>{key === 'rank' ? t.rankResource : t.resources[key as keyof typeof t.resources]}
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
        <button type="button" onClick={addFromForm} disabled={!isCreateCardMode}>{t.addCustomCard}</button>
        <button type="button" onClick={closeEditor}>{t.close}</button>
      </p>
    </div>
  );

  return (
    <section className={`board admin-panel${uiVariant === 'v2' ? ' board-v2-panel' : ''}`}>
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
          sharedDeckTemplate={sharedDeckTemplate}
          editTarget={editTarget}
          editIndex={editIndex}
          inlineEditor={inlineEditor}
          onModuleAction={(moduleId, action) => applyModuleAction(moduleId, action)}
          deckManagerStatus={deckManagerStatus}
          onStartCreateCardForModule={startCreateCardForModule}
          onEditCardAt={openCardEditorAt}
          onEditCardById={openCardEditorById}
          onRemoveCardAt={removeCardAtFromEditor}
          cardCatalog={cardCatalog}
          modules={deckModules}
          onSaveModule={saveDeckModule}
          onDeleteModule={deleteDeckModule}
          sharedRanks={sharedRanks}
          onSetLegendaryDeckMode={setLegendaryDeckMode}
        />
      ) : null}

      {activeTab === 'import' ? (
        <AdminImportTab
          t={t}
          importTarget={importTarget}
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
          attachRankVariantImageFile={attachRankVariantImageFile}
          rankResourceKeys={rankResourceKeys}
          removeRankAt={removeRankAt}
          rankDraft={rankDraft}
          setRankDraft={setRankDraft}
          attachRankDraftImageFile={attachRankDraftImageFile}
          attachRankDraftVariantImageFile={attachRankDraftVariantImageFile}
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
          simulationOptionalModules={optionalSimulationModules}
          simulationOptionalModuleIds={simulationOptionalModuleIds}
          setSimulationOptionalModuleIds={setSimulationOptionalModuleIds}
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
