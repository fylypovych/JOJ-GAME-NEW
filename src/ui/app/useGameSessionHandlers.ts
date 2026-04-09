import { useEffect } from 'react';
import type { AuthUser } from './useUserAccount';
import type { Session } from './model';

export interface UseGameSessionHandlersArgs {
  user: AuthUser | null;
  playerName: string;
  session: Session | null;
  matches: Array<{ matchID: string }>;
  adminSelectedMatchID: string;
  bindMatchSession: (args: {
    matchID: string;
    playerID: string;
    credentials: string;
    playerName: string;
  }) => Promise<unknown>;
  setAdminSelectedMatchID: (value: string) => void;
}

export type UseGameSessionHandlersResult = Record<string, never>;

export const useGameSessionHandlers = (args: UseGameSessionHandlersArgs): UseGameSessionHandlersResult => {
  const {
    user,
    playerName,
    session,
    matches,
    adminSelectedMatchID,
    bindMatchSession,
    setAdminSelectedMatchID,
  } = args;

  const resolvedUserPlayerName = user?.displayName?.trim() || user?.username?.trim() || '';

  // Bind match session when user changes
  useEffect(() => {
    if (!user || !session?.matchID || !session?.playerID || !session.credentials) return;
    if (resolvedUserPlayerName && playerName.trim() === resolvedUserPlayerName) return;
    void bindMatchSession({
      matchID: session.matchID,
      playerID: session.playerID,
      credentials: session.credentials,
      playerName: resolvedUserPlayerName || playerName,
    });
  }, [user, session?.matchID, session?.playerID, session?.credentials, resolvedUserPlayerName, playerName, bindMatchSession]);

  // Sync admin selected match with session
  useEffect(() => {
    if (session?.matchID) {
      setAdminSelectedMatchID(session.matchID);
      return;
    }
    if (adminSelectedMatchID && matches.some((m) => m.matchID === adminSelectedMatchID)) return;
    setAdminSelectedMatchID(matches[0]?.matchID ?? '');
  }, [adminSelectedMatchID, matches, session?.matchID, setAdminSelectedMatchID]);

  return {};
};
