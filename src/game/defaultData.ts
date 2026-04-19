import { cloneCard, cloneRank } from './cloneUtils';
import type { CardDefinition, RankDefinition } from './types';

export const defaultSharedDeckTemplateSeed = {
  deck: [] as CardDefinition[],
  legendaryDeck: [] as CardDefinition[],
  rankTrack: [] as CardDefinition[],
  extraCatalog: [] as CardDefinition[],
  deckBackImage: undefined as string | undefined,
  modules: undefined,
  gameSetup: undefined,
};

export const defaultSharedExtraCatalogSeed: CardDefinition[] = [];

export const defaultSharedRanksSeed: RankDefinition[] = [];

export const defaultBaseDeck = defaultSharedDeckTemplateSeed.deck.map(cloneCard);
export const defaultLegendaryCards = defaultSharedDeckTemplateSeed.legendaryDeck.map(cloneCard);
export const defaultRanks = defaultSharedRanksSeed.map(cloneRank);
