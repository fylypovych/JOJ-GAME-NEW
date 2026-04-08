import { useCallback } from 'react';
import type { Snapshot } from './model';

export interface UseAdminMatchControlsArgs {
  adminMatchID: string;
  adminFetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  setSnapshot: (value: Snapshot | null) => void;
  setAdminSelectedMatchID: (value: string) => void;
  refreshMatches: () => Promise<void>;
  setDeletingAdminMatch?: (value: boolean) => void;
  ADMIN_RESTART_API: string;
  ADMIN_MATCH_STATE_API: string;
  ADMIN_MATCH_STOP_API: string;
  ADMIN_MATCH_RESET_API: string;
  ADMIN_MATCH_DELETE_API: string;
}

export interface UseAdminMatchControlsResult {
  onRestartServer: () => Promise<boolean>;
  onResetGame: () => Promise<void>;
  onDeleteMatch: () => Promise<void>;
  onStopGame: (matchID: string) => Promise<void>;
  onGetMatchState: () => Promise<Snapshot | null>;
}

export const useAdminMatchControls = (args: UseAdminMatchControlsArgs): UseAdminMatchControlsResult => {
  const {
    adminMatchID,
    adminFetch,
    setSnapshot,
    setAdminSelectedMatchID,
    refreshMatches,
    setDeletingAdminMatch,
    ADMIN_RESTART_API,
    ADMIN_MATCH_STATE_API,
    ADMIN_MATCH_STOP_API,
    ADMIN_MATCH_RESET_API,
    ADMIN_MATCH_DELETE_API,
  } = args;

  const onRestartServer = useCallback(async (): Promise<boolean> => {
    try {
      const response = await adminFetch(ADMIN_RESTART_API, { method: 'POST' });
      return response.ok;
    } catch {
      return false;
    }
  }, [adminFetch, ADMIN_RESTART_API]);

  const onGetMatchState = useCallback(async (): Promise<Snapshot | null> => {
    if (!adminMatchID) return null;
    try {
      const response = await adminFetch(
        `${ADMIN_MATCH_STATE_API}?matchID=${encodeURIComponent(adminMatchID)}`,
        { method: 'GET' }
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as { snapshot?: Snapshot };
      return payload.snapshot ?? null;
    } catch {
      return null;
    }
  }, [adminMatchID, adminFetch, ADMIN_MATCH_STATE_API]);

  const onResetGame = useCallback(async () => {
    if (!adminMatchID) return;
    try {
      const response = await adminFetch(
        `${ADMIN_MATCH_RESET_API}?matchID=${encodeURIComponent(adminMatchID)}`,
        { method: 'POST' }
      );
      if (!response.ok) return;
      const payload = (await response.json()) as { snapshot?: Snapshot };
      if (payload.snapshot) setSnapshot(payload.snapshot);
    } catch {
      // ignore UI toast for now
    }
  }, [adminMatchID, adminFetch, setSnapshot, ADMIN_MATCH_RESET_API]);

  const onDeleteMatch = useCallback(async () => {
    if (!adminMatchID) return;
    if (setDeletingAdminMatch) setDeletingAdminMatch(true);
    try {
      const response = await adminFetch(
        `${ADMIN_MATCH_DELETE_API}?matchID=${encodeURIComponent(adminMatchID)}`,
        { method: 'POST' }
      );
      if (!response.ok) return;
      setSnapshot(null);
      setAdminSelectedMatchID('');
      await refreshMatches();
    } catch {
      // ignore UI toast for now
    } finally {
      if (setDeletingAdminMatch) setDeletingAdminMatch(false);
    }
  }, [adminMatchID, adminFetch, setSnapshot, setAdminSelectedMatchID, refreshMatches, setDeletingAdminMatch, ADMIN_MATCH_DELETE_API]);

  const onStopGame = useCallback(async (matchID: string) => {
    try {
      const response = await adminFetch(
        `${ADMIN_MATCH_STOP_API}?matchID=${encodeURIComponent(matchID)}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        let error = 'Failed to stop game';
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) error = payload.error;
        } catch {
          // ignore JSON parse error
        }
        throw new Error(error);
      }
    } catch (error) {
      throw error;
    }
  }, [adminFetch, ADMIN_MATCH_STOP_API]);

  return {
    onRestartServer,
    onResetGame,
    onDeleteMatch,
    onStopGame,
    onGetMatchState,
  };
};
