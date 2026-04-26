import type { LogLine } from '../routes/types';

export type MatchDbBackend = {
  type?: () => number;
  connect?: () => Promise<void>;
  createMatch?: (matchID: string, opts: { initialState: unknown; metadata: Record<string, unknown> | null }) => Promise<void>;
  setState?: (matchID: string, state: unknown, deltalog?: unknown[]) => Promise<void>;
  setMetadata?: (matchID: string, metadata: unknown) => Promise<void>;
  fetch?: (matchID: string, opts: { state?: boolean; metadata?: boolean; initialState?: boolean; log?: boolean }) => Promise<Record<string, unknown>>;
  wipe?: (matchID: string) => Promise<void>;
  listMatches?: (opts?: { gameName?: string; where?: { isGameover?: boolean; updatedBefore?: number; updatedAfter?: number } }) => Promise<string[]>;
};

type MatchFetchForMirror = {
  state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  initialState?: unknown;
  log?: unknown[];
};

export const createMatchRuntimeSync = (args: {
  getCurrentBackend: () => MatchDbBackend;
  setCurrentBackend: (backend: MatchDbBackend) => void;
  getUserStore: () => { persistMatchResultIfFinished: (matchId: string, state: never) => Promise<unknown> } | null;
  getMatchStateStore: () => {
    persistMatchSnapshot: (input: {
      matchId: string;
      state: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      snapshotKind: 'initial' | 'autosave' | 'manual' | 'admin_stop' | 'admin_reset' | 'final';
    }) => Promise<unknown>;
  } | null;
  logLine: LogLine;
}) => {
  const {
    getCurrentBackend,
    setCurrentBackend,
    getUserStore,
    getMatchStateStore,
    logLine,
  } = args;

  const persistMatchMirrorById = async (matchId: string) => {
    const matchStateStore = getMatchStateStore();
    const userStore = getUserStore();
    const backend = getCurrentBackend();
    if (!matchStateStore || !userStore || typeof backend.fetch !== 'function') return;
    const fetched = await backend.fetch(matchId, { state: true, metadata: true }) as MatchFetchForMirror | null;
    if (fetched?.state) {
      await matchStateStore.persistMatchSnapshot({
        matchId,
        state: fetched.state,
        metadata: fetched.metadata ?? undefined,
        snapshotKind: ((fetched.state as { ctx?: { gameover?: unknown } }).ctx?.gameover ? 'final' : 'autosave'),
      });
    }
    await userStore.persistMatchResultIfFinished(matchId, (fetched?.state ?? null) as never);
  };

  const syncMatchStateMirror = async () => {
    const backend = getCurrentBackend();
    const matchStateStore = getMatchStateStore();
    const userStore = getUserStore();
    if (!backend.listMatches || !backend.fetch || !matchStateStore) return;
    const matchIds = (await backend.listMatches()).filter((matchId): matchId is string => typeof matchId === 'string' && matchId.length > 0);
    for (const matchId of matchIds) {
      const fetched = await backend.fetch(matchId, { state: true, metadata: true }) as MatchFetchForMirror | null;
      if (fetched?.state) {
        await matchStateStore.persistMatchSnapshot({
          matchId,
          state: fetched.state,
          metadata: fetched.metadata ?? undefined,
          snapshotKind: ((fetched.state as { ctx?: { gameover?: unknown } }).ctx?.gameover ? 'final' : 'autosave'),
        });
      }
      if (userStore) {
        await userStore.persistMatchResultIfFinished(matchId, (fetched?.state ?? null) as never);
      }
    }
  };

  const cutoverToPostgres = async (postgresMatchDb: MatchDbBackend, mode: 'auto' | 'skip') => {
    setCurrentBackend(postgresMatchDb);
    const nextMode = 'skip' as const;
    await logLine(
      'INFO',
      mode === 'skip'
        ? 'match db cutover skipped by policy'
        : 'match db flatfile migration is disabled; using postgres backend only',
    );
    return { migratedMatches: 0, mode: nextMode };
  };

  return {
    persistMatchMirrorById,
    syncMatchStateMirror,
    cutoverToPostgres,
  };
};
