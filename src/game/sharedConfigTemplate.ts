import { cloneCard } from './cloneUtils';
import { normalizeImagePath } from './imagePaths';
import { SHARED_TEMPLATE_SCHEMA_KIND, SHARED_TEMPLATE_SCHEMA_VERSION, unwrapImportedTemplateDocument } from './sharedConfigSchema';
import { importTemplateCardsByCatalogIds, importTemplateCardsByFullRows, isLegendaryDeckOnlyCardId } from './sharedConfigImport';
import {
  buildTemplateWithDefaults,
  normalizeGameSetup,
  normalizeModules,
  parseGameSetup,
  parseModules,
} from './sharedConfigHelpers';
import type {
  DeckModuleDefinition,
  DeckModuleBuildResult,
  DeckTarget,
  SharedDeckTemplate,
  SharedGameSetup,
} from './sharedConfig';
import type { CardDefinition } from './types';

const withModuleImagePath = (
  card: CardDefinition,
  moduleNameByCardId: Map<string, string>,
): CardDefinition => {
  const image = typeof card.image === 'string' ? card.image.trim() : '';
  if (!image.startsWith('/card-assets/')) return cloneCard(card);
  const relative = image.slice('/card-assets/'.length);
  if (!relative || relative.includes('/')) return cloneCard(card);
  const moduleName = moduleNameByCardId.get(card.id);
  if (!moduleName) return cloneCard(card);
  return cloneCard({
    ...card,
    image: `/card-assets/${moduleName}/${relative}`,
  });
};

export const buildCardCatalog = (template: SharedDeckTemplate, extraCatalog: CardDefinition[]): CardDefinition[] => {
  const byId = new Map<string, CardDefinition>();
  const moduleNameByCardId = new Map<string, string>();
  template.modules.forEach((module) => {
    if (module.target !== 'deck' && module.target !== 'legendaryDeck') return;
    module.cardIds.forEach((cardId) => {
      if (!moduleNameByCardId.has(cardId)) {
        moduleNameByCardId.set(cardId, module.name);
      }
    });
  });
  extraCatalog.forEach((card) => {
    if (!byId.has(card.id)) byId.set(card.id, withModuleImagePath(card, moduleNameByCardId));
  });
  template.deck.forEach((card) => {
    byId.set(card.id, withModuleImagePath(card, moduleNameByCardId));
  });
  template.legendaryDeck.forEach((card) => {
    byId.set(card.id, withModuleImagePath({ ...card, category: 'LEGENDARY' }, moduleNameByCardId));
  });
  template.rankTrack.forEach((card) => {
    byId.set(card.id, cloneCard(card));
  });
  return [...byId.values()];
};

export const cloneSharedDeckTemplate = (template: SharedDeckTemplate): SharedDeckTemplate => ({
  deck: template.deck.map(cloneCard),
  legendaryDeck: template.legendaryDeck.map(cloneCard),
  rankTrack: template.rankTrack.map(cloneCard),
  extraCatalog: template.extraCatalog.map(cloneCard),
  deckBackImage: template.deckBackImage,
  modules: template.modules.map((module) => ({ ...module, cardIds: [...module.cardIds] })),
  gameSetup: {
    ...template.gameSetup,
    optionalMainDeckModuleIds: [...template.gameSetup.optionalMainDeckModuleIds],
  },
});

export const cardsByIdFromTemplate = (template: SharedDeckTemplate, extraCatalog: CardDefinition[]): Map<string, CardDefinition> => {
  const byId = new Map<string, CardDefinition>();
  [extraCatalog, template.deck, template.legendaryDeck, template.rankTrack].forEach((cards) => {
    cards.forEach((card) => {
      if (!byId.has(card.id)) byId.set(card.id, cloneCard(card));
    });
  });
  return byId;
};

export const cardsFromModule = (
  module: DeckModuleDefinition | undefined,
  cardsById: Map<string, CardDefinition>,
): CardDefinition[] => {
  if (!module) return [];
  return module.cardIds
    .map((id) => cardsById.get(id))
    .filter((card): card is CardDefinition => Boolean(card))
    .map(cloneCard);
};

export const buildDeckModulesFromTemplateState = (
  template: SharedDeckTemplate,
  extraCatalog: CardDefinition[],
  setupOverride?: Partial<SharedGameSetup>,
): DeckModuleBuildResult => {
  const safeTemplate = {
    deck: Array.isArray(template?.deck) ? template.deck : [],
    legendaryDeck: Array.isArray(template?.legendaryDeck) ? template.legendaryDeck : [],
    rankTrack: Array.isArray(template?.rankTrack) ? template.rankTrack : [],
    extraCatalog: Array.isArray(template?.extraCatalog) ? template.extraCatalog : [],
    modules: Array.isArray(template?.modules) ? template.modules : [],
    gameSetup: template?.gameSetup ?? { optionalMainDeckModuleIds: [], legendaryDeckMode: 'separate' as const },
    deckBackImage: template?.deckBackImage,
  };
  const modules = normalizeModules(safeTemplate.modules, safeTemplate);
  const mergedSetup = normalizeGameSetup({ ...safeTemplate.gameSetup, ...setupOverride }, modules);
  const moduleById = new Map(modules.map((module) => [module.id, module] as const));
  const cardsById = cardsByIdFromTemplate(safeTemplate, extraCatalog);

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

export const exportSharedDeckTemplateState = (template: SharedDeckTemplate, extraCatalog: CardDefinition[]): string => {
  const safeTemplate = cloneSharedDeckTemplate(template);
  const catalog = buildCardCatalog(safeTemplate, extraCatalog);
  return JSON.stringify({
    kind: SHARED_TEMPLATE_SCHEMA_KIND,
    version: SHARED_TEMPLATE_SCHEMA_VERSION,
    catalog,
    deckIds: safeTemplate.deck.map((card) => card.id),
    legendaryDeckIds: safeTemplate.legendaryDeck.map((card) => card.id),
    rankTrackIds: safeTemplate.rankTrack.map((card) => card.id),
    deck: safeTemplate.deck,
    legendaryDeck: safeTemplate.legendaryDeck,
    rankTrack: safeTemplate.rankTrack,
    deckBackImage: safeTemplate.deckBackImage,
    modules: safeTemplate.modules,
    gameSetup: safeTemplate.gameSetup,
  }, null, 2);
};

export const importSharedDeckTemplateState = (text: string): { ok: true; template: SharedDeckTemplate; extraCatalog: CardDefinition[] } | { ok: false; error: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  const document = unwrapImportedTemplateDocument(parsed);
  if (!document.ok) return document;
  const raw = document.raw;
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

  return {
    ok: true,
    template: buildTemplateWithDefaults({
      deck: typedDeck,
      legendaryDeck: typedLegendaryDeck,
      rankTrack: typedRankTrack,
      deckBackImage,
      modules: importedModules ?? undefined,
      gameSetup: importedSetup ?? undefined,
    }),
    extraCatalog: typedExtraCatalog.map(cloneCard),
  };
};

export const validateSharedDeckTemplateState = (
  currentTemplate: SharedDeckTemplate,
  currentExtraCatalog: CardDefinition[],
  text: string,
) => {
  const prevTemplate = cloneSharedDeckTemplate(currentTemplate);
  const prevExtraCatalog = currentExtraCatalog.map(cloneCard);
  const result = importSharedDeckTemplateState(text);
  return {
    prevTemplate,
    prevExtraCatalog,
    result,
  };
};

export const shuffleItems = <T,>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

export const shuffleSharedDeckTemplateState = (template: SharedDeckTemplate): SharedDeckTemplate => ({
  ...template,
  deck: shuffleItems(template.deck),
});

export const setSharedDeckBackImageState = (template: SharedDeckTemplate, path?: string): SharedDeckTemplate => ({
  ...template,
  deckBackImage: normalizeImagePath(path),
});

export const addCardToSharedDeckTemplateState = (
  template: SharedDeckTemplate,
  catalog: CardDefinition[],
  target: DeckTarget,
  cardId: string,
): SharedDeckTemplate | null => {
  if (target === 'deck' && isLegendaryDeckOnlyCardId(cardId)) return null;
  const card = catalog.find((item) => item.id === cardId);
  if (!card) return null;
  return { ...template, [target]: [...template[target], cloneCard(card)] };
};

export const addCustomCardToSharedDeckTemplateState = (
  template: SharedDeckTemplate,
  target: DeckTarget,
  card: CardDefinition,
): SharedDeckTemplate | null => {
  if (target === 'deck' && isLegendaryDeckOnlyCardId(card.id)) return null;
  return { ...template, [target]: [...template[target], cloneCard(card)] };
};

export const removeCardAtFromSharedDeckTemplateState = (
  template: SharedDeckTemplate,
  target: DeckTarget,
  index: number,
): SharedDeckTemplate | null => {
  if (index < 0 || index >= template[target].length) return null;
  return { ...template, [target]: template[target].filter((_, i) => i !== index) };
};

export const updateCardAtInSharedDeckTemplateState = (
  template: SharedDeckTemplate,
  target: DeckTarget,
  index: number,
  card: CardDefinition,
): SharedDeckTemplate | null => {
  if (index < 0 || index >= template[target].length) return null;
  if (target === 'deck' && isLegendaryDeckOnlyCardId(card.id)) return null;
  return { ...template, [target]: template[target].map((item, i) => (i === index ? cloneCard(card) : item)) };
};
