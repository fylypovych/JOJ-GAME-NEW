import { cloneCard } from './cloneUtils';
import { normalizeImagePath } from './imagePaths';
import type {
  CardCategory,
  CardDefinition,
} from './types';
import type {
  DeckModuleCategory,
  DeckModuleDefinition,
  DeckModuleType,
  DeckTarget,
  SharedDeckTemplate,
  SharedGameSetup,
} from './sharedConfig';

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

export const cardIdsFrom = (cards: CardDefinition[] | undefined | null) => (Array.isArray(cards) ? cards.map((card) => card.id) : []);
export const uniqueStrings = (items: string[]): string[] => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const STARTER_RELEASE_YEAR = '2026';
export const baseStarterNameById: Record<string, string> = {
  lyap_core: `${STARTER_RELEASE_YEAR}.LYAP.STARTER`,
  scandal_core: `${STARTER_RELEASE_YEAR}.SCANDAL.STARTER`,
  support_core: `${STARTER_RELEASE_YEAR}.SUPPORT.STARTER`,
  command_core: `${STARTER_RELEASE_YEAR}.COMMAND.STARTER`,
};

export const defaultSharedDeckTemplateBase = (baseDeck: CardDefinition[], legendaryCards: CardDefinition[]) => ({
  deck: baseDeck.map(cloneCard),
  legendaryDeck: legendaryCards.map(cloneCard),
  rankTrack: [] as CardDefinition[],
  deckBackImage: undefined as string | undefined,
});

export const defaultModulesFromDecks = (template: {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
}): DeckModuleDefinition[] => {
  const byCategory = (category: CardCategory) => cardIdsFrom(template.deck.filter((card) => card.category === category));
  const rankTrackIds = cardIdsFrom(template.rankTrack);
  const modules: DeckModuleDefinition[] = [
    { id: 'lyap_core', name: baseStarterNameById.lyap_core, moduleType: 'MAIN_DECK_MODULE', category: 'LYAP', cardCount: 20, enabled: true, target: 'deck', defaultCategory: 'LYAP', cardIds: byCategory('LYAP') },
    { id: 'scandal_core', name: baseStarterNameById.scandal_core, moduleType: 'MAIN_DECK_MODULE', category: 'SCANDAL', cardCount: 20, enabled: true, target: 'deck', defaultCategory: 'SCANDAL', cardIds: byCategory('SCANDAL') },
    { id: 'support_core', name: baseStarterNameById.support_core, moduleType: 'MAIN_DECK_MODULE', category: 'SUPPORT', cardCount: 30, enabled: true, target: 'deck', defaultCategory: 'SUPPORT', cardIds: byCategory('SUPPORT') },
    { id: 'command_core', name: baseStarterNameById.command_core, moduleType: 'MAIN_DECK_MODULE', category: 'COMMAND', cardCount: 30, enabled: true, target: 'deck', defaultCategory: 'COMMAND', cardIds: byCategory('COMMAND') },
    { id: 'vvnz_default', name: 'VVNZ_DEFAULT', moduleType: 'SYSTEM_MODULE', category: 'VVNZ', cardCount: byCategory('VVNZ').length, enabled: true, target: 'deck', defaultCategory: 'VVNZ', cardIds: byCategory('VVNZ') },
    { id: 'legendary_default', name: 'LEGENDARY_DEFAULT', moduleType: 'SEPARATE_DECK_MODULE', category: 'LEGENDARY', cardCount: template.legendaryDeck.length, enabled: true, target: 'legendaryDeck', defaultCategory: 'LEGENDARY', cardIds: cardIdsFrom(template.legendaryDeck) },
    { id: 'rank_default', name: 'RANK_DEFAULT', moduleType: 'VISUAL_TRACK_MODULE', category: 'RANK', cardCount: rankTrackIds.length, enabled: true, target: 'rankTrack', defaultCategory: undefined, cardIds: rankTrackIds },
  ];
  return modules.map((module) => ({ ...module, cardIds: uniqueStrings(module.cardIds) }));
};

export const sanitizeModuleType = (value: unknown): DeckModuleType => {
  if (value === 'SEPARATE_DECK_MODULE' || value === 'SYSTEM_MODULE' || value === 'VISUAL_TRACK_MODULE') return value;
  return 'MAIN_DECK_MODULE';
};

export const sanitizeModuleCategory = (value: unknown): DeckModuleCategory => {
  if (value === 'LYAP' || value === 'SCANDAL' || value === 'SUPPORT' || value === 'COMMAND' || value === 'LEGENDARY' || value === 'VVNZ' || value === 'RANK') return value;
  return 'SUPPORT';
};

export const sanitizeDeckTarget = (value: unknown): DeckTarget => {
  if (value === 'legendaryDeck' || value === 'rankTrack') return value;
  return 'deck';
};

export const sanitizeDefaultCategory = (value: unknown, fallback: DeckModuleCategory): CardCategory | undefined => {
  if (fallback === 'RANK') return undefined;
  if (value === 'LYAP' || value === 'SCANDAL' || value === 'SUPPORT' || value === 'COMMAND' || value === 'VVNZ' || value === 'LEGENDARY') return value;
  if (value === 'DECISION') return 'COMMAND';
  return moduleCategoryToCardCategory(fallback);
};

export const sanitizeModule = (value: DeckModuleDefinition): DeckModuleDefinition => {
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

export const normalizeModules = (
  modules: DeckModuleDefinition[] | undefined,
  templateBase: { deck: CardDefinition[]; legendaryDeck: CardDefinition[]; rankTrack: CardDefinition[] },
): DeckModuleDefinition[] => {
  const source = Array.isArray(modules) && modules.length > 0 ? modules : defaultModulesFromDecks(templateBase);
  const normalized = source.map((module) => sanitizeModule(module)).filter((module) => module.id);
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

export const normalizeGameSetup = (
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
  const pickSingle = (preferredId: unknown, predicate: (module: DeckModuleDefinition) => boolean): string | undefined => {
    const preferred = typeof preferredId === 'string' ? preferredId.trim().toLowerCase() : '';
    if (preferred) {
      const module = moduleById.get(preferred);
      if (module && predicate(module)) return module.id;
    }
    return pickFirstModuleId(modules, predicate);
  };
  const optionalMainDeckModuleIds = uniqueStrings(
    Array.isArray(setup?.optionalMainDeckModuleIds)
      ? setup.optionalMainDeckModuleIds
      : modules.filter((module) => module.enabled && module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck').map((module) => module.id),
  ).filter((id) => {
    const module = moduleById.get(id);
    return Boolean(module && module.enabled && module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck');
  });
  const rawLegendaryDeckMode = setup?.legendaryDeckMode;
  const legendaryDeckMode = rawLegendaryDeckMode === 'merged' ? 'merged' : 'separate';
  return {
    lyapModuleId: pickMain(setup?.lyapModuleId, 'LYAP'),
    scandalModuleId: pickMain(setup?.scandalModuleId, 'SCANDAL'),
    supportModuleId: pickMain(setup?.supportModuleId, 'SUPPORT'),
    commandModuleId: pickMain(setup?.commandModuleId, 'COMMAND'),
    optionalMainDeckModuleIds,
    legendaryModuleId: pickSingle(setup?.legendaryModuleId, (module) => module.moduleType === 'SEPARATE_DECK_MODULE' && module.category === 'LEGENDARY' && module.target === 'legendaryDeck'),
    rankModuleId: pickSingle(setup?.rankModuleId, (module) => module.moduleType === 'VISUAL_TRACK_MODULE' && module.category === 'RANK' && module.target === 'rankTrack'),
    legendaryDeckMode,
  };
};

export const buildTemplateWithDefaults = (
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
  return { ...base, modules, gameSetup };
};

export const parseModules = (value: unknown): DeckModuleDefinition[] | null => {
  if (!Array.isArray(value)) return null;
  const parsed: DeckModuleDefinition[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') return null;
    const raw = row as Record<string, unknown>;
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
    parsed.push({
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
    });
  }
  return parsed;
};

export const parseGameSetup = (value: unknown): Partial<SharedGameSetup> | null => {
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

export const categorizeModuleByCardCategory = (category: CardCategory): DeckModuleCategory => mapCardCategoryToModuleCategory(category);
