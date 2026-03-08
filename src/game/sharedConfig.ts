import { baseDeck, legendaryCards } from './cards';
import { GENERAL_RANK_ID, ranks as baseRanks } from './ranks';
import { cloneCard, cloneRank } from './cloneUtils';
import { normalizeImagePath } from './imagePaths';
import { resourceKeys } from './resourceMeta';
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

const defaultSharedDeckTemplateBase = () => ({
  deck: baseDeck.map(cloneCard),
  legendaryDeck: legendaryCards.map(cloneCard),
  rankTrack: [] as CardDefinition[],
  deckBackImage: undefined as string | undefined,
});

const mapCardCategoryToModuleCategory = (category: CardCategory): DeckModuleCategory => {
  if (category === 'LYAP' || category === 'SCANDAL' || category === 'SUPPORT' || category === 'COMMAND' || category === 'LEGENDARY' || category === 'VVNZ') {
    return category;
  }
  return 'SUPPORT';
};

const moduleCategoryToCardCategory = (category: DeckModuleCategory): CardCategory => {
  switch (category) {
    case 'LYAP':
    case 'SCANDAL':
    case 'SUPPORT':
    case 'VVNZ':
    case 'LEGENDARY':
      return category;
    case 'COMMAND':
      return 'COMMAND';
    case 'RANK':
    default:
      return 'SUPPORT';
  }
};

const cardIdsFrom = (cards: CardDefinition[]) => cards.map((card) => card.id);

const uniqueStrings = (items: string[]): string[] => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
const STARTER_RELEASE_YEAR = '2026';
const baseStarterNameById: Record<string, string> = {
  lyap_core: `${STARTER_RELEASE_YEAR}.LYAP.STARTER`,
  scandal_core: `${STARTER_RELEASE_YEAR}.SCANDAL.STARTER`,
  support_core: `${STARTER_RELEASE_YEAR}.SUPPORT.STARTER`,
  command_core: `${STARTER_RELEASE_YEAR}.COMMAND.STARTER`,
};

const defaultModulesFromDecks = (template: {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
}): DeckModuleDefinition[] => {
  const byCategory = (category: CardCategory) => cardIdsFrom(template.deck.filter((card) => card.category === category));
  const rankTrackIds = cardIdsFrom(template.rankTrack);

  const modules: DeckModuleDefinition[] = [
    {
      id: 'lyap_core',
      name: baseStarterNameById.lyap_core,
      moduleType: 'MAIN_DECK_MODULE',
      category: 'LYAP',
      cardCount: 20,
      enabled: true,
      target: 'deck',
      defaultCategory: 'LYAP',
      cardIds: byCategory('LYAP'),
    },
    {
      id: 'scandal_core',
      name: baseStarterNameById.scandal_core,
      moduleType: 'MAIN_DECK_MODULE',
      category: 'SCANDAL',
      cardCount: 20,
      enabled: true,
      target: 'deck',
      defaultCategory: 'SCANDAL',
      cardIds: byCategory('SCANDAL'),
    },
    {
      id: 'support_core',
      name: baseStarterNameById.support_core,
      moduleType: 'MAIN_DECK_MODULE',
      category: 'SUPPORT',
      cardCount: 30,
      enabled: true,
      target: 'deck',
      defaultCategory: 'SUPPORT',
      cardIds: byCategory('SUPPORT'),
    },
    {
      id: 'command_core',
      name: baseStarterNameById.command_core,
      moduleType: 'MAIN_DECK_MODULE',
      category: 'COMMAND',
      cardCount: 30,
      enabled: true,
      target: 'deck',
      defaultCategory: 'COMMAND',
      cardIds: byCategory('COMMAND'),
    },
    {
      id: 'vvnz_default',
      name: 'VVNZ_DEFAULT',
      moduleType: 'SYSTEM_MODULE',
      category: 'VVNZ',
      cardCount: byCategory('VVNZ').length,
      enabled: true,
      target: 'deck',
      defaultCategory: 'VVNZ',
      cardIds: byCategory('VVNZ'),
    },
    {
      id: 'legendary_default',
      name: 'LEGENDARY_DEFAULT',
      moduleType: 'SEPARATE_DECK_MODULE',
      category: 'LEGENDARY',
      cardCount: template.legendaryDeck.length,
      enabled: true,
      target: 'legendaryDeck',
      defaultCategory: 'LEGENDARY',
      cardIds: cardIdsFrom(template.legendaryDeck),
    },
    {
      id: 'rank_default',
      name: 'RANK_DEFAULT',
      moduleType: 'VISUAL_TRACK_MODULE',
      category: 'RANK',
      cardCount: rankTrackIds.length,
      enabled: true,
      target: 'rankTrack',
      defaultCategory: undefined,
      cardIds: rankTrackIds,
    },
  ];

  return modules.map((module) => ({ ...module, cardIds: uniqueStrings(module.cardIds) }));
};

const sanitizeModuleType = (value: unknown): DeckModuleType => {
  if (value === 'SEPARATE_DECK_MODULE' || value === 'SYSTEM_MODULE' || value === 'VISUAL_TRACK_MODULE') return value;
  return 'MAIN_DECK_MODULE';
};

const sanitizeModuleCategory = (value: unknown): DeckModuleCategory => {
  if (value === 'LYAP' || value === 'SCANDAL' || value === 'SUPPORT' || value === 'COMMAND' || value === 'LEGENDARY' || value === 'VVNZ' || value === 'RANK') {
    return value;
  }
  return 'SUPPORT';
};

const sanitizeDeckTarget = (value: unknown): DeckTarget => {
  if (value === 'legendaryDeck' || value === 'rankTrack') return value;
  return 'deck';
};

const sanitizeDefaultCategory = (value: unknown, fallback: DeckModuleCategory): CardCategory | undefined => {
  if (fallback === 'RANK') return undefined;
  if (value === 'LYAP' || value === 'SCANDAL' || value === 'SUPPORT' || value === 'COMMAND' || value === 'VVNZ' || value === 'LEGENDARY') {
    return value;
  }
  if (value === 'DECISION') return 'COMMAND';
  return moduleCategoryToCardCategory(fallback);
};

const sanitizeModule = (value: DeckModuleDefinition): DeckModuleDefinition => {
  const moduleType = sanitizeModuleType(value.moduleType);
  const category = sanitizeModuleCategory(value.category);
  const normalizedId = String(value.id ?? '').trim().toLowerCase();
  const forcedBaseName = baseStarterNameById[normalizedId];
  return {
    id: normalizedId,
    name: forcedBaseName ?? (String(value.name ?? '').trim() || normalizedId),
    moduleType,
    category,
    cardCount: Math.max(0, Number(value.cardCount ?? 0)),
    enabled: value.enabled !== false,
    target: sanitizeDeckTarget(value.target),
    cardIds: uniqueStrings(Array.isArray(value.cardIds) ? value.cardIds : []),
    defaultCategory: sanitizeDefaultCategory(value.defaultCategory, category),
    deckBackImage: normalizeImagePath(typeof value.deckBackImage === 'string' ? value.deckBackImage : undefined),
  };
};

const normalizeModules = (
  modules: DeckModuleDefinition[] | undefined,
  templateBase: { deck: CardDefinition[]; legendaryDeck: CardDefinition[]; rankTrack: CardDefinition[] },
): DeckModuleDefinition[] => {
  const source = Array.isArray(modules) && modules.length > 0 ? modules : defaultModulesFromDecks(templateBase);
  const normalized = source
    .map((module) => sanitizeModule(module))
    .filter((module) => module.id);
  if (normalized.length === 0) return defaultModulesFromDecks(templateBase);

  const seen = new Set<string>();
  const deduped: DeckModuleDefinition[] = [];
  normalized.forEach((module) => {
    if (seen.has(module.id)) return;
    seen.add(module.id);
    deduped.push(module);
  });
  return deduped;
};

const pickFirstModuleId = (
  modules: DeckModuleDefinition[],
  predicate: (module: DeckModuleDefinition) => boolean,
): string | undefined => modules.find((module) => module.enabled && predicate(module))?.id;

const normalizeGameSetup = (
  setup: Partial<SharedGameSetup> | undefined,
  modules: DeckModuleDefinition[],
): SharedGameSetup => {
  const moduleById = new Map(modules.map((module) => [module.id, module] as const));

  const pickMain = (preferredId: unknown, category: DeckModuleCategory): string | undefined => {
    const preferred = typeof preferredId === 'string' ? preferredId.trim().toLowerCase() : '';
    if (preferred) {
      const module = moduleById.get(preferred);
      if (module && module.moduleType === 'MAIN_DECK_MODULE' && module.target === 'deck' && module.category === category) return module.id;
    }
    return pickFirstModuleId(modules, (module) => module.moduleType === 'MAIN_DECK_MODULE' && module.target === 'deck' && module.category === category);
  };

  const pickSingle = (
    preferredId: unknown,
    predicate: (module: DeckModuleDefinition) => boolean,
  ): string | undefined => {
    const preferred = typeof preferredId === 'string' ? preferredId.trim().toLowerCase() : '';
    if (preferred) {
      const module = moduleById.get(preferred);
      if (module && predicate(module)) return module.id;
    }
    return pickFirstModuleId(modules, predicate);
  };

  const optionalMainDeckModuleIds = uniqueStrings(
    Array.isArray(setup?.optionalMainDeckModuleIds)
      ? setup?.optionalMainDeckModuleIds
      : modules
        .filter((module) => module.enabled && module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck')
        .map((module) => module.id),
  ).filter((id) => {
    const module = moduleById.get(id);
    return Boolean(module && module.enabled && module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck');
  });

  const rawLegendaryDeckMode = setup?.legendaryDeckMode;
  const legendaryDeckMode: LegendaryDeckMode = rawLegendaryDeckMode === 'merged' ? 'merged' : 'separate';

  return {
    lyapModuleId: pickMain(setup?.lyapModuleId, 'LYAP'),
    scandalModuleId: pickMain(setup?.scandalModuleId, 'SCANDAL'),
    supportModuleId: pickMain(setup?.supportModuleId, 'SUPPORT'),
    commandModuleId: pickMain(setup?.commandModuleId, 'COMMAND'),
    optionalMainDeckModuleIds,
    legendaryModuleId: pickSingle(
      setup?.legendaryModuleId,
      (module) => module.moduleType === 'SEPARATE_DECK_MODULE' && module.category === 'LEGENDARY' && module.target === 'legendaryDeck',
    ),
    rankModuleId: pickSingle(
      setup?.rankModuleId,
      (module) => module.moduleType === 'VISUAL_TRACK_MODULE' && module.category === 'RANK' && module.target === 'rankTrack',
    ),
    legendaryDeckMode,
  };
};

const buildTemplateWithDefaults = (
  source: {
    deck: CardDefinition[];
    legendaryDeck: CardDefinition[];
    rankTrack: CardDefinition[];
    deckBackImage?: string;
    modules?: DeckModuleDefinition[];
    gameSetup?: Partial<SharedGameSetup>;
  },
): SharedDeckTemplate => {
  const base = {
    deck: source.deck.map(cloneCard),
    legendaryDeck: source.legendaryDeck.map(cloneCard),
    rankTrack: source.rankTrack.map(cloneCard),
    deckBackImage: normalizeImagePath(source.deckBackImage),
  };
  const modules = normalizeModules(source.modules, base);
  const gameSetup = normalizeGameSetup(source.gameSetup, modules);
  return {
    ...base,
    modules,
    gameSetup,
  };
};

const defaultSharedDeckTemplate = (): SharedDeckTemplate => buildTemplateWithDefaults(defaultSharedDeckTemplateBase());

let sharedDeckTemplate: SharedDeckTemplate = defaultSharedDeckTemplate();
let sharedRanks: SharedRanks = baseRanks.map(cloneRank);

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
      victory: rawRank.victory === true ? true : undefined,
      flavor: typeof rawRank.flavor === 'string' ? rawRank.flavor : undefined,
    });
  });
  return true;
};

export const resetSharedRanks = () => {
  sharedRanks = baseRanks.map(cloneRank);
};

const buildCardCatalog = (template: SharedDeckTemplate): CardDefinition[] => {
  const byId = new Map<string, CardDefinition>();
  template.deck.forEach((card) => {
    if (!byId.has(card.id)) byId.set(card.id, cloneCard(card));
  });
  template.legendaryDeck.forEach((card) => {
    if (!byId.has(card.id)) byId.set(card.id, cloneCard({ ...card, category: 'LEGENDARY' }));
  });
  template.rankTrack.forEach((card) => {
    if (!byId.has(card.id)) byId.set(card.id, cloneCard(card));
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
  [template.deck, template.legendaryDeck, template.rankTrack].forEach((cards) => {
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
  const modules = normalizeModules(template.modules, template);
  const mergedSetup = normalizeGameSetup({ ...template.gameSetup, ...setupOverride }, modules);
  const moduleById = new Map(modules.map((module) => [module.id, module] as const));
  const cardsById = cardsByIdFromTemplate(template);

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

const validCategories = new Set<CardDefinition['category']>(['LYAP', 'SCANDAL', 'SUPPORT', 'COMMAND', 'VVNZ', 'LEGENDARY']);
const isLegendaryDeckOnlyCardId = (id: string) => /^legendary-/i.test(id);
const validEffectResources = new Set<string>(['time', 'reputation', 'discipline', 'documents', 'tech', 'rank']);

const parseCard = (value: unknown): CardDefinition | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  if (raw.titleEn !== undefined && typeof raw.titleEn !== 'string') return null;
  const rawCategory = raw.category === 'DECISION' ? 'COMMAND' : raw.category;
  if (!validCategories.has(rawCategory as CardDefinition['category'])) return null;
  const normalizedCategory = rawCategory as CardDefinition['category'];
  const image = normalizeImagePath(typeof raw.image === 'string' ? raw.image : undefined);
  let effects: CardDefinition['effects'];
  if (raw.effects !== undefined) {
    if (!Array.isArray(raw.effects)) return null;
    const parsedEffects: NonNullable<CardDefinition['effects']> = [];
    for (const effect of raw.effects) {
      if (!effect || typeof effect !== 'object') return null;
      const row = effect as Record<string, unknown>;
      if (typeof row.resource !== 'string' || !validEffectResources.has(row.resource)) return null;
      if (typeof row.value !== 'number') return null;
      parsedEffects.push({ resource: row.resource as 'rank' | ResourceKey, value: row.value });
    }
    effects = parsedEffects;
  }
  const flavor = typeof raw.flavor === 'string' ? raw.flavor : undefined;
  const titleEn = typeof raw.titleEn === 'string' ? raw.titleEn : undefined;
  const flavorEn = typeof raw.flavorEn === 'string' ? raw.flavorEn : undefined;
  const grantRank = typeof raw.grantRank === 'string' && raw.grantRank.trim() ? raw.grantRank.trim() : undefined;
  return { id: raw.id, title: raw.title, titleEn, category: normalizedCategory, image, grantRank, effects, flavor, flavorEn };
};

const parseModules = (value: unknown): DeckModuleDefinition[] | null => {
  if (!Array.isArray(value)) return null;
  const parsed: DeckModuleDefinition[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') return null;
    const raw = row as Record<string, unknown>;
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
    const module: DeckModuleDefinition = {
      id: raw.id,
      name: raw.name,
      moduleType: sanitizeModuleType(raw.moduleType),
      category: sanitizeModuleCategory(raw.category),
      cardCount: Number(raw.cardCount ?? 0),
      enabled: raw.enabled !== false,
      target: sanitizeDeckTarget(raw.target),
      cardIds: Array.isArray(raw.cardIds) ? raw.cardIds.filter((item): item is string => typeof item === 'string') : [],
      defaultCategory: sanitizeDefaultCategory(raw.defaultCategory, sanitizeModuleCategory(raw.category)),
      deckBackImage: normalizeImagePath(typeof raw.deckBackImage === 'string' ? raw.deckBackImage : undefined),
    };
    parsed.push(module);
  }
  return parsed;
};

const parseGameSetup = (value: unknown): Partial<SharedGameSetup> | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const safeId = (input: unknown): string | undefined => {
    if (typeof input !== 'string') return undefined;
    const normalized = input.trim().toLowerCase();
    return normalized || undefined;
  };
  const optionalMainDeckModuleIds = Array.isArray(raw.optionalMainDeckModuleIds)
    ? raw.optionalMainDeckModuleIds.filter((item): item is string => typeof item === 'string').map((id) => id.trim().toLowerCase()).filter(Boolean)
    : undefined;
  const legendaryDeckMode = raw.legendaryDeckMode === 'merged' ? 'merged' : raw.legendaryDeckMode === 'separate' ? 'separate' : undefined;
  return {
    lyapModuleId: safeId(raw.lyapModuleId),
    scandalModuleId: safeId(raw.scandalModuleId),
    supportModuleId: safeId(raw.supportModuleId),
    commandModuleId: safeId(raw.commandModuleId),
    optionalMainDeckModuleIds,
    legendaryModuleId: safeId(raw.legendaryModuleId),
    rankModuleId: safeId(raw.rankModuleId),
    legendaryDeckMode,
  };
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

  const importByFullCards = () => {
    if (!Array.isArray(raw.deck) || !Array.isArray(raw.legendaryDeck)) return { ok: false as const, error: 'Template must contain deck and legendaryDeck arrays' };
    const deck = raw.deck.map(parseCard);
    const legendaryDeck = raw.legendaryDeck.map(parseCard);
    const rankTrack = (Array.isArray(raw.rankTrack) ? raw.rankTrack : []).map(parseCard);
    if (deck.some((card) => !card) || legendaryDeck.some((card) => !card) || rankTrack.some((card) => !card)) return { ok: false as const, error: 'One or more cards have invalid schema' };
    typedDeck = (deck as CardDefinition[]).map(cloneCard);
    typedLegendaryDeck = (legendaryDeck as CardDefinition[]).map(cloneCard);
    typedRankTrack = (rankTrack as CardDefinition[]).map(cloneCard);
    return { ok: true as const };
  };

  const importByCatalogIds = () => {
    if (!Array.isArray(raw.catalog) || !Array.isArray(raw.deckIds) || !Array.isArray(raw.legendaryDeckIds)) return { ok: false as const, error: 'Template must contain catalog, deckIds and legendaryDeckIds arrays' };
    const catalogParsed = raw.catalog.map(parseCard);
    if (catalogParsed.some((card) => !card)) return { ok: false as const, error: 'One or more catalog cards have invalid schema' };
    const byId = new Map<string, CardDefinition>();
    (catalogParsed as CardDefinition[]).forEach((card) => { if (!byId.has(card.id)) byId.set(card.id, cloneCard(card)); });
    const resolveIds = (ids: unknown[], field: string): CardDefinition[] | null => {
      const out: CardDefinition[] = [];
      for (const idRaw of ids) {
        if (typeof idRaw !== 'string') return null;
        const card = byId.get(idRaw);
        if (!card) throw new Error(`Unknown card id in ${field}: ${idRaw}`);
        out.push(cloneCard(card));
      }
      return out;
    };
    try {
      const deck = resolveIds(raw.deckIds as unknown[], 'deckIds');
      const legendary = resolveIds(raw.legendaryDeckIds as unknown[], 'legendaryDeckIds');
      const rankTrack = resolveIds(Array.isArray(raw.rankTrackIds) ? raw.rankTrackIds : [], 'rankTrackIds');
      if (!deck || !legendary || !rankTrack) return { ok: false as const, error: 'Template id arrays must contain strings only' };
      typedDeck = deck;
      typedLegendaryDeck = legendary;
      typedRankTrack = rankTrack;
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: String(error instanceof Error ? error.message : error) };
    }
  };

  if (Array.isArray(raw.catalog) && Array.isArray(raw.deckIds) && Array.isArray(raw.legendaryDeckIds)) {
    const result = importByCatalogIds();
    if (!result.ok) return result;
  } else {
    const result = importByFullCards();
    if (!result.ok) return result;
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
  return { ok: true };
};

export const resetSharedDeckTemplate = () => {
  sharedDeckTemplate = defaultSharedDeckTemplate();
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

export const categorizeModuleByCardCategory = (category: CardCategory): DeckModuleCategory => mapCardCategoryToModuleCategory(category);
