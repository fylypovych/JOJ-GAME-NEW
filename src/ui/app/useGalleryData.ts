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
    return [...cardCatalog]
      .filter((card) => galleryCategoryFilter === 'RANK' || !rankTrackIds.has(card.id))
      .filter((card) => galleryCategoryFilter === 'ALL' || card.category === galleryCategoryFilter)
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [cardCatalog, sharedDeckTemplate.rankTrack, galleryCategoryFilter]);

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
