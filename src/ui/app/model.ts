import type { BotDifficulty, BotProfile, CardDefinition, GameMode } from '../../game/types';
import type { DeckModuleDefinition, SharedGameSetup } from '../../game/jojGame';

export const SERVER_URL_STORAGE_KEY = 'joj-server-url-v1';
export const SHARED_TEMPLATE_STORAGE_KEY = 'joj-shared-deck-template-v1';
export const PLAYER_NAME_STORAGE_KEY = 'joj-player-name-v1';
export const SESSION_STORAGE_KEY = 'joj-network-session-v1';
export const RANKS_STORAGE_KEY = 'joj-shared-ranks-v1';

const isLocalHostName = (hostname: string) => ['localhost', '127.0.0.1', '::1'].includes(hostname);
const isBrowserLocalAddress = () => isLocalHostName(window.location.hostname);
const isLikelyLocalServerUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return isLocalHostName(parsed.hostname);
  } catch {
    return /localhost|127\.0\.0\.1/.test(value);
  }
};

export const DEFAULT_SERVER_URL = window.location.protocol === 'https:'
  ? window.location.origin
  : `http://${window.location.hostname}:8000`;
export const GAME_NAME = 'joj-game';
export const normalizeServerUrl = (value: string) => value.trim().replace(/\/+$/, '');
export const getConfiguredServerUrl = () => {
  const saved = normalizeServerUrl(window.localStorage.getItem(SERVER_URL_STORAGE_KEY) ?? '');
  if (!saved) return DEFAULT_SERVER_URL;

  if (isBrowserLocalAddress()) {
    try {
      const parsedSaved = new URL(saved);
      const parsedDefault = new URL(DEFAULT_SERVER_URL);
      const sameLocalTarget =
        isLocalHostName(parsedSaved.hostname) &&
        parsedSaved.protocol === parsedDefault.protocol &&
        parsedSaved.port === parsedDefault.port;
      if (!sameLocalTarget) {
        window.localStorage.setItem(SERVER_URL_STORAGE_KEY, DEFAULT_SERVER_URL);
        return DEFAULT_SERVER_URL;
      }
    } catch {
      window.localStorage.setItem(SERVER_URL_STORAGE_KEY, DEFAULT_SERVER_URL);
      return DEFAULT_SERVER_URL;
    }
  }

  // Migrate legacy local dev URLs when the app is opened from a public HTTPS domain.
  if (window.location.protocol === 'https:' && !isBrowserLocalAddress()) {
    if (isLikelyLocalServerUrl(saved) || saved.startsWith('http://')) {
      return DEFAULT_SERVER_URL;
    }
  }

  return saved || DEFAULT_SERVER_URL;
};

export type LobbyPlayer = {
  id: number;
  name?: string;
};

export type LobbyMatch = {
  matchID: string;
  createdAt?: number | string;
  players: LobbyPlayer[];
  setupData?: {
    gameMode?: GameMode;
    gameSetup?: Partial<SharedGameSetup>;
    bots?: {
      count?: number;
      difficulty?: BotDifficulty;
      profile?: BotProfile;
    } | null;
  };
};

export type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
  deckBackImage?: string;
  modules: DeckModuleDefinition[];
  gameSetup: SharedGameSetup;
};

export type Snapshot = {
  G: unknown;
  ctx: unknown;
  updatedAt: number;
};

export type Session = {
  matchID: string;
  playerID?: string;
  credentials?: string;
  spectator?: boolean;
};

export type UserTab = 'games' | 'gallery' | 'rules' | 'profile' | 'statistics';
export type GalleryCategoryFilter = CardDefinition['category'] | 'RANK' | 'ALL';

export const galleryCategories: GalleryCategoryFilter[] = [
  'LYAP',
  'SCANDAL',
  'SUPPORT',
  'COMMAND',
  'VVNZ',
  'LEGENDARY',
  'RANK',
];

export const parseSession = (raw: string | null): Session | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.matchID === 'string'
    ) {
      return {
        matchID: parsed.matchID,
        playerID: typeof parsed.playerID === 'string' ? parsed.playerID : undefined,
        credentials: typeof parsed.credentials === 'string' ? parsed.credentials : undefined,
        spectator: parsed.spectator === true,
      };
    }
  } catch {
    // ignore
  }
  return null;
};
