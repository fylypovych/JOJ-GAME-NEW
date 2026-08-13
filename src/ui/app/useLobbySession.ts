import { useEffect, useMemo, useRef, useState } from 'react';
import { createBotPlayerName, getBotSeatIds } from '../../game/bot-engine/config';
import { clampBotCountToAllowed, clampRoomCapacityToAllowed } from '../../game/lobbyConfig';
import type { BotDifficulty, BotProfile, GameMode } from '../../game/types';
import type { LobbyMatch, Session } from './model';
import { findFirstAvailableLobbySeat } from './lobbyJoin';

type LobbyClientLike = {
  listMatches: (gameName: string) => Promise<{ matches: LobbyMatch[] }>;
  createMatch: (gameName: string, args: { numPlayers: number; setupData: unknown }) => Promise<{ matchID: string }>;
  joinMatch: (gameName: string, matchID: string, args: { playerID: string; playerName: string }) => Promise<{ playerID: string; playerCredentials: string }>;
  leaveMatch: (gameName: string, matchID: string, args: { playerID: string; credentials: string }) => Promise<void>;
  serverUrl?: string;
};

export const useLobbySession = (args: {
  lobbyClient: LobbyClientLike;
  gameName: string;
  playerName: string;
  roomCapacity: number;
  allowedRoomCapacities: number[];
  gameMode: GameMode;
  selectedOptionalModuleIds: string[];
  fallbackPlayerName?: string;
  createWithBots: boolean;
  botCount: number;
  allowedBotCounts: number[];
  botDifficulty: BotDifficulty;
  botProfile: BotProfile;
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
  leaveOwnedSession?: (args: { matchID: string; playerID: string; credentials: string }) => Promise<void>;
}) => {
  const {
    lobbyClient,
    gameName,
    playerName,
    roomCapacity,
    allowedRoomCapacities,
    gameMode,
    selectedOptionalModuleIds,
    fallbackPlayerName,
    createWithBots,
    botCount,
    allowedBotCounts,
    botDifficulty,
    botProfile,
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
    leaveOwnedSession,
  } = args;
  const [matches, setMatches] = useState<LobbyMatch[]>([]);
  const [session, setSession] = useState<Session | null>(initialSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [matchesSynced, setMatchesSynced] = useState(false);
  const joinInFlightRef = useRef(false);
  const resolveLobbyPlayerName = () => {
    const profileName = fallbackPlayerName?.trim() || '';
    const localName = playerName.trim();
    if (createOwnedSession || joinOwnedSession) return profileName || localName;
    return localName || profileName;
  };

  const refreshMatches = async () => {
    setLoading(true);
    setError('');
    try {
      // Use custom endpoint from DB instead of boardgame.io
      if (lobbyClient.serverUrl) {
        const response = await fetch(`${lobbyClient.serverUrl}/api/lobby/matches`);
        if (!response.ok) throw new Error('Failed to fetch matches');
        const payload = await response.json() as {
          matches?: Array<{
            matchID: string;
            metadata: Record<string, unknown>;
            players?: Array<{ id: number; name?: string }>;
            setupData?: LobbyMatch['setupData'];
            gameover?: boolean;
          }>;
        };
        // Convert to LobbyMatch format
        const lobbyMatches: LobbyMatch[] = (payload.matches ?? []).map((m) => ({
          matchID: m.matchID,
          createdAt: typeof m.metadata?.updatedAt === 'number' || typeof m.metadata?.updatedAt === 'string'
            ? m.metadata.updatedAt
            : undefined,
          players: Array.isArray(m.players) ? m.players : [],
          setupData: m.setupData,
          gameover: m.gameover === true,
        }));
        setMatches(lobbyMatches);
      } else {
        // Fallback to boardgame.io
        const response = await lobbyClient.listMatches(gameName);
        setMatches(response.matches ?? []);
      }
      setMatchesSynced(true);
    } catch {
      setError(serverUnavailableText);
    } finally {
      setLoading(false);
    }
  };

  const effectiveRoomCapacity = clampRoomCapacityToAllowed(roomCapacity, allowedRoomCapacities);
  const requestedBotCount = createWithBots
    ? clampBotCountToAllowed(botCount, allowedBotCounts, effectiveRoomCapacity)
    : 0;
  const botSetup = requestedBotCount > 0
    ? {
      count: requestedBotCount,
      difficulty: botDifficulty,
      profile: botProfile,
    }
    : null;

  const autoJoinBots = async (matchID: string, totalPlayers: number) => {
    if (!botSetup || botSetup.count <= 0) return;
    const seatIds = getBotSeatIds(totalPlayers, botSetup.count);
    for (const [index, playerID] of seatIds.entries()) {
      await lobbyClient.joinMatch(gameName, matchID, {
        playerID,
        playerName: createBotPlayerName({ difficulty: botSetup.difficulty, profile: botSetup.profile, seatIndex: index + 1 }),
      });
    }
  };

  const createRoom = async () => {
    const name = resolveLobbyPlayerName();
    if (!name) {
      setError(enterNameText);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const nextSession: Session = createOwnedSession
        ? await createOwnedSession({
          numPlayers: Math.max(2, Math.min(6, effectiveRoomCapacity)),
          setupData: {
            gameMode,
            gameSetup: { optionalMainDeckModuleIds: selectedOptionalModuleIds },
            bots: botSetup,
          },
          playerName: name,
        })
        : await (async () => {
          const result = await lobbyClient.createMatch(gameName, {
            numPlayers: Math.max(2, Math.min(6, effectiveRoomCapacity)),
            setupData: {
              gameMode,
              gameSetup: { optionalMainDeckModuleIds: selectedOptionalModuleIds },
              bots: botSetup,
            },
          });
          const joined = await lobbyClient.joinMatch(gameName, result.matchID, {
            playerID: '0',
            playerName: name,
          });
          await autoJoinBots(result.matchID, Math.max(2, Math.min(6, effectiveRoomCapacity)));
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
    } catch (nextError) {
      const message = String(nextError instanceof Error ? nextError.message : nextError).trim();
      setError(message || createFailedText);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (match: LobbyMatch) => {
    if (joinInFlightRef.current) return;
    const name = resolveLobbyPlayerName();
    if (!name) {
      setError(enterNameText);
      return;
    }
    const freePlayer = findFirstAvailableLobbySeat(match.players);
    if (!freePlayer) {
      setError(roomFullText);
      return;
    }
    joinInFlightRef.current = true;
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
    } catch (nextError) {
      const message = String(nextError instanceof Error ? nextError.message : nextError).trim();
      setError(message || joinFailedText);
    } finally {
      joinInFlightRef.current = false;
      setLoading(false);
    }
  };

  const spectateRoom = async (match: LobbyMatch) => {
    setLoading(true);
    setError('');
    try {
      const nextSession: Session = {
        matchID: match.matchID,
        spectator: true,
      };
      setSession(nextSession);
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession));
      await refreshMatches();
    } catch (nextError) {
      const message = String(nextError instanceof Error ? nextError.message : nextError).trim();
      setError(message || joinFailedText);
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      if (session.playerID && session.credentials) {
        const leaveArgs = {
          matchID: session.matchID,
          playerID: session.playerID,
          credentials: session.credentials,
        };
        if (leaveOwnedSession) await leaveOwnedSession(leaveArgs);
        else await lobbyClient.leaveMatch(gameName, leaveArgs.matchID, leaveArgs);
      }
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
  const canStart = Boolean(
    (activeMatch && activeMatch.players.every((player) => Boolean(player.name)))
    || (session?.spectator && activeMatch),
  );

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
    spectateRoom,
    leaveRoom,
    activeMatch,
    sessionBroken,
    roomPlayerNames,
    canStart,
  };
};
