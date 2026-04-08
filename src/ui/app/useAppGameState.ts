import { useEffect, useMemo, useState } from 'react';
import { LobbyClient } from 'boardgame.io/client';
import type { BotDifficulty, BotProfile, CardDefinition, RankDefinition } from '../../game/types';
import type { AuthUser } from './useUserAccount';
import {
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  getCardCatalog,
  getSharedRanks,
  getSharedDeckTemplate,
  getSharedDeckTemplateStats,
  importSharedRanksJson,
  importSharedDeckTemplateJson,
  setSharedRanks,
} from '../../game/jojGame';
import { formatModuleDisplayName } from '../moduleDisplay';
import {
  DEFAULT_LOBBY_GAME_UI_CONFIG,
  normalizeLobbyGameUiConfig,
} from '../../game/lobbyConfig';
import { GAME_NAME, RANKS_STORAGE_KEY, SESSION_STORAGE_KEY, SHARED_TEMPLATE_STORAGE_KEY } from './model';
import { useLobbySession } from './useLobbySession';
import { useSharedConfigSync } from './useSharedConfigSync';
import type { Language } from '../i18n';

const TEMPLATE_API = (serverUrl: string) => `${serverUrl}/api/shared-deck-template`;
const RANKS_API = (serverUrl: string) => `${serverUrl}/api/shared-ranks`;

export interface UseAppGameStateArgs {
  serverUrl: string;
  playerName: string;
  user: AuthUser | null;
  lang: Language;
  gameMode: 'standard' | 'standard_plus' | 'simplified';
  roomCapacity: number;
  createWithBots: boolean;
  botCount: number;
  botDifficulty: BotDifficulty;
  botProfile: BotProfile;
  selectedOptionalModuleIds: string[];
  t: {
    serverUnavailable: string;
    enterName: string;
    roomFull: string;
    createFailed: string;
    joinFailed: string;
  };
  bindMatchSession: (args: {
    matchID: string;
    playerID: string;
    credentials: string;
    playerName: string;
  }) => Promise<unknown>;
}

export interface UseAppGameStateResult {
  // Lobby
  matches: ReturnType<typeof useLobbySession>['matches'];
  session: ReturnType<typeof useLobbySession>['session'];
  setSession: ReturnType<typeof useLobbySession>['setSession'];
  loading: ReturnType<typeof useLobbySession>['loading'];
  error: ReturnType<typeof useLobbySession>['error'];
  setError: ReturnType<typeof useLobbySession>['setError'];
  refreshMatches: ReturnType<typeof useLobbySession>['refreshMatches'];
  createRoom: ReturnType<typeof useLobbySession>['createRoom'];
  joinRoom: ReturnType<typeof useLobbySession>['joinRoom'];
  spectateRoom: ReturnType<typeof useLobbySession>['spectateRoom'];
  leaveRoom: ReturnType<typeof useLobbySession>['leaveRoom'];
  roomPlayerNames: ReturnType<typeof useLobbySession>['roomPlayerNames'];
  canStart: ReturnType<typeof useLobbySession>['canStart'];
  lobbyGameUiConfig: typeof DEFAULT_LOBBY_GAME_UI_CONFIG;
  
  // Shared Config
  sharedDeckTemplate: ReturnType<typeof useSharedConfigSync>['sharedDeckTemplate'];
  cardCatalog: ReturnType<typeof useSharedConfigSync>['cardCatalog'];
  sharedRanks: ReturnType<typeof useSharedConfigSync>['sharedRanks'];
  setSharedRanksState: ReturnType<typeof useSharedConfigSync>['setSharedRanksState'];
  sharedConfigLoaded: ReturnType<typeof useSharedConfigSync>['sharedConfigLoaded'];
  refreshSharedDeckTemplate: ReturnType<typeof useSharedConfigSync>['refreshSharedDeckTemplate'];
  syncRanksToServer: ReturnType<typeof useSharedConfigSync>['syncRanksToServer'];
  
  // Derived
  sharedDeckStats: ReturnType<typeof getSharedDeckTemplateStats>;
  optionalLobbyModules: Array<{ id: string; name: string; alwaysOn: boolean }>;
  galleryCards: CardDefinition[];
  cardImageById: Record<string, string>;
  
  // Helpers
  rollbackTemplate: (json: string) => void;
  applyTemplateChange: (mutate: () => void, previousJson?: string) => Promise<boolean>;
  rollbackRanks: (previousRanks: RankDefinition[]) => void;
}

export const useAppGameState = (args: UseAppGameStateArgs): UseAppGameStateResult => {
  const {
    serverUrl,
    playerName,
    user,
    gameMode,
    roomCapacity,
    createWithBots,
    botCount,
    botDifficulty,
    botProfile,
    selectedOptionalModuleIds,
    t,
    bindMatchSession,
  } = args;

  const lobbyClient = useMemo(() => new LobbyClient({ server: serverUrl }), [serverUrl]);
  const [lobbyGameUiConfig, setLobbyGameUiConfig] = useState(DEFAULT_LOBBY_GAME_UI_CONFIG);

  const {
    matches,
    session,
    setSession,
    loading,
    error,
    setError,
    refreshMatches,
    createRoom,
    joinRoom,
    spectateRoom,
    leaveRoom,
    roomPlayerNames,
    canStart,
  } = useLobbySession({
    lobbyClient,
    gameName: GAME_NAME,
    playerName,
    fallbackPlayerName: user?.displayName?.trim() || user?.username?.trim() || '',
    roomCapacity,
    allowedRoomCapacities: lobbyGameUiConfig.allowedRoomCapacities,
    gameMode,
    selectedOptionalModuleIds,
    createWithBots,
    botCount,
    allowedBotCounts: lobbyGameUiConfig.allowedBotCounts,
    botDifficulty,
    botProfile,
    sessionStorageKey: SESSION_STORAGE_KEY,
    initialSession: null, // Will be loaded by useLobbySession
    serverUnavailableText: t.serverUnavailable,
    enterNameText: t.enterName,
    roomFullText: t.roomFull,
    createFailedText: t.createFailed,
    joinFailedText: t.joinFailed,
    onSessionEstablished: (nextSession, nextPlayerName) => {
      if (!nextSession.playerID || !nextSession.credentials) return;
      void bindMatchSession({
        matchID: nextSession.matchID,
        playerID: nextSession.playerID,
        credentials: nextSession.credentials,
        playerName: nextPlayerName,
      });
    },
  });

  // Admin fetch placeholder - will be replaced during migration
  const adminFetch = useMemo(() => {
    return async (input: string | URL | Request, init?: RequestInit) => {
      return fetch(input, init);
    };
  }, []);

  const {
    sharedDeckTemplate,
    cardCatalog,
    sharedRanks,
    setSharedRanksState,
    sharedConfigLoaded,
    refreshSharedDeckTemplate,
    syncRanksToServer,
  } = useSharedConfigSync({
    adminFetch,
    templateApi: TEMPLATE_API(serverUrl),
    ranksApi: RANKS_API(serverUrl),
    sharedTemplateStorageKey: SHARED_TEMPLATE_STORAGE_KEY,
    ranksStorageKey: RANKS_STORAGE_KEY,
    getSharedDeckTemplate,
    getCardCatalog,
    getSharedRanks,
    exportSharedDeckTemplateJson,
    exportSharedRanksJson,
    importSharedDeckTemplateJson,
    importSharedRanksJson,
    setSharedRanks,
  });

  // Load lobby config from server
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${serverUrl}/api/game/ui-config`, { credentials: 'include' });
        const payload = await response.json() as { ok?: boolean };
        if (!response.ok || payload.ok !== true) return;
        if (!cancelled) {
          const normalizedConfig = normalizeLobbyGameUiConfig(payload);
          setLobbyGameUiConfig(normalizedConfig);
        }
      } catch {
        // keep defaults
      }
    })();
    return () => { cancelled = true; };
  }, [serverUrl]);

  const sharedDeckStats = useMemo(() => getSharedDeckTemplateStats(), []);

  const rollbackTemplate = (json: string) => {
    const result = importSharedDeckTemplateJson(json);
    if (result.ok) void refreshSharedDeckTemplate(false);
  };

  const applyTemplateChange = async (mutate: () => void, previousJson = exportSharedDeckTemplateJson()) => {
    mutate();
    const ok = await refreshSharedDeckTemplate();
    if (!ok) rollbackTemplate(previousJson);
    return ok;
  };

  const rollbackRanks = (previousRanks: RankDefinition[]) => {
    if (!setSharedRanks(previousRanks)) return;
    setSharedRanksState(getSharedRanks());
    window.localStorage.setItem(RANKS_STORAGE_KEY, exportSharedRanksJson());
  };

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
    matches,
    session,
    setSession,
    loading,
    error,
    setError,
    refreshMatches,
    createRoom,
    joinRoom,
    spectateRoom,
    leaveRoom,
    roomPlayerNames,
    canStart,
    lobbyGameUiConfig,
    sharedDeckTemplate,
    cardCatalog,
    sharedRanks,
    setSharedRanksState,
    sharedConfigLoaded,
    refreshSharedDeckTemplate,
    syncRanksToServer,
    sharedDeckStats,
    optionalLobbyModules,
    galleryCards,
    cardImageById,
    rollbackTemplate,
    applyTemplateChange,
    rollbackRanks,
  };
};
