import type { CardDefinition } from '../../game/types';

export const SERVER_URL_STORAGE_KEY = 'joj-server-url-v1';
export const SHARED_TEMPLATE_STORAGE_KEY = 'joj-shared-deck-template-v1';
export const PLAYER_NAME_STORAGE_KEY = 'joj-player-name-v1';
export const SESSION_STORAGE_KEY = 'joj-network-session-v1';
export const ADMIN_TOKEN_STORAGE_KEY = 'joj-admin-token-v1';
export const RANKS_STORAGE_KEY = 'joj-shared-ranks-v1';

export const DEFAULT_SERVER_URL = `http://${window.location.hostname}:8000`;
export const GAME_NAME = 'joj-game';
export const normalizeServerUrl = (value: string) => value.trim().replace(/\/+$/, '');
export const getConfiguredServerUrl = () => {
  const saved = window.localStorage.getItem(SERVER_URL_STORAGE_KEY);
  return normalizeServerUrl(saved || DEFAULT_SERVER_URL) || DEFAULT_SERVER_URL;
};

export type LobbyPlayer = {
  id: number;
  name?: string;
};

export type LobbyMatch = {
  matchID: string;
  players: LobbyPlayer[];
};

export type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
  deckBackImage?: string;
};

export type Snapshot = {
  G: unknown;
  ctx: unknown;
  updatedAt: number;
};

export type Session = {
  matchID: string;
  playerID: string;
  credentials: string;
};

export type UserTab = 'games' | 'gallery' | 'rules';
export type GalleryCategoryFilter = CardDefinition['category'] | 'ALL';

export const galleryCategories: CardDefinition['category'][] = [
  'LYAP',
  'SCANDAL',
  'SUPPORT',
  'DECISION',
  'NEUTRAL',
  'VVNZ',
];

export const parseSession = (raw: string | null): Session | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.matchID === 'string' &&
      typeof parsed.playerID === 'string' &&
      typeof parsed.credentials === 'string'
    ) {
      return {
        matchID: parsed.matchID,
        playerID: parsed.playerID,
        credentials: parsed.credentials,
      };
    }
  } catch {
    // ignore
  }
  return null;
};

