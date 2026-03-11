import { useEffect, useMemo, useState } from 'react';
import { createBotPlayerName, getBotSeatIds } from '../../game/bot-engine/config';
import type { GameMode } from '../../game/types';
import type { BotDifficulty } from '../../game/types';
import type { LobbyMatch, Session } from './model';

type LobbyClientLike = {
  listMatches: (gameName: string) => Promise<{ matches: LobbyMatch[] }>;
  createMatch: (gameName: string, args: { numPlayers: number; setupData: unknown }) => Promise<{ matchID: string }>;
  joinMatch: (gameName: string, matchID: string, args: { playerID: string; playerName: string }) => Promise<{ playerID: string; playerCredentials: string }>;
  leaveMatch: (gameName: string, matchID: string, args: { playerID: string; credentials: string }) => Promise<void>;
};

export const useLobbySession = (args: {
  lobbyClient: LobbyClientLike;
  gameName: string;
  playerName: string;
  roomCapacity: number;
  gameMode: GameMode;
  selectedOptionalModuleIds: string[];
  fallbackPlayerName?: string;
  createWithBots: boolean;
  botDifficulty: BotDifficulty;
  sessionStorageKey: string;
  initialSession: Session | null;
  serverUnavailableText: string;
  enterNameText: string;
  roomFullText: string;
  createFailedText: string;
  joinFailedText: string;
  onSessionEstablished?: (session: Session, playerName: string) => Promise<void> | void;
  createOwnedSession?: (args: { numPlayers: number; setupData: unknown; playerName: string }) => Promise<Session>;
  joinOwnedSession?: (args: { matchID: string; playerID: string; playerName: string }) => Promise<Session>;
}) => {
  const {
    lobbyClient,
    gameName,
    playerName,
    roomCapacity,
    gameMode,
    selectedOptionalModuleIds,
    fallbackPlayerName,
    createWithBots,
    botDifficulty,
    sessionStorageKey,
    initialSession,
    serverUnavailableText,
    enterNameText,
    roomFullText,
    createFailedText,
    joinFailedText,
    onSessionEstablished,
    createOwnedSession,
    joinOwnedSession,
  } = args;
  const [matches, setMatches] = useState<LobbyMatch[]>([]);
  const [session, setSession] = useState<Session | null>(initialSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [matchesSynced, setMatchesSynced] = useState(false);

  const refreshMatches = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await lobbyClient.listMatches(gameName);
      setMatches(response.matches ?? []);
      setMatchesSynced(true);
    } catch {
      setError(serverUnavailableText);
    } finally {
      setLoading(false);
    }
  };

  const botSetup = createWithBots
    ? {
      count: Math.max(0, Math.min(5, roomCapacity - 1)),
      difficulty: botDifficulty,
    }
    : null;

  const autoJoinBots = async (matchID: string, totalPlayers: number) => {
    if (!botSetup || botSetup.count <= 0) return;
    const seatIds = getBotSeatIds(totalPlayers, botSetup.count);
    for (const [index, playerID] of seatIds.entries()) {
      await lobbyClient.joinMatch(gameName, matchID, {
        playerID,
        playerName: createBotPlayerName({ difficulty: botSetup.difficulty, seatIndex: index + 1 }),
      });
    }
  };

  const createRoom = async () => {
    const name = playerName.trim() || fallbackPlayerName?.trim() || '';
    if (!name) {
      setError(enterNameText);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const nextSession: Session = createOwnedSession
        ? await createOwnedSession({
          numPlayers: Math.max(2, Math.min(6, roomCapacity)),
          setupData: {
            gameMode,
            gameSetup: { optionalMainDeckModuleIds: selectedOptionalModuleIds },
            bots: botSetup,
          },
          playerName: name,
        })
        : await (async () => {
          const result = await lobbyClient.createMatch(gameName, {
            numPlayers: Math.max(2, Math.min(6, roomCapacity)),
            setupData: {
              gameMode,
              gameSetup: { optionalMainDeckModuleIds: selectedOptionalModuleIds },
              bots: botSetup,
            },
          });
          await autoJoinBots(result.matchID, Math.max(2, Math.min(6, roomCapacity)));
          const joined = await lobbyClient.joinMatch(gameName, result.matchID, {
            playerID: '0',
            playerName: name,
          });
          return {
            matchID: result.matchID,
            playerID: joined.playerID,
            credentials: joined.playerCredentials,
          };
        })();
      setSession(nextSession);
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession));
      await onSessionEstablished?.(nextSession, name);
      await refreshMatches();
    } catch {
      setError(createFailedText);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (match: LobbyMatch) => {
    const name = playerName.trim() || fallbackPlayerName?.trim() || '';
    if (!name) {
      setError(enterNameText);
      return;
    }
    const freePlayer = match.players.find((player) => !player.name);
    if (!freePlayer) {
      setError(roomFullText);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const nextSession: Session = joinOwnedSession
        ? await joinOwnedSession({
          matchID: match.matchID,
          playerID: String(freePlayer.id),
          playerName: name,
        })
        : await (async () => {
          const joined = await lobbyClient.joinMatch(gameName, match.matchID, {
            playerID: String(freePlayer.id),
            playerName: name,
          });
          return {
            matchID: match.matchID,
            playerID: joined.playerID,
            credentials: joined.playerCredentials,
          };
        })();
      setSession(nextSession);
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession));
      await onSessionEstablished?.(nextSession, name);
      await refreshMatches();
    } catch {
      setError(joinFailedText);
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      await lobbyClient.leaveMatch(gameName, session.matchID, {
        playerID: session.playerID,
        credentials: session.credentials,
      });
    } catch {
      // ignore, local cleanup still needed
    } finally {
      setSession(null);
      window.localStorage.removeItem(sessionStorageKey);
      await refreshMatches();
      setLoading(false);
    }
  };

  const activeMatch = useMemo(
    () => matches.find((match) => match.matchID === session?.matchID) ?? null,
    [matches, session?.matchID],
  );
  const sessionBroken = Boolean(session && matchesSynced && !activeMatch && !loading);
  const roomPlayerNames = useMemo<Record<string, string>>(() => {
    if (!activeMatch) return {};
    return activeMatch.players.reduce<Record<string, string>>((acc, player) => {
      const name = player.name?.trim();
      if (name) acc[String(player.id)] = name;
      return acc;
    }, {});
  }, [activeMatch]);
  const canStart = Boolean(activeMatch && activeMatch.players.every((player) => Boolean(player.name)));

  useEffect(() => {
    void refreshMatches();
    const id = window.setInterval(() => { void refreshMatches(); }, 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!sessionBroken) return;
    setSession(null);
    window.localStorage.removeItem(sessionStorageKey);
  }, [sessionBroken, sessionStorageKey]);

  return {
    matches,
    session,
    setSession,
    loading,
    error,
    setError,
    matchesSynced,
    refreshMatches,
    createRoom,
    joinRoom,
    leaveRoom,
    activeMatch,
    sessionBroken,
    roomPlayerNames,
    canStart,
  };
};
