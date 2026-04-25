import { useMemo } from 'react';
import type { CardDefinition } from '../../game/types';
import type { GalleryCategoryFilter } from './model';
import { normalizeImagePath } from '../../game/imagePaths';

export interface UseGalleryDataArgs {
  cardCatalog: CardDefinition[];
  sharedDeckTemplate: {
    deck: Array<{ id: string }>;
    legendaryDeck: Array<{ id: string }>;
    modules?: Array<{
      id: string;
      name: string;
      moduleType: string;
      target: string;
      category: string;
      cardIds: string[];
    }>;
    rankTrack: Array<{ id: string }>;
  };
  galleryCategoryFilter: GalleryCategoryFilter;
}

export interface UseGalleryDataResult {
  galleryCards: CardDefinition[];
  cardImageById: Record<string, string>;
}

export const useGalleryData = (args: UseGalleryDataArgs): UseGalleryDataResult => {
  const { cardCatalog, sharedDeckTemplate, galleryCategoryFilter } = args;

  const galleryCards = useMemo(() => {
    const activeIds = new Set<string>([
      ...sharedDeckTemplate.deck.map((card) => card.id),
      ...sharedDeckTemplate.legendaryDeck.map((card) => card.id),
      ...sharedDeckTemplate.rankTrack.map((card) => card.id),
      ...((sharedDeckTemplate.modules ?? []).flatMap((module) => module.cardIds ?? [])),
    ]);
    const rankTrackIds = new Set(sharedDeckTemplate.rankTrack.map((card) => card.id));
    const rankModule = sharedDeckTemplate.modules?.find((m) => m.id === 'rank_default');
    const rankModuleIds = new Set(rankModule?.cardIds ?? []);
    const rankCardIds = new Set([...rankTrackIds, ...rankModuleIds]);
    return [...cardCatalog]
      .filter((card) => activeIds.has(card.id))
      .filter((card) => {
        if (galleryCategoryFilter === 'RANK') {
          return rankCardIds.has(card.id);
        }
        if (galleryCategoryFilter === 'ALL') {
          return true;
        }
        return card.category === galleryCategoryFilter && !rankCardIds.has(card.id);
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [cardCatalog, sharedDeckTemplate.deck, sharedDeckTemplate.legendaryDeck, sharedDeckTemplate.rankTrack, sharedDeckTemplate.modules, galleryCategoryFilter]);

  const cardImageById = useMemo<Record<string, string>>(
    () =>
      cardCatalog.reduce<Record<string, string>>((acc, card) => {
        const normalized = normalizeImagePath(card.image);
        if (normalized) acc[card.id] = normalized;
        return acc;
      }, {}),
    [cardCatalog],
  );

  return {
    galleryCards,
    cardImageById,
  };
};
