import type { ResourceKey } from '../../game/types';

export const BOARD_RESOURCE_ORDER: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

export const BOARD_RESOURCE_ICONS: Record<ResourceKey, string> = {
  time: '◔',
  reputation: '★',
  discipline: '⚖',
  documents: '▣',
  tech: '⌘',
};

export const BOARD_RESOURCE_IMAGE_PATHS: Record<ResourceKey, string> = {
  time: '/resource-icons/time.png',
  reputation: '/resource-icons/reputation.png',
  discipline: '/resource-icons/discipline.png',
  documents: '/resource-icons/documents.png',
  tech: '/resource-icons/tech.png',
};
