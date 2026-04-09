import { useMemo } from 'react';
import type { CardDefinition } from '../../game/types';
import { formatModuleDisplayName } from '../moduleDisplay';

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
}

export interface UseGalleryDataResult {
  optionalLobbyModules: Array<{ id: string; name: string; alwaysOn: boolean }>;
  galleryCards: CardDefinition[];
  cardImageById: Record<string, string>;
}

export const useGalleryData = (args: UseGalleryDataArgs): UseGalleryDataResult => {
  const { cardCatalog, sharedDeckTemplate } = args;

  const optionalLobbyModules = useMemo(
    () => (sharedDeckTemplate.modules ?? [])
      .filter((module) => module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck')
      .map((module) => ({
        id: module.id,
        name: formatModuleDisplayName(module.name, module.id),
        alwaysOn: module.category === 'VVNZ',
      })),
    [sharedDeckTemplate.modules],
  );

  const galleryCards = useMemo(() => {
    const rankTrackIds = new Set(sharedDeckTemplate.rankTrack.map((card) => card.id));
    return [...cardCatalog]
      .filter((card) => !rankTrackIds.has(card.id))
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [cardCatalog, sharedDeckTemplate.rankTrack]);

  const cardImageById = useMemo<Record<string, string>>(
    () =>
      cardCatalog.reduce<Record<string, string>>((acc, card) => {
        if (typeof card.image === 'string' && card.image.trim()) acc[card.id] = card.image;
        return acc;
      }, {}),
    [cardCatalog],
  );

  return {
    optionalLobbyModules,
    galleryCards,
    cardImageById,
  };
};
