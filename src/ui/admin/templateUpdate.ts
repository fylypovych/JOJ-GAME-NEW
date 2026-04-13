import type { SharedDeckTemplate } from './types';
import type { CardDefinition } from '../../game/types';
import { normalizeImagePath } from '../../game/imagePaths';

export const cloneTemplateForEdit = (
  sharedDeckTemplate: SharedDeckTemplate,
  cardCatalog: CardDefinition[],
): SharedDeckTemplate & { catalog: CardDefinition[] } => ({
  deck: sharedDeckTemplate.deck.map((card) => ({ ...card })),
  legendaryDeck: sharedDeckTemplate.legendaryDeck.map((card) => ({ ...card })),
  rankTrack: sharedDeckTemplate.rankTrack.map((card) => ({ ...card })),
  extraCatalog: sharedDeckTemplate.extraCatalog.map((card) => ({ ...card })),
  deckBackImage: sharedDeckTemplate.deckBackImage,
  catalog: cardCatalog.map((card) => ({ ...card })),
  modules: (sharedDeckTemplate.modules ?? []).map((module) => ({ ...module, cardIds: [...module.cardIds] })),
  gameSetup: {
    ...sharedDeckTemplate.gameSetup,
    optionalMainDeckModuleIds: [...(sharedDeckTemplate.gameSetup?.optionalMainDeckModuleIds ?? [])],
  },
});

export const appendImportedCardsToTemplate = (args: {
  template: SharedDeckTemplate & { catalog: CardDefinition[] };
  importTarget: 'deck' | 'legendaryDeck' | 'rankTrack';
  cards: CardDefinition[];
  importCategoryMode: 'AS_IS' | CardDefinition['category'];
}) => {
  const normalizedCards = args.cards.map((card) => ({
    ...card,
    category: args.importCategoryMode === 'AS_IS' ? card.category : args.importCategoryMode,
    image: normalizeImagePath(card.image),
  }));
  args.template[args.importTarget] = [...args.template[args.importTarget], ...normalizedCards];
  return normalizedCards;
};
