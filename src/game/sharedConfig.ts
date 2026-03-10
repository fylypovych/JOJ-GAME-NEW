import { baseDeck, legendaryCards } from './cards';
import { GENERAL_RANK_ID, ranks as baseRanks } from './ranks';
import { cloneCard, cloneRank } from './cloneUtils';
import { normalizeImagePath } from './imagePaths';
import { resourceKeys } from './resourceMeta';
import { importTemplateCardsByCatalogIds, importTemplateCardsByFullRows, isLegendaryDeckOnlyCardId } from './sharedConfigImport';
import {
  buildTemplateWithDefaults,
  defaultSharedDeckTemplateBase,
  normalizeGameSetup,
  normalizeModules,
  parseGameSetup,
  parseModules,
} from './sharedConfigHelpers';
import type { CardCategory, CardDefinition, RankDefinition, ResourceKey } from './types';

export type DeckModuleType = 'MAIN_DECK_MODULE' | 'SEPARATE_DECK_MODULE' | 'SYSTEM_MODULE' | 'VISUAL_TRACK_MODULE';
export type DeckModuleCategory = 'LYAP' | 'SCANDAL' | 'SUPPORT' | 'COMMAND' | 'LEGENDARY' | 'VVNZ' | 'RANK';
export type LegendaryDeckMode = 'separate' | 'merged';

export type DeckModuleDefinition = {
  id: string;
  name: string;
  moduleType: DeckModuleType;
  category: DeckModuleCategory;
  cardCount: number;
  enabled: boolean;
  target: DeckTarget;
  cardIds: string[];
  defaultCategory?: CardCategory;
  deckBackImage?: string;
};

export type SharedGameSetup = {
  lyapModuleId?: string;
  scandalModuleId?: string;
  supportModuleId?: string;
  commandModuleId?: string;
  optionalMainDeckModuleIds: string[];
  legendaryModuleId?: string;
  rankModuleId?: string;
  legendaryDeckMode: LegendaryDeckMode;
};

export type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
  deckBackImage?: string;
  modules: DeckModuleDefinition[];
  gameSetup: SharedGameSetup;
};

export type DeckTarget = 'deck' | 'legendaryDeck' | 'rankTrack';
export type SharedRanks = RankDefinition[];
export type OptionalGameModuleId = 'vvnz' | 'legendary';

export type DeckModuleBuildResult = {
  baseDeck: CardDefinition[];
  mainDeck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
  optionalMainDeckModules: Record<string, CardDefinition[]>;
  optionalLegendaryDeckModules: Record<string, CardDefinition[]>;
  modules: DeckModuleDefinition[];
  gameSetup: SharedGameSetup;
};

const defaultSharedDeckTemplate = (): SharedDeckTemplate => buildTemplateWithDefaults(defaultSharedDeckTemplateBase(baseDeck, legendaryCards));

let sharedDeckTemplate: SharedDeckTemplate = defaultSharedDeckTemplate();
let sharedRanks: SharedRanks = baseRanks.map(cloneRank);
let sharedExtraCatalog: CardDefinition[] = [];

export const getActiveRanks = (): SharedRanks => sharedRanks;
export const getTopRankId = (): string => {
  const active = getActiveRanks();
  return active[active.length - 1]?.id ?? GENERAL_RANK_ID;
};

const isValidRank = (rank: unknown): rank is RankDefinition => {
  if (!rank || typeof rank !== 'object') return false;
  const raw = rank as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return false;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return false;
  if (!raw.requirement || typeof raw.requirement !== 'object') return false;
  if (raw.effect !== undefined && (!raw.effect || typeof raw.effect !== 'object')) return false;
  if (raw.cost !== undefined && (!raw.cost || typeof raw.cost !== 'object')) return false;
  if (raw.bonus !== undefined && (!raw.bonus || typeof raw.bonus !== 'object')) return false;
  if (raw.image !== undefined && typeof raw.image !== 'string') return false;
  if (raw.imageVariants !== undefined) {
    if (!Array.isArray(raw.imageVariants)) return false;
    if (raw.imageVariants.some((value) => typeof value !== 'string')) return false;
  }
  if (raw.victory !== undefined && typeof raw.victory !== 'boolean') return false;
  if (raw.flavor !== undefined && typeof raw.flavor !== 'string') return false;
  const req = raw.requirement as Record<string, unknown>;
  const costSource = (raw.cost as Record<string, unknown> | undefined) ?? {};
  const effectSource = (raw.effect as Record<string, unknown> | undefined) ?? {};
  const bonusSource = ((raw.bonus as Record<string, unknown> | undefined) ?? effectSource) as Record<string, unknown>;
  for (const key of Object.keys(req)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof req[key] !== 'number') return false;
  }
  for (const key of Object.keys(costSource)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof costSource[key] !== 'number') return false;
  }
  for (const key of Object.keys(bonusSource)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof bonusSource[key] !== 'number') return false;
  }
  return true;
};

export const getSharedRanks = (): SharedRanks => sharedRanks.map(cloneRank);

export const setSharedRanks = (next: SharedRanks): boolean => {
  if (!Array.isArray(next) || next.length === 0) return false;
  if (!next.every((rank) => isValidRank(rank))) return false;
  const ids = next.map((rank) => rank.id.trim());
  if (new Set(ids).size !== ids.length) return false;
  sharedRanks = next.map((rank) => {
    const rawRank = rank as RankDefinition & { effect?: Partial<Record<ResourceKey, number>> };
    const costSource = rawRank.cost ? { ...rawRank.cost } : {};
    const bonusSource = rawRank.bonus ? { ...rawRank.bonus } : { ...(rawRank.effect ?? {}) };
    const cost: Partial<Record<ResourceKey, number>> = {};
    resourceKeys.forEach((key) => {
      const rawValue = costSource[key] ?? 0;
      if (rawValue !== 0) cost[key] = Math.abs(rawValue);
    });
    const bonus: Partial<Record<ResourceKey, number>> = {};
    resourceKeys.forEach((key) => {
      const rawValue = bonusSource[key] ?? 0;
      if (rawValue !== 0) bonus[key] = rawValue;
    });
    return cloneRank({
      ...rank,
      id: rank.id.trim(),
      name: rank.name.trim(),
      cost,
      bonus,
      image: normalizeImagePath(typeof rawRank.image === 'string' ? rawRank.image : undefined),
      imageVariants: Array.isArray(rawRank.imageVariants)
        ? rawRank.imageVariants
          .map((path) => normalizeImagePath(typeof path === 'string' ? path : undefined))
          .filter((path): path is string => Boolean(path))
        : undefined,
      victory: rawRank.victory === true ? true : undefined,
      flavor: typeof rawRank.flavor === 'string' ? rawRank.flavor : undefined,
    });
  });
  return true;
};

export const resolveRandomRankImage = (rankId: string): string | undefined => {
  const rank = sharedRanks.find((row) => row.id === rankId);
  if (!rank) return undefined;
  const variants = (rank.imageVariants ?? [])
    .map((path) => normalizeImagePath(path))
    .filter((path): path is string => Boolean(path));
  if (variants.length > 0) {
    const index = Math.floor(Math.random() * variants.length);
    return variants[index];
  }
  return normalizeImagePath(rank.image);
};

export const resetSharedRanks = () => {
  sharedRanks = baseRanks.map(cloneRank);
};

const buildCardCatalog = (template: SharedDeckTemplate): CardDefinition[] => {
  const byId = new Map<string, CardDefinition>();
  sharedExtraCatalog.forEach((card) => {
    if (!byId.has(card.id)) byId.set(card.id, cloneCard(card));
  });
  template.deck.forEach((card) => {
    byId.set(card.id, cloneCard(card));
  });
  template.legendaryDeck.forEach((card) => {
    byId.set(card.id, cloneCard({ ...card, category: 'LEGENDARY' }));
  });
  template.rankTrack.forEach((card) => {
    byId.set(card.id, cloneCard(card));
  });
  return [...byId.values()];
};

export const getSharedDeckTemplateStats = () => ({
  deck: sharedDeckTemplate.deck.length,
  legendary: sharedDeckTemplate.legendaryDeck.length,
  rankTrack: sharedDeckTemplate.rankTrack.length,
});

export const getSharedDeckTemplate = (): SharedDeckTemplate => ({
  deck: sharedDeckTemplate.deck.map(cloneCard),
  legendaryDeck: sharedDeckTemplate.legendaryDeck.map(cloneCard),
  rankTrack: sharedDeckTemplate.rankTrack.map(cloneCard),
  deckBackImage: sharedDeckTemplate.deckBackImage,
  modules: sharedDeckTemplate.modules.map((module) => ({ ...module, cardIds: [...module.cardIds] })),
  gameSetup: {
    ...sharedDeckTemplate.gameSetup,
    optionalMainDeckModuleIds: [...sharedDeckTemplate.gameSetup.optionalMainDeckModuleIds],
  },
});

const cardsByIdFromTemplate = (template: SharedDeckTemplate): Map<string, CardDefinition> => {
  const byId = new Map<string, CardDefinition>();
  [sharedExtraCatalog, template.deck, template.legendaryDeck, template.rankTrack].forEach((cards) => {
    cards.forEach((card) => {
      if (!byId.has(card.id)) byId.set(card.id, cloneCard(card));
    });
  });
  return byId;
};

const cardsFromModule = (
  module: DeckModuleDefinition | undefined,
  cardsById: Map<string, CardDefinition>,
): CardDefinition[] => {
  if (!module) return [];
  return module.cardIds
    .map((id) => cardsById.get(id))
    .filter((card): card is CardDefinition => Boolean(card))
    .map(cloneCard);
};

export const buildDeckModulesFromTemplate = (
  template: SharedDeckTemplate,
  setupOverride?: Partial<SharedGameSetup>,
): DeckModuleBuildResult => {
  const safeTemplate = {
    deck: Array.isArray(template?.deck) ? template.deck : [],
    legendaryDeck: Array.isArray(template?.legendaryDeck) ? template.legendaryDeck : [],
    rankTrack: Array.isArray(template?.rankTrack) ? template.rankTrack : [],
    modules: Array.isArray(template?.modules) ? template.modules : [],
    gameSetup: template?.gameSetup ?? { optionalMainDeckModuleIds: [], legendaryDeckMode: 'separate' as const },
    deckBackImage: template?.deckBackImage,
  };
  const modules = normalizeModules(safeTemplate.modules, safeTemplate);
  const mergedSetup = normalizeGameSetup({ ...safeTemplate.gameSetup, ...setupOverride }, modules);
  const moduleById = new Map(modules.map((module) => [module.id, module] as const));
  const cardsById = cardsByIdFromTemplate(safeTemplate);

  const selectedMainModuleIds = [
    mergedSetup.lyapModuleId,
    mergedSetup.scandalModuleId,
    mergedSetup.supportModuleId,
    mergedSetup.commandModuleId,
  ].filter((id): id is string => Boolean(id));

  const baseDeck = selectedMainModuleIds
    .flatMap((id) => cardsFromModule(moduleById.get(id), cardsById))
    .map(cloneCard);

  const optionalMainDeckModules: Record<string, CardDefinition[]> = {};
  mergedSetup.optionalMainDeckModuleIds.forEach((id) => {
    const module = moduleById.get(id);
    if (!module || module.moduleType !== 'SYSTEM_MODULE' || module.target !== 'deck' || !module.enabled) return;
    optionalMainDeckModules[id] = cardsFromModule(module, cardsById);
    if (module.category === 'VVNZ' && !optionalMainDeckModules.vvnz) {
      optionalMainDeckModules.vvnz = optionalMainDeckModules[id].map(cloneCard);
    }
  });

  const optionalLegendaryDeckModules: Record<string, CardDefinition[]> = {};
  if (mergedSetup.legendaryModuleId) {
    const legendaryModule = moduleById.get(mergedSetup.legendaryModuleId);
    if (legendaryModule && legendaryModule.moduleType === 'SEPARATE_DECK_MODULE' && legendaryModule.category === 'LEGENDARY' && legendaryModule.target === 'legendaryDeck' && legendaryModule.enabled) {
      optionalLegendaryDeckModules[legendaryModule.id] = cardsFromModule(legendaryModule, cardsById);
      optionalLegendaryDeckModules.legendary = optionalLegendaryDeckModules[legendaryModule.id].map(cloneCard);
    }
  }

  const mainDeck = [
    ...baseDeck.map(cloneCard),
    ...Object.entries(optionalMainDeckModules)
      .filter(([key]) => key !== 'vvnz')
      .flatMap(([, cards]) => cards.map(cloneCard)),
  ];

  const rankTrack = mergedSetup.rankModuleId
    ? cardsFromModule(moduleById.get(mergedSetup.rankModuleId), cardsById)
    : [];

  return {
    baseDeck,
    mainDeck,
    legendaryDeck: mergedSetup.legendaryModuleId
      ? (optionalLegendaryDeckModules[mergedSetup.legendaryModuleId] ?? optionalLegendaryDeckModules.legendary ?? []).map(cloneCard)
      : [],
    rankTrack,
    optionalMainDeckModules,
    optionalLegendaryDeckModules,
    modules,
    gameSetup: mergedSetup,
  };
};

export const getCardCatalog = (): CardDefinition[] => buildCardCatalog(sharedDeckTemplate);

export const exportSharedDeckTemplateJson = (): string => {
  const template = getSharedDeckTemplate();
  const catalog = buildCardCatalog(template);
  return JSON.stringify({
    version: 3,
    catalog,
    deckIds: template.deck.map((card) => card.id),
    legendaryDeckIds: template.legendaryDeck.map((card) => card.id),
    rankTrackIds: template.rankTrack.map((card) => card.id),
    deck: template.deck,
    legendaryDeck: template.legendaryDeck,
    rankTrack: template.rankTrack,
    deckBackImage: template.deckBackImage,
    modules: template.modules,
    gameSetup: template.gameSetup,
  }, null, 2);
};

export const importSharedDeckTemplateJson = (text: string): { ok: true } | { ok: false; error: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Template must be an object' };

  const raw = parsed as Record<string, unknown>;
  let typedDeck: CardDefinition[] = [];
  let typedLegendaryDeck: CardDefinition[] = [];
  let typedRankTrack: CardDefinition[] = [];
  let typedExtraCatalog: CardDefinition[] = [];

  if (Array.isArray(raw.catalog) && Array.isArray(raw.deckIds) && Array.isArray(raw.legendaryDeckIds)) {
    const result = importTemplateCardsByCatalogIds(raw);
    if (!result.ok) return result;
    typedDeck = result.deck;
    typedLegendaryDeck = result.legendaryDeck;
    typedRankTrack = result.rankTrack;
    typedExtraCatalog = result.extraCatalog;
  } else {
    const result = importTemplateCardsByFullRows(raw);
    if (!result.ok) return result;
    typedDeck = result.deck;
    typedLegendaryDeck = result.legendaryDeck;
    typedRankTrack = result.rankTrack;
    typedExtraCatalog = result.extraCatalog;
  }

  typedDeck = typedDeck.filter((card) => !isLegendaryDeckOnlyCardId(card.id));
  const deckBackImage = normalizeImagePath(typeof raw.deckBackImage === 'string' ? raw.deckBackImage : undefined);
  const importedModules = parseModules(raw.modules);
  const importedSetup = parseGameSetup(raw.gameSetup);

  sharedDeckTemplate = buildTemplateWithDefaults({
    deck: typedDeck,
    legendaryDeck: typedLegendaryDeck,
    rankTrack: typedRankTrack,
    deckBackImage,
    modules: importedModules ?? undefined,
    gameSetup: importedSetup ?? undefined,
  });
  sharedExtraCatalog = typedExtraCatalog.map(cloneCard);
  return { ok: true };
};

export const validateSharedDeckTemplateJson = (text: string): { ok: true } | { ok: false; error: string } => {
  const prevTemplate = getSharedDeckTemplate();
  const prevExtraCatalog = sharedExtraCatalog.map(cloneCard);
  const result = importSharedDeckTemplateJson(text);
  sharedDeckTemplate = prevTemplate;
  sharedExtraCatalog = prevExtraCatalog;
  return result;
};

export const resetSharedDeckTemplate = () => {
  sharedDeckTemplate = defaultSharedDeckTemplate();
  sharedExtraCatalog = [];
};

export const shuffle = <T,>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

export const shuffleSharedDeckTemplate = () => {
  sharedDeckTemplate = { ...sharedDeckTemplate, deck: shuffle(sharedDeckTemplate.deck) };
};

export const setSharedDeckBackImage = (path?: string) => {
  sharedDeckTemplate = { ...sharedDeckTemplate, deckBackImage: normalizeImagePath(path) };
};

export const addCardToSharedDeckTemplate = (target: DeckTarget, cardId: string): boolean => {
  if (target === 'deck' && isLegendaryDeckOnlyCardId(cardId)) return false;
  const card = getCardCatalog().find((item) => item.id === cardId);
  if (!card) return false;
  sharedDeckTemplate = { ...sharedDeckTemplate, [target]: [...sharedDeckTemplate[target], cloneCard(card)] };
  return true;
};

export const addCustomCardToSharedDeckTemplate = (target: DeckTarget, card: CardDefinition): void => {
  if (target === 'deck' && isLegendaryDeckOnlyCardId(card.id)) return;
  sharedDeckTemplate = { ...sharedDeckTemplate, [target]: [...sharedDeckTemplate[target], cloneCard(card)] };
};

export const removeCardAtFromSharedDeckTemplate = (target: DeckTarget, index: number): boolean => {
  if (index < 0 || index >= sharedDeckTemplate[target].length) return false;
  sharedDeckTemplate = { ...sharedDeckTemplate, [target]: sharedDeckTemplate[target].filter((_, i) => i !== index) };
  return true;
};

export const updateCardAtInSharedDeckTemplate = (target: DeckTarget, index: number, card: CardDefinition): boolean => {
  if (index < 0 || index >= sharedDeckTemplate[target].length) return false;
  if (target === 'deck' && isLegendaryDeckOnlyCardId(card.id)) return false;
  sharedDeckTemplate = { ...sharedDeckTemplate, [target]: sharedDeckTemplate[target].map((item, i) => (i === index ? cloneCard(card) : item)) };
  return true;
};

export { categorizeModuleByCardCategory } from './sharedConfigHelpers';
