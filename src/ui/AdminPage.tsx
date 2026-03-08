import { useEffect, useMemo, useState } from 'react';
import type { DeckModuleCategory, DeckModuleDefinition, DeckTarget, SharedGameSetup } from '../game/jojGame';
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
  type DeckModuleId = string;
  type DeckModuleAction = 'add' | 'replace' | 'remove';
  type DeckModuleDef = DeckModuleDefinition;
  const STARTER_RELEASE_YEAR = '2026';
  const baseStarterNameById: Record<string, string> = {
    lyap_core: `${STARTER_RELEASE_YEAR}.LYAP.STARTER`,
    scandal_core: `${STARTER_RELEASE_YEAR}.SCANDAL.STARTER`,
    support_core: `${STARTER_RELEASE_YEAR}.SUPPORT.STARTER`,
    command_core: `${STARTER_RELEASE_YEAR}.COMMAND.STARTER`,
  };

  const [editTarget, setEditTarget] = useState<DeckTarget>('deck');
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [editCard, setEditCard] = useState<CardDefinition>(blankCard());
  const [editOriginalCardId, setEditOriginalCardId] = useState<string>('');
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
  const [deckManagerStatus, setDeckManagerStatus] = useState<string>('');
  const [deckModules, setDeckModules] = useState<DeckModuleDef[]>([]);
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

  useEffect(() => {
    if (Array.isArray(sharedDeckTemplate.modules) && sharedDeckTemplate.modules.length > 0) {
      const normalizedModules = sharedDeckTemplate.modules.map((module) => {
        const forced = baseStarterNameById[module.id];
        return { ...module, name: forced ?? module.name, cardIds: [...module.cardIds] };
      });
      setDeckModules(normalizedModules);
      const changed = normalizedModules.some((module, index) => module.name !== sharedDeckTemplate.modules[index]?.name);
      if (changed) {
        void applyTemplateUpdate((nextTemplate) => {
          nextTemplate.modules = normalizedModules.map((module) => ({ ...module, cardIds: [...module.cardIds] }));
        });
      }
      return;
    }
    if (cardCatalog.length === 0) return;
    const byCategory = (category: CardCategory) => cardCatalog.filter((card) => card.category === category).map((card) => card.id);
    const byLegendary = () => cardCatalog
      .filter((card) => /^legendary-/i.test(card.id) || card.category === 'LEGENDARY')
      .map((card) => card.id);
    const byRankTrack = () => cardCatalog.filter((card) => /^rank[-_]/i.test(card.id)).map((card) => card.id);
    const lyap = byCategory('LYAP');
    const scandal = byCategory('SCANDAL');
    const support = byCategory('SUPPORT');
    const command = byCategory('COMMAND');
    const vvnz = byCategory('VVNZ');
    const legendary = byLegendary();
    const rank = byRankTrack();
    const seededModules: DeckModuleDef[] = [
      { id: 'lyap_core', name: baseStarterNameById.lyap_core, moduleType: 'MAIN_DECK_MODULE', category: 'LYAP', cardCount: 20, enabled: true, target: 'deck', defaultCategory: 'LYAP', cardIds: lyap },
      { id: 'scandal_core', name: baseStarterNameById.scandal_core, moduleType: 'MAIN_DECK_MODULE', category: 'SCANDAL', cardCount: 20, enabled: true, target: 'deck', defaultCategory: 'SCANDAL', cardIds: scandal },
      { id: 'support_core', name: baseStarterNameById.support_core, moduleType: 'MAIN_DECK_MODULE', category: 'SUPPORT', cardCount: 30, enabled: true, target: 'deck', defaultCategory: 'SUPPORT', cardIds: support },
      { id: 'command_core', name: baseStarterNameById.command_core, moduleType: 'MAIN_DECK_MODULE', category: 'COMMAND', cardCount: 30, enabled: true, target: 'deck', defaultCategory: 'COMMAND', cardIds: command },
      { id: 'vvnz_default', name: 'VVNZ_DEFAULT', moduleType: 'SYSTEM_MODULE', category: 'VVNZ', cardCount: vvnz.length, enabled: true, target: 'deck', defaultCategory: 'VVNZ', cardIds: vvnz },
      { id: 'legendary_default', name: 'LEGENDARY_DEFAULT', moduleType: 'SEPARATE_DECK_MODULE', category: 'LEGENDARY', cardCount: legendary.length, enabled: true, target: 'legendaryDeck', defaultCategory: 'LEGENDARY', cardIds: legendary },
      { id: 'rank_default', name: 'RANK_DEFAULT', moduleType: 'VISUAL_TRACK_MODULE', category: 'RANK', cardCount: rank.length, enabled: true, target: 'rankTrack', defaultCategory: undefined, cardIds: rank },
    ];
    setDeckModules(seededModules);
    const seededSetup: SharedGameSetup = {
      lyapModuleId: 'lyap_core',
      scandalModuleId: 'scandal_core',
      supportModuleId: 'support_core',
      commandModuleId: 'command_core',
      optionalMainDeckModuleIds: ['vvnz_default'],
      legendaryModuleId: 'legendary_default',
      rankModuleId: 'rank_default',
      legendaryDeckMode: 'separate',
    };
    void applyTemplateUpdate((nextTemplate) => {
      nextTemplate.modules = seededModules.map((module) => ({ ...module, cardIds: [...module.cardIds] }));
      nextTemplate.gameSetup = seededSetup;
    });
  }, [cardCatalog, sharedDeckTemplate.modules]);

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
        nextTemplate.deck = rewrite(nextTemplate.deck);
        nextTemplate.legendaryDeck = rewrite(nextTemplate.legendaryDeck);
        nextTemplate.rankTrack = rewrite(nextTemplate.rankTrack);
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

  const applyTemplateUpdate = (mutate: (next: SharedDeckTemplate) => void): boolean => {
    const nextTemplate: SharedDeckTemplate = {
      deck: sharedDeckTemplate.deck.map((card) => ({ ...card })),
      legendaryDeck: sharedDeckTemplate.legendaryDeck.map((card) => ({ ...card })),
      rankTrack: sharedDeckTemplate.rankTrack.map((card) => ({ ...card })),
      deckBackImage: sharedDeckTemplate.deckBackImage,
      modules: (sharedDeckTemplate.modules ?? []).map((module) => ({ ...module, cardIds: [...module.cardIds] })),
      gameSetup: {
        ...sharedDeckTemplate.gameSetup,
        optionalMainDeckModuleIds: [...(sharedDeckTemplate.gameSetup?.optionalMainDeckModuleIds ?? [])],
      },
    };
    mutate(nextTemplate);
    const error = onImportTemplate(JSON.stringify(nextTemplate, null, 2));
    if (error) {
      setDeckManagerStatus(`${t.moduleManagerErrorPrefix}: ${error}`);
      return false;
    }
    return true;
  };

  useEffect(() => {
    const modules = sharedDeckTemplate.modules ?? [];
    if (modules.length === 0) return;
    const setup = sharedDeckTemplate.gameSetup ?? { optionalMainDeckModuleIds: [] };
    const byId = new Map(modules.map((module) => [module.id, module] as const));
    const moduleIdsByTarget = {
      deck: new Set(modules.filter((m) => m.target === 'deck').flatMap((m) => m.cardIds)),
      legendaryDeck: new Set(modules.filter((m) => m.target === 'legendaryDeck').flatMap((m) => m.cardIds)),
      rankTrack: new Set(modules.filter((m) => m.target === 'rankTrack').flatMap((m) => m.cardIds)),
    };
    const missingDeckIds = Array.from(
      new Set(
        sharedDeckTemplate.deck
          .map((card) => card.id)
          .filter((id) => !moduleIdsByTarget.deck.has(id)),
      ),
    );
    const missingLegendaryIds = Array.from(
      new Set(
        sharedDeckTemplate.legendaryDeck
          .map((card) => card.id)
          .filter((id) => !moduleIdsByTarget.legendaryDeck.has(id)),
      ),
    );
    const missingRankIds = Array.from(
      new Set(
        sharedDeckTemplate.rankTrack
          .map((card) => card.id)
          .filter((id) => !moduleIdsByTarget.rankTrack.has(id)),
      ),
    );
    if (missingDeckIds.length === 0 && missingLegendaryIds.length === 0 && missingRankIds.length === 0) return;

    const targetByDeckCategory = (category: CardCategory): string | undefined => {
      if (category === 'LYAP') return setup.lyapModuleId;
      if (category === 'SCANDAL') return setup.scandalModuleId;
      if (category === 'SUPPORT') return setup.supportModuleId;
      if (category === 'COMMAND') return setup.commandModuleId;
      if (category === 'VVNZ') {
        const fromSetup = (setup.optionalMainDeckModuleIds ?? []).find((id) => byId.get(id)?.category === 'VVNZ');
        if (fromSetup) return fromSetup;
        return modules.find((m) => m.moduleType === 'SYSTEM_MODULE' && m.category === 'VVNZ' && m.target === 'deck')?.id;
      }
      return undefined;
    };

    const addByModuleId = new Map<string, Set<string>>();
    const queue = (moduleId: string | undefined, cardId: string) => {
      if (!moduleId) return;
      const module = byId.get(moduleId);
      if (!module) return;
      if (!addByModuleId.has(moduleId)) addByModuleId.set(moduleId, new Set<string>());
      addByModuleId.get(moduleId)?.add(cardId);
    };

    missingDeckIds.forEach((cardId) => {
      const card = sharedDeckTemplate.deck.find((row) => row.id === cardId);
      if (!card) return;
      queue(targetByDeckCategory(card.category), cardId);
    });
    missingLegendaryIds.forEach((cardId) => queue(setup.legendaryModuleId, cardId));
    missingRankIds.forEach((cardId) => queue(setup.rankModuleId, cardId));

    if (addByModuleId.size === 0) return;
    void applyTemplateUpdate((nextTemplate) => {
      nextTemplate.modules = (nextTemplate.modules ?? []).map((module) => {
        const toAdd = addByModuleId.get(module.id);
        if (!toAdd || toAdd.size === 0) return module;
        const merged = [...module.cardIds, ...Array.from(toAdd).filter((id) => !module.cardIds.includes(id))];
        return { ...module, cardIds: merged, cardCount: Math.max(module.cardCount, merged.length) };
      });
    });
  }, [sharedDeckTemplate]);

  const applyModuleAction = (moduleId: DeckModuleId, action: DeckModuleAction) => {
    const module = deckModules.find((row) => row.id === moduleId);
    if (!module) {
      setDeckManagerStatus(t.moduleNotFound);
      return;
    }
    const byId = new Map(cardCatalog.map((card) => [card.id, card] as const));
    const source = module.cardIds.map((id) => byId.get(id)).filter(Boolean).map((card) => ({ ...(card as CardDefinition) }));
    const targetKey = module.target;

    const ok = applyTemplateUpdate((nextTemplate) => {
      const existingCards = nextTemplate[targetKey];
      const existingIds = new Set(existingCards.map((card) => card.id));
      if (action === 'remove') {
        nextTemplate[targetKey] = existingCards.filter((card) => !module.cardIds.includes(card.id));
      } else if (action === 'replace') {
        const sameCategoryModuleIds = new Set(
          deckModules
            .filter((row) => row.id !== module.id && row.target === module.target && row.category === module.category)
            .flatMap((row) => row.cardIds),
        );
        const rest = existingCards.filter((card) => !module.cardIds.includes(card.id) && !sameCategoryModuleIds.has(card.id));
        nextTemplate[targetKey] = [...rest, ...source];
      } else {
        nextTemplate[targetKey] = [...existingCards, ...source.filter((card) => !existingIds.has(card.id))];
      }
      if (module.deckBackImage && action !== 'remove') {
        nextTemplate.deckBackImage = normalizeImagePath(module.deckBackImage);
      }
      const setup = nextTemplate.gameSetup;
      const ensureOptional = new Set(setup.optionalMainDeckModuleIds ?? []);
      if (module.moduleType === 'MAIN_DECK_MODULE') {
        if (module.category === 'LYAP' && action !== 'remove') setup.lyapModuleId = module.id;
        if (module.category === 'SCANDAL' && action !== 'remove') setup.scandalModuleId = module.id;
        if (module.category === 'SUPPORT' && action !== 'remove') setup.supportModuleId = module.id;
        if (module.category === 'COMMAND' && action !== 'remove') setup.commandModuleId = module.id;
        if (action === 'remove') {
          if (setup.lyapModuleId === module.id) setup.lyapModuleId = undefined;
          if (setup.scandalModuleId === module.id) setup.scandalModuleId = undefined;
          if (setup.supportModuleId === module.id) setup.supportModuleId = undefined;
          if (setup.commandModuleId === module.id) setup.commandModuleId = undefined;
        }
      }
      if (module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck') {
        if (action === 'remove') ensureOptional.delete(module.id);
        else ensureOptional.add(module.id);
        setup.optionalMainDeckModuleIds = [...ensureOptional];
      }
      if (module.moduleType === 'SEPARATE_DECK_MODULE' && module.category === 'LEGENDARY') {
        if (action === 'remove' && setup.legendaryModuleId === module.id) setup.legendaryModuleId = undefined;
        if (action !== 'remove') setup.legendaryModuleId = module.id;
      }
      if (module.moduleType === 'VISUAL_TRACK_MODULE' && module.category === 'RANK') {
        if (action === 'remove' && setup.rankModuleId === module.id) setup.rankModuleId = undefined;
        if (action !== 'remove') setup.rankModuleId = module.id;
      }
    });

    if (!ok) return;
    const label = module.name;
    const verb = action === 'add'
      ? t.moduleActionAdded
      : action === 'replace'
        ? t.moduleActionReplaced
        : t.moduleActionRemoved;
    setDeckManagerStatus(`${t.moduleActionStatusPrefix} ${label}: ${verb}.`);
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

  const saveDeckModule = (nextModule: {
    id: string;
    name: string;
    moduleType: DeckModuleDefinition['moduleType'];
    category: DeckModuleCategory;
    cardCount: number;
    enabled: boolean;
    target: DeckTarget;
    cardIds: string[];
    defaultCategory?: CardCategory;
    deckBackImage?: string;
  }) => {
    const normalizedId = nextModule.id.trim().toLowerCase();
    if (!normalizedId) return;
    const normalized: DeckModuleDef = {
      ...nextModule,
      id: normalizedId,
      name: nextModule.name.trim() || normalizedId,
      cardIds: Array.from(new Set(nextModule.cardIds.map((id) => id.trim()).filter(Boolean))),
      cardCount: Math.max(0, Number(nextModule.cardCount || nextModule.cardIds.length || 0)),
      deckBackImage: normalizeImagePath(nextModule.deckBackImage?.trim()),
    };
    const ok = applyTemplateUpdate((nextTemplate) => {
      const prev = nextTemplate.modules ?? [];
      const idx = prev.findIndex((row) => row.id === normalized.id);
      const nextModules = idx === -1
        ? [...prev, normalized]
        : prev.map((row, i) => (i === idx ? normalized : row));
      nextTemplate.modules = nextModules;
      const nextSetup = { ...nextTemplate.gameSetup, optionalMainDeckModuleIds: [...(nextTemplate.gameSetup?.optionalMainDeckModuleIds ?? [])] };
      if (normalized.moduleType === 'MAIN_DECK_MODULE') {
        if (normalized.category === 'LYAP' && !nextSetup.lyapModuleId) nextSetup.lyapModuleId = normalized.id;
        if (normalized.category === 'SCANDAL' && !nextSetup.scandalModuleId) nextSetup.scandalModuleId = normalized.id;
        if (normalized.category === 'SUPPORT' && !nextSetup.supportModuleId) nextSetup.supportModuleId = normalized.id;
        if (normalized.category === 'COMMAND' && !nextSetup.commandModuleId) nextSetup.commandModuleId = normalized.id;
      }
      if (normalized.moduleType === 'SYSTEM_MODULE' && normalized.target === 'deck' && normalized.enabled) {
        if (!nextSetup.optionalMainDeckModuleIds.includes(normalized.id)) nextSetup.optionalMainDeckModuleIds.push(normalized.id);
      }
      if (normalized.moduleType === 'SEPARATE_DECK_MODULE' && normalized.category === 'LEGENDARY' && !nextSetup.legendaryModuleId) {
        nextSetup.legendaryModuleId = normalized.id;
      }
      if (normalized.moduleType === 'VISUAL_TRACK_MODULE' && normalized.category === 'RANK' && !nextSetup.rankModuleId) {
        nextSetup.rankModuleId = normalized.id;
      }
      if (!nextSetup.legendaryDeckMode) nextSetup.legendaryDeckMode = 'separate';
      nextTemplate.gameSetup = nextSetup;
    });
    if (!ok) return;
    setDeckManagerStatus(`${t.moduleActionStatusPrefix} ${normalized.name}: ${t.moduleSavedStatus}`);
  };

  const deleteDeckModule = (moduleId: string) => {
    const ok = applyTemplateUpdate((nextTemplate) => {
      nextTemplate.modules = (nextTemplate.modules ?? []).filter((row) => row.id !== moduleId);
      const setup = nextTemplate.gameSetup;
      if (setup.lyapModuleId === moduleId) setup.lyapModuleId = undefined;
      if (setup.scandalModuleId === moduleId) setup.scandalModuleId = undefined;
      if (setup.supportModuleId === moduleId) setup.supportModuleId = undefined;
      if (setup.commandModuleId === moduleId) setup.commandModuleId = undefined;
      if (setup.legendaryModuleId === moduleId) setup.legendaryModuleId = undefined;
      if (setup.rankModuleId === moduleId) setup.rankModuleId = undefined;
      setup.optionalMainDeckModuleIds = (setup.optionalMainDeckModuleIds ?? []).filter((id) => id !== moduleId);
    });
    if (!ok) return;
    setDeckManagerStatus(t.moduleDeletedStatus);
  };

  const setLegendaryDeckMode = (mode: 'separate' | 'merged') => {
    const ok = applyTemplateUpdate((nextTemplate) => {
      nextTemplate.gameSetup.legendaryDeckMode = mode;
    });
    if (!ok) return;
    const modeLabel = mode === 'merged' ? t.legendaryModeMerged : t.legendaryModeSeparate;
    setDeckManagerStatus(`${t.legendaryModeLabel}: ${modeLabel}.`);
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
      modules: (sharedDeckTemplate.modules ?? []).map((module) => ({ ...module, cardIds: [...module.cardIds] })),
      gameSetup: {
        ...sharedDeckTemplate.gameSetup,
        optionalMainDeckModuleIds: [...(sharedDeckTemplate.gameSetup?.optionalMainDeckModuleIds ?? [])],
      },
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
      `${t.importSuccessAddedPrefix} ${normalizedCards.length} ${t.importSuccessCardsWord} ${t.importSuccessInto} "${targetLabel}" (${t.importSuccessCategory}: ${suffix}).`,
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
