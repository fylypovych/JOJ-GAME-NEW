import { useMemo, useEffect, useState, useCallback } from 'react';
import type { GameMode, RoomCapacity } from '../model';
import type { AuthUser } from '../app/useUserAccount';
import { useLobbySession, type MatchDescription, type LobbySession } from '../app/lobbySession';
import { clampRoomCapacityToAllowed, getAvailableBotCounts } from '../app/gameModeUtils';
import { SERVER_URL } from '../app/clientConfig';
import { DEFAULT_LOBBY_GAME_UI_CONFIG, type LobbyGameUiConfig } from '../app/lobbyConfig';
import { text } from '../i18n';

interface UseLobbyProviderArgs {
  playerName: string;
  user: AuthUser | null;
  lang: 'en' | 'uk';
  gameMode: GameMode;
  roomCapacity: number;
  setRoomCapacity: (capacity: number) => void;
  createWithBots: boolean;
  botCount: number;
  botDifficulty: number;
  botProfile: 'random' | 'aggressive' | 'defensive';
  selectedOptionalModuleIds: string[];
  bindMatchSession: (params: {
    matchID: string;
    playerID: string;
    credentials: string;
  }) => Promise<unknown>;
}

interface UseLobbyProviderResult {
  session: LobbySession | null;
  matches: MatchDescription[];
  loading: boolean;
  error: string;
  setError: (error: string) => void;
  createRoom: (params: {
    capacity: RoomCapacity;
    gameMode: GameMode;
    withBots: boolean;
    botCount: number;
    botDifficulty: number;
    botProfile: 'random' | 'aggressive' | 'defensive';
    moduleIds: string[];
  }) => Promise<boolean>;
  joinRoom: (matchID: string) => Promise<boolean>;
  spectateRoom: (matchID: string) => Promise<boolean>;
  leaveRoom: () => void;
  refreshMatches: () => Promise<boolean>;
  roomPlayerNames: string[];
  canStart: boolean;
  lobbyGameUiConfig: LobbyGameUiConfig;
}

export const useLobbyProvider = (args: UseLobbyProviderArgs): UseLobbyProviderResult => {
  const {
    playerName,
    user,
    lang,
    gameMode,
    roomCapacity,
    setRoomCapacity,
    createWithBots,
    botCount,
    botDifficulty,
    botProfile,
    selectedOptionalModuleIds,
    bindMatchSession,
  } = args;

  const t = text(lang);

  // Lobby session hook
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
    serverUrl: SERVER_URL,
    playerName,
    user,
    gameMode,
    roomCapacity,
    createWithBots,
    botCount,
    botDifficulty,
    botProfile,
    moduleIds: selectedOptionalModuleIds,
    t: {
      serverUnavailable: t.serverUnavailable,
      enterName: t.enterName,
      roomFull: t.roomFull,
      createFailed: t.createFailed,
      joinFailed: t.joinFailed,
    },
    onSessionEstablished: (nextSession, nextPlayerName) => {
      if (!nextSession.playerID || !nextSession.credentials) return;
      void bindMatchSession({
        matchID: nextSession.matchID,
        playerID: nextSession.playerID,
        credentials: nextSession.credentials,
      });
    },
  });

  // Lobby UI config
  const [lobbyGameUiConfig, setLobbyGameUiConfig] = useState<LobbyGameUiConfig>(DEFAULT_LOBBY_GAME_UI_CONFIG);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${SERVER_URL}/api/game/ui-config`, { credentials: 'include' });
        const payload = await response.json() as { ok?: boolean };
        if (!response.ok || payload.ok !== true) return;
        if (!cancelled) {
          const normalized = normalizeLobbyGameUiConfig(payload);
          setLobbyGameUiConfig(normalized);
        }
      } catch {
        // keep defaults
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Sync room capacity with allowed values
  useEffect(() => {
    const nextRoomCapacity = clampRoomCapacityToAllowed(roomCapacity, lobbyGameUiConfig.allowedRoomCapacities);
    if (roomCapacity !== nextRoomCapacity) {
      setRoomCapacity(nextRoomCapacity);
      return;
    }
  }, [roomCapacity, lobbyGameUiConfig.allowedRoomCapacities, setRoomCapacity]);

  return {
    session,
    matches,
    loading,
    error,
    setError,
    createRoom,
    joinRoom,
    spectateRoom,
    leaveRoom,
    refreshMatches,
    roomPlayerNames,
    canStart,
    lobbyGameUiConfig,
  };
};

function normalizeLobbyGameUiConfig(payload: unknown): LobbyGameUiConfig {
  const p = payload as Record<string, unknown>;
  return {
    defaultRoomCapacity: (typeof p.defaultRoomCapacity === 'number' ? p.defaultRoomCapacity : DEFAULT_LOBBY_GAME_UI_CONFIG.defaultRoomCapacity) as 4 | 5 | 6,
    allowedRoomCapacities: Array.isArray(p.allowedRoomCapacities) ? p.allowedRoomCapacities as (4 | 5 | 6)[] : DEFAULT_LOBBY_GAME_UI_CONFIG.allowedRoomCapacities,
    allowedBotCounts: Array.isArray(p.allowedBotCounts) ? p.allowedBotCounts as number[] : DEFAULT_LOBBY_GAME_UI_CONFIG.allowedBotCounts,
  };
}

export type { UseLobbyProviderResult };
