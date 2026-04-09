import { useEffect, useMemo, useState } from 'react';
import type { BotDifficulty, BotProfile } from '../../game/types';
import type { AuthUser } from './useUserAccount';
import type { Language } from '../i18n';
import {
  DEFAULT_LOBBY_GAME_UI_CONFIG,
  normalizeLobbyGameUiConfig,
} from '../../game/lobbyConfig';
import { useLobbySession } from './useLobbySession';
import { buildRoomShareLink } from './share';

export interface UseLobbyDataArgs {
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
  adminSelectedMatchID: string;
  t: {
    serverUnavailable: string;
    enterName: string;
    roomFull: string;
    createFailed: string;
    joinFailed: string;
    gameModeStandardPlus: string;
    gameModeSimplified: string;
    gameModeStandard: string;
    activeRoom: string;
    gameModeLabel: string;
    roomSummaryPlayers: string;
  };
  bindMatchSession: (args: {
    matchID: string;
    playerID: string;
    credentials: string;
    playerName: string;
  }) => Promise<unknown>;
}

export interface UseLobbyDataResult {
  // Lobby session
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
  
  // Lobby config
  lobbyGameUiConfig: typeof DEFAULT_LOBBY_GAME_UI_CONFIG;
  
  // Session-related computed values
  adminMatchID: string;
  activeSessionMatch: ReturnType<typeof useLobbySession>['matches'][number] | null;
  activeSessionShareLink: string;
  activeSessionGameModeLabel: string;
  activeSessionInviteText: string;
}

export const useLobbyData = (args: UseLobbyDataArgs): UseLobbyDataResult => {
  const {
    serverUrl,
    playerName,
    user,
    lang,
    gameMode,
    roomCapacity,
    createWithBots,
    botCount,
    botDifficulty,
    botProfile,
    selectedOptionalModuleIds,
    adminSelectedMatchID,
    t,
    bindMatchSession,
  } = args;

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
    serverUrl,
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
    onSessionEstablished: (nextSession) => {
      if (!nextSession.playerID || !nextSession.credentials) return;
      void bindMatchSession({
        matchID: nextSession.matchID,
        playerID: nextSession.playerID,
        credentials: nextSession.credentials,
      });
    },
  });

  // Lobby UI config
  const [lobbyGameUiConfig, setLobbyGameUiConfig] = useState(DEFAULT_LOBBY_GAME_UI_CONFIG);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${serverUrl}/api/game/ui-config`, { credentials: 'include' });
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
  }, [serverUrl]);

  // Computed values
  const adminMatchID = useMemo(() => {
    if (session?.matchID) return session.matchID;
    if (adminSelectedMatchID && matches.some((m) => m.matchID === adminSelectedMatchID)) return adminSelectedMatchID;
    return matches[0]?.matchID ?? '';
  }, [adminSelectedMatchID, matches, session?.matchID]);

  const activeSessionMatch = useMemo(() =>
    session ? matches.find((match) => match.matchID === session.matchID) ?? null : null,
  [session, matches]);

  const activeSessionShareLink = useMemo(() =>
    session ? buildRoomShareLink(session.matchID) : '',
  [session]);

  const activeSessionGameModeLabel = useMemo(() => {
    if (activeSessionMatch?.setupData?.gameMode === 'standard_plus') return t.gameModeStandardPlus;
    if (activeSessionMatch?.setupData?.gameMode === 'simplified') return t.gameModeSimplified;
    return t.gameModeStandard;
  }, [activeSessionMatch, t.gameModeStandardPlus, t.gameModeSimplified, t.gameModeStandard]);

  const activeSessionInviteText = useMemo(() => {
    if (!session) return '';
    const playerCount = activeSessionMatch
      ? `${activeSessionMatch.players.filter((p) => Boolean(p.name?.trim())).length}/${activeSessionMatch.players.length}`
      : '-';
    return `${t.activeRoom}: ${session.matchID}\n${t.gameModeLabel}: ${activeSessionGameModeLabel}\n${t.roomSummaryPlayers}: ${playerCount}\n${activeSessionShareLink}`;
  }, [session, activeSessionMatch, activeSessionGameModeLabel, activeSessionShareLink, t]);

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
    adminMatchID,
    activeSessionMatch,
    activeSessionShareLink,
    activeSessionGameModeLabel,
    activeSessionInviteText,
  };
};
