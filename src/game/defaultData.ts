import { cloneCard, cloneRank } from './cloneUtils';
import type { CardDefinition, RankDefinition } from './types';
import sharedDeckTemplateJson from '../../database/shared-deck-template.json';
import sharedRanksJson from '../../database/shared-ranks.json';

const templateSource = (
  sharedDeckTemplateJson && typeof sharedDeckTemplateJson === 'object'
    ? sharedDeckTemplateJson as Record<string, unknown>
    : {}
);

const asCardArray = (value: unknown): CardDefinition[] => (
  Array.isArray(value)
    ? value as CardDefinition[]
    : []
);

export const defaultSharedDeckTemplateSeed = {
  deck: asCardArray(templateSource.deck),
  legendaryDeck: asCardArray(templateSource.legendaryDeck),
  rankTrack: asCardArray(templateSource.rankTrack),
  extraCatalog: asCardArray(templateSource.catalog),
  deckBackImage: typeof templateSource.deckBackImage === 'string' ? templateSource.deckBackImage : undefined,
  modules: Array.isArray(templateSource.modules) ? templateSource.modules : undefined,
  gameSetup: templateSource.gameSetup && typeof templateSource.gameSetup === 'object'
    ? templateSource.gameSetup as Record<string, unknown>
    : undefined,
};

export const defaultSharedExtraCatalogSeed: CardDefinition[] = defaultSharedDeckTemplateSeed.extraCatalog.map(cloneCard);

export const defaultSharedRanksSeed: RankDefinition[] = (
  Array.isArray(sharedRanksJson)
    ? sharedRanksJson
    : (
      sharedRanksJson && typeof sharedRanksJson === 'object' && Array.isArray((sharedRanksJson as { ranks?: unknown[] }).ranks)
        ? (sharedRanksJson as { ranks: unknown[] }).ranks
        : []
    )
) as RankDefinition[];

export const defaultBaseDeck = defaultSharedDeckTemplateSeed.deck.map(cloneCard);
export const defaultLegendaryCards = defaultSharedDeckTemplateSeed.legendaryDeck.map(cloneCard);
export const defaultRanks = defaultSharedRanksSeed.map(cloneRank);
