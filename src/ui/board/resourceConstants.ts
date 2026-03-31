import type { ResourceKey } from '../../game/types';

export const BOARD_RESOURCE_ORDER: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

export const BOARD_RESOURCE_ICONS: Record<ResourceKey, string> = {
  time: '◔',
  reputation: '★',
  discipline: '⚖',
  documents: '▣',
  tech: '⌘',
};
