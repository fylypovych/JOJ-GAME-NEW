import type { DeckModuleCategory, DeckModuleDefinition, DeckTarget } from '../../game/jojGame';
import { normalizeImagePath } from '../../game/imagePaths';
import type { CardCategory, CardDefinition } from '../../game/types';
import { appendImportedCardsToTemplate } from './templateUpdate';
import type { ImportCategoryMode, SharedDeckTemplate } from './types';

export const syncMissingCardsIntoModules = (args: {
  sharedDeckTemplate: SharedDeckTemplate;
}): Map<string, Set<string>> => {
  const { sharedDeckTemplate } = args;
  const modules = sharedDeckTemplate.modules ?? [];
  const setup = sharedDeckTemplate.gameSetup ?? { optionalMainDeckModuleIds: [] };
  const byId = new Map(modules.map((module) => [module.id, module] as const));
  const moduleIdsByTarget = {
    deck: new Set(modules.filter((m) => m.target === 'deck').flatMap((m) => m.cardIds)),
    legendaryDeck: new Set(modules.filter((m) => m.target === 'legendaryDeck').flatMap((m) => m.cardIds)),
    rankTrack: new Set(modules.filter((m) => m.target === 'rankTrack').flatMap((m) => m.cardIds)),
  };
  const missingDeckIds = Array.from(new Set(sharedDeckTemplate.deck.map((card) => card.id).filter((id) => !moduleIdsByTarget.deck.has(id))));
  const missingLegendaryIds = Array.from(
    new Set(sharedDeckTemplate.legendaryDeck.map((card) => card.id).filter((id) => !moduleIdsByTarget.legendaryDeck.has(id))),
  );
  const missingRankIds = Array.from(new Set(sharedDeckTemplate.rankTrack.map((card) => card.id).filter((id) => !moduleIdsByTarget.rankTrack.has(id))));
  const fallbackLegendaryModuleId = setup.legendaryModuleId
    ?? modules.find((m) => m.target === 'legendaryDeck' && m.category === 'LEGENDARY')?.id;
  const fallbackRankModuleId = setup.rankModuleId
    ?? modules.find((m) => m.target === 'rankTrack' && m.category === 'RANK')?.id;

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
    if (!moduleId || !byId.has(moduleId)) return;
    if (!addByModuleId.has(moduleId)) addByModuleId.set(moduleId, new Set<string>());
    addByModuleId.get(moduleId)?.add(cardId);
  };

  missingDeckIds.forEach((cardId) => {
    const card = sharedDeckTemplate.deck.find((row) => row.id === cardId);
    if (card) queue(targetByDeckCategory(card.category), cardId);
  });
  missingLegendaryIds.forEach((cardId) => queue(fallbackLegendaryModuleId, cardId));
  missingRankIds.forEach((cardId) => queue(fallbackRankModuleId, cardId));

  return addByModuleId;
};

export const applyModuleActionToTemplate = (args: {
  nextTemplate: SharedDeckTemplate & { catalog: CardDefinition[] };
  deckModules: DeckModuleDefinition[];
  cardCatalog: CardDefinition[];
  module: DeckModuleDefinition;
  action: 'add' | 'replace' | 'remove';
}) => {
  const { nextTemplate, deckModules, cardCatalog, module, action } = args;
  const byId = new Map(cardCatalog.map((card) => [card.id, card] as const));
  const source = module.cardIds.map((id) => byId.get(id)).filter(Boolean).map((card) => ({ ...(card as CardDefinition) }));
  const targetKey = module.target;
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
};

export const normalizeDeckModuleForSave = (nextModule: {
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
}): DeckModuleDefinition | null => {
  const normalizedId = nextModule.id.trim().toLowerCase();
  if (!normalizedId) return null;
  return {
    ...nextModule,
    id: normalizedId,
    name: nextModule.name.trim() || normalizedId,
    cardIds: Array.from(new Set(nextModule.cardIds.map((id) => id.trim()).filter(Boolean))),
    cardCount: Math.max(0, Number(nextModule.cardCount || nextModule.cardIds.length || 0)),
    deckBackImage: normalizeImagePath(nextModule.deckBackImage?.trim()),
  };
};

export const saveDeckModuleToTemplate = (args: {
  nextTemplate: SharedDeckTemplate & { catalog: CardDefinition[] };
  normalized: DeckModuleDefinition;
}) => {
  const { nextTemplate, normalized } = args;
  const prev = nextTemplate.modules ?? [];
  const idx = prev.findIndex((row) => row.id === normalized.id);
  nextTemplate.modules = idx === -1 ? [...prev, normalized] : prev.map((row, i) => (i === idx ? normalized : row));
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
};

export const deleteDeckModuleFromTemplate = (args: {
  nextTemplate: SharedDeckTemplate & { catalog: CardDefinition[] };
  moduleId: string;
}) => {
  const { nextTemplate, moduleId } = args;
  nextTemplate.modules = (nextTemplate.modules ?? []).filter((row) => row.id !== moduleId);
  const setup = nextTemplate.gameSetup;
  if (setup.lyapModuleId === moduleId) setup.lyapModuleId = undefined;
  if (setup.scandalModuleId === moduleId) setup.scandalModuleId = undefined;
  if (setup.supportModuleId === moduleId) setup.supportModuleId = undefined;
  if (setup.commandModuleId === moduleId) setup.commandModuleId = undefined;
  if (setup.legendaryModuleId === moduleId) setup.legendaryModuleId = undefined;
  if (setup.rankModuleId === moduleId) setup.rankModuleId = undefined;
  setup.optionalMainDeckModuleIds = (setup.optionalMainDeckModuleIds ?? []).filter((id) => id !== moduleId);
};

export const collectImportCards = (value: unknown): CardDefinition[] | null => {
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

export const applyImportToTemplate = (args: {
  template: SharedDeckTemplate & { catalog: CardDefinition[] };
  importTarget: DeckTarget;
  cards: CardDefinition[];
  importCategoryMode: ImportCategoryMode;
}) => appendImportedCardsToTemplate(args);
