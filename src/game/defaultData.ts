import sharedDeckTemplateJson from '../../database/shared-deck-template.json';
import sharedRanksJson from '../../database/shared-ranks.json';
import { cloneCard, cloneRank } from './cloneUtils';
import { buildTemplateWithDefaults } from './sharedConfigHelpers';
import { normalizeSharedRanks } from './sharedConfigRanks';
import { parseImportedRanksPayload } from './sharedConfigSchema';
import type { CardDefinition, RankDefinition } from './types';

type SharedDeckTemplateJsonShape = {
  catalog?: CardDefinition[];
  deck?: CardDefinition[];
  legendaryDeck?: CardDefinition[];
  rankTrack?: CardDefinition[];
  deckBackImage?: string;
  modules?: unknown;
  gameSetup?: unknown;
};

const rawTemplate = sharedDeckTemplateJson as SharedDeckTemplateJsonShape;
const importedRanks = parseImportedRanksPayload(sharedRanksJson);

export const defaultSharedDeckTemplateSeed = buildTemplateWithDefaults({
  deck: Array.isArray(rawTemplate.deck) ? rawTemplate.deck.map(cloneCard) : [],
  legendaryDeck: Array.isArray(rawTemplate.legendaryDeck) ? rawTemplate.legendaryDeck.map(cloneCard) : [],
  rankTrack: Array.isArray(rawTemplate.rankTrack) ? rawTemplate.rankTrack.map(cloneCard) : [],
  deckBackImage: rawTemplate.deckBackImage,
  modules: Array.isArray(rawTemplate.modules) ? rawTemplate.modules : undefined,
  gameSetup: rawTemplate.gameSetup && typeof rawTemplate.gameSetup === 'object'
    ? rawTemplate.gameSetup
    : undefined,
});

const seededCardIds = new Set([
  ...defaultSharedDeckTemplateSeed.deck.map((card) => card.id),
  ...defaultSharedDeckTemplateSeed.legendaryDeck.map((card) => card.id),
  ...defaultSharedDeckTemplateSeed.rankTrack.map((card) => card.id),
]);

export const defaultSharedExtraCatalogSeed: CardDefinition[] = Array.isArray(rawTemplate.catalog)
  ? rawTemplate.catalog
    .filter((card): card is CardDefinition => Boolean(card && typeof card.id === 'string' && card.id.trim()))
    .filter((card) => !seededCardIds.has(card.id))
    .map(cloneCard)
  : [];

export const defaultSharedRanksSeed: RankDefinition[] = normalizeSharedRanks(importedRanks ?? []);

export const defaultBaseDeck = defaultSharedDeckTemplateSeed.deck.map(cloneCard);
export const defaultLegendaryCards = defaultSharedDeckTemplateSeed.legendaryDeck.map(cloneCard);
export const defaultRanks = defaultSharedRanksSeed.map(cloneRank);
