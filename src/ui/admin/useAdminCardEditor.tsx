import { useState } from 'react';
import type { DeckModuleDefinition, DeckTarget } from '../../game/jojGame';
import { normalizeImagePath } from '../../game/imagePaths';
import type { CardCategory, CardDefinition, EffectResource } from '../../game/types';
import type { Language } from '../i18n';
import { AdminInlineEditor } from './AdminInlineEditor';
import { blobToDataUrl, optimizeBlobForUpload, uploadAdminImageDataUrl } from './imageUpload';
import {
  blankCard,
  categories,
  effectResourceKeys,
  effectsToValues,
  getAspectLockedCropRect,
  valuesToEffects,
  zeroEffectValues,
} from './helpers';
import type { SharedDeckTemplate } from './types';
import { useAdminImageTools } from './useAdminImageTools';

type Params = {
  lang: Language;
  t: ReturnType<typeof import('../i18n').text>;
  serverUrl: string;
  adminHeaders: () => Record<string, string>;
  sharedDeckTemplate: SharedDeckTemplate;
  cardCatalog: CardDefinition[];
  deckModules: DeckModuleDefinition[];
  applyTemplateUpdate: (mutate: (next: SharedDeckTemplate & { catalog: CardDefinition[] }) => void) => boolean;
  setDeckManagerStatus: (value: string) => void;
  onAddCustomCard: (target: DeckTarget, card: CardDefinition) => void;
  onUpdateCard: (target: DeckTarget, index: number, card: CardDefinition) => void;
  onSetDeckBackImage: (path?: string) => void;
};

export const useAdminCardEditor = ({
  lang,
  t,
  serverUrl,
  adminHeaders,
  sharedDeckTemplate,
  cardCatalog,
  deckModules,
  applyTemplateUpdate,
  setDeckManagerStatus,
  onAddCustomCard,
  onUpdateCard,
  onSetDeckBackImage,
}: Params) => {
  const [editTarget, setEditTarget] = useState<DeckTarget>('deck');
  const [editIndex, setEditIndex] = useState(-1);
  const [editCard, setEditCard] = useState<CardDefinition>(blankCard());
  const [editOriginalCardId, setEditOriginalCardId] = useState('');
  const [editEffectValues, setEditEffectValues] = useState<Record<EffectResource, number>>(zeroEffectValues());
  const [editEffectsText, setEditEffectsText] = useState('[]');
  const [editError, setEditError] = useState('');
  const [imagePreviewNonce, setImagePreviewNonce] = useState(0);
  const [createCardModuleId, setCreateCardModuleId] = useState('');
  const [, setDeckBackImageInput] = useState(sharedDeckTemplate.deckBackImage ?? '');

  const isManagedCardAssetPath = (value?: string) => {
    const normalized = normalizeImagePath(value);
    return Boolean(normalized && (normalized.startsWith('/card-assets/') || normalized.startsWith('/cards/')));
  };

  const countImageReferences = (imagePath?: string, excludingCardId?: string) => {
    const normalizedTarget = normalizeImagePath(imagePath);
    if (!normalizedTarget) return 0;
    const seen = new Set<string>();
    let count = 0;
    const visit = (card?: CardDefinition | null) => {
      if (!card || seen.has(card.id) || card.id === excludingCardId) return;
      seen.add(card.id);
      if (normalizeImagePath(card.image) === normalizedTarget) count += 1;
    };
    for (const card of sharedDeckTemplate.deck) visit(card);
    for (const card of sharedDeckTemplate.legendaryDeck) visit(card);
    for (const card of sharedDeckTemplate.rankTrack) visit(card);
    for (const card of cardCatalog) visit(card);
    return count;
  };

  const deleteUploadedImage = async (imagePath?: string) => {
    const normalizedImagePath = normalizeImagePath(imagePath);
    if (!normalizedImagePath || !isManagedCardAssetPath(normalizedImagePath)) return false;
    try {
      const response = await fetch(`${serverUrl}/api/admin/delete-card-image`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...adminHeaders(),
        },
        body: JSON.stringify({ path: normalizedImagePath }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      // Treat 404 as success - file is already gone
      if (response.status === 404) return true;
      if (!response.ok || !payload.ok) {
        setDeckManagerStatus(payload.error || t.uploadFailedGeneric);
        return false;
      }
      return true;
    } catch {
      setDeckManagerStatus(t.uploadFailedGeneric);
      return false;
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

  const removeCardAtFromEditor = async (target: DeckTarget, index: number) => {
    const card = sharedDeckTemplate[target]?.[index];
    if (!card) return;
    const shouldDeleteImage = isManagedCardAssetPath(card.image) && countImageReferences(card.image, card.id) === 0;
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
    if (shouldDeleteImage) {
      await deleteUploadedImage(card.image);
    }
  };

  const removeCardByIdFromEditor = async (target: DeckTarget, cardId: string) => {
    const card = sharedDeckTemplate[target]?.find((row) => row.id === cardId)
      ?? cardCatalog.find((row) => row.id === cardId);
    if (!card) return;
    const shouldDeleteImage = isManagedCardAssetPath(card.image) && countImageReferences(card.image, card.id) === 0;
    const ok = applyTemplateUpdate((nextTemplate) => {
      nextTemplate[target] = nextTemplate[target].filter((row) => row.id !== cardId);
      nextTemplate.modules = (nextTemplate.modules ?? []).map((module) => (
        module.cardIds.includes(cardId)
          ? {
            ...module,
            cardIds: module.cardIds.filter((id) => id !== cardId),
            cardCount: Math.max(0, module.cardIds.filter((id) => id !== cardId).length),
          }
          : module
      ));
      nextTemplate.catalog = (nextTemplate.catalog ?? []).filter((row) => row.id !== cardId);
    });
    if (!ok) return;
    if (editOriginalCardId === cardId) {
      setEditIndex(-1);
      setCreateCardModuleId('');
      setEditOriginalCardId('');
    }
    if (shouldDeleteImage) {
      await deleteUploadedImage(card.image);
    }
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
    <AdminInlineEditor
      t={t}
      editTarget={editTarget}
      editCard={editCard}
      setEditCard={setEditCard}
      categories={categories}
      attachImageFile={attachImageFile}
      cropDraft={cropDraft}
      setCropDraft={setCropDraft}
      cropPreviewRef={cropPreviewRef}
      applyCropAndUpload={applyCropAndUpload}
      uploadOriginalFromCropDraft={uploadOriginalFromCropDraft}
      cancelCropDraft={cancelCropDraft}
      withCacheBust={withCacheBust}
      startCropFromCurrentImage={startCropFromCurrentImage}
      effectResourceKeys={effectResourceKeys}
      editEffectsText={editEffectsText}
      setEditEffectsText={setEditEffectsText}
      setEditEffectValues={setEditEffectValues}
      effectsToValues={effectsToValues}
      editEffectValues={editEffectValues}
      editError={editError}
      saveEdit={saveEdit}
      addFromForm={addFromForm}
      isCreateCardMode={isCreateCardMode}
      closeEditor={closeEditor}
    />
  );

  return {
    editTarget,
    editIndex,
    editCard,
    setEditCard,
    setImagePreviewNonce,
    setEditError,
    openCardEditorAt,
    openCardEditorById,
    startCreateCardForModule,
    removeCardAtFromEditor,
    removeCardByIdFromEditor,
    inlineEditor,
    withCacheBust,
  };
};
