import { useMemo } from 'react';
import type { CardDefinition } from '../../game/types';
import type { GalleryCategoryFilter } from './model';

export interface UseGalleryDataArgs {
  cardCatalog: CardDefinition[];
  sharedDeckTemplate: {
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
    const rankTrackIds = new Set(sharedDeckTemplate.rankTrack.map((card) => card.id));
    const rankModule = sharedDeckTemplate.modules?.find((m) => m.id === 'rank_default');
    const rankModuleIds = new Set(rankModule?.cardIds ?? []);
    return [...cardCatalog]
      .filter((card) => {
        if (galleryCategoryFilter === 'RANK') {
          // If rankTrack and rank_default are empty, show all RANK category cards
          if (rankTrackIds.size === 0 && rankModuleIds.size === 0) {
            return card.category === 'RANK';
          }
          return rankTrackIds.has(card.id) || rankModuleIds.has(card.id);
        }
        if (galleryCategoryFilter === 'ALL') {
          return true;
        }
        return card.category === galleryCategoryFilter && !rankTrackIds.has(card.id);
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [cardCatalog, sharedDeckTemplate.rankTrack, sharedDeckTemplate.modules, galleryCategoryFilter]);

  const cardImageById = useMemo<Record<string, string>>(
    () =>
      cardCatalog.reduce<Record<string, string>>((acc, card) => {
        if (typeof card.image === 'string' && card.image.trim()) acc[card.id] = card.image;
        return acc;
      }, {}),
    [cardCatalog],
  );

  return {
    galleryCards,
    cardImageById,
  };
};
