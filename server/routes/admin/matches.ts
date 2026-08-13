import { routeError, routeOk } from '../response';
import type {
  AdminRouteSharedDeps,
  MatchDbLike,
  MatchDbMetadataLike,
  MatchDbStateLike,
  RequireAdminWriteAccess,
} from './types';

type AdminMatchRoutesDeps = Pick<AdminRouteSharedDeps, 'router' | 'requireAdminAuth' | 'enforceRateLimit' | 'logLine'> & {
  requireAdminWriteAccess: RequireAdminWriteAccess;
  persistMatchSnapshot?: (args: {
    matchId: string;
    state: MatchDbStateLike;
    metadata?: MatchDbMetadataLike;
    snapshotKind?: 'initial' | 'autosave' | 'manual' | 'admin_stop' | 'admin_reset' | 'final';
  }) => Promise<boolean> | boolean;
  markMatchDeleted?: (matchId: string) => Promise<void> | void;
  pool?: import('pg').Pool | null;
};

const getMatchDb = (ctx: Parameters<AdminRouteSharedDeps['router']['get']>[1] extends (ctx: infer T) => unknown ? T : never) => {
  const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
  return dbCandidate as MatchDbLike | undefined;
};

export const registerAdminMatchRoutes = ({
  router,
  requireAdminAuth,
  requireAdminWriteAccess,
  enforceRateLimit,
  logLine,
  persistMatchSnapshot,
  markMatchDeleted,
  pool,
}: AdminMatchRoutesDeps) => {
  router.get('/api/admin/match-state', async (ctx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/match-state'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-state', 60, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      routeError(ctx, 400, 'Missing matchID');
      return;
    }

    const db = getMatchDb(ctx);
    if (!db || typeof db.fetch !== 'function') {
      routeError(ctx, 500, 'Database is unavailable');
      return;
    }

    const fetched = await db.fetch(matchID, { state: true, metadata: true });
    const state = fetched?.state;
    const metadata = fetched?.metadata;
    if (!state) {
      routeError(ctx, 404, 'Match not found');
      return;
    }

    await persistMatchSnapshot?.({
      matchId: matchID,
      state,
      metadata: metadata ?? undefined,
      snapshotKind: 'manual',
    });

    routeOk(ctx, {
      snapshot: {
        G: state.G,
        ctx: state.ctx,
        updatedAt: metadata?.updatedAt ?? Date.now(),
      },
    });
  });

  router.post('/api/admin/match-stop', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/match-stop'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-stop', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      routeError(ctx, 400, 'Missing matchID');
      return;
    }

    const db = getMatchDb(ctx);
    if (!db || typeof db.fetch !== 'function' || typeof db.setState !== 'function' || typeof db.setMetadata !== 'function') {
      routeError(ctx, 500, 'Database stop controls are unavailable');
      return;
    }

    const fetched = await db.fetch(matchID, { state: true, metadata: true });
    const state = fetched?.state;
    if (!state) {
      routeError(ctx, 404, 'Match not found');
      return;
    }

    const now = Date.now();
    const nextState: MatchDbStateLike = {
      ...state,
      ctx: {
        ...(state.ctx ?? {}),
        gameover: {
          forcedStop: true,
          stoppedAt: now,
        },
      },
    };
    const nextMetadata: MatchDbMetadataLike = {
      ...(fetched?.metadata ?? {}),
      updatedAt: now,
      gameover: { forcedStop: true, stoppedAt: now },
    };

    await db.setState(matchID, nextState);
    await db.setMetadata(matchID, nextMetadata);
    await persistMatchSnapshot?.({
      matchId: matchID,
      state: nextState,
      metadata: nextMetadata,
      snapshotKind: 'admin_stop',
    });
    await logLine('WARN', `admin stopped match matchID=${matchID}`);

    routeOk(ctx, {
      matchID,
      stopped: true,
      snapshot: {
        G: nextState.G,
        ctx: nextState.ctx,
        updatedAt: now,
      },
    });
  });

  router.post('/api/admin/match-reset', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/match-reset'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-reset', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      routeError(ctx, 400, 'Missing matchID');
      return;
    }

    const db = getMatchDb(ctx);
    if (!db || typeof db.fetch !== 'function' || typeof db.setState !== 'function' || typeof db.setMetadata !== 'function') {
      routeError(ctx, 500, 'Database reset controls are unavailable');
      return;
    }

    const fetched = await db.fetch(matchID, { state: true, metadata: true, initialState: true });
    const state = fetched?.state;
    const initialState = fetched?.initialState;
    if (!state || !initialState) {
      routeError(ctx, 404, 'Match or initial state not found');
      return;
    }

    const now = Date.now();
    const nextMetadata: MatchDbMetadataLike = {
      ...(fetched?.metadata ?? {}),
      updatedAt: now,
    };
    delete nextMetadata.gameover;

    await db.setState(matchID, initialState, []);
    await db.setMetadata(matchID, nextMetadata);
    await persistMatchSnapshot?.({
      matchId: matchID,
      state: initialState,
      metadata: nextMetadata,
      snapshotKind: 'admin_reset',
    });
    await logLine('WARN', `admin reset match matchID=${matchID}`);

    routeOk(ctx, {
      matchID,
      reset: true,
      snapshot: {
        G: initialState.G,
        ctx: initialState.ctx,
        updatedAt: now,
      },
    });
  });

  router.post('/api/admin/match-delete', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/match-delete'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-delete', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      routeError(ctx, 400, 'Missing matchID');
      return;
    }

    const db = getMatchDb(ctx);
    if (!db || typeof db.wipe !== 'function') {
      routeError(ctx, 500, 'Database delete controls are unavailable');
      return;
    }
    const fetched = typeof db.fetch === 'function'
      ? await db.fetch(matchID, { state: true, metadata: true })
      : null;
    if (!fetched?.state && !fetched?.metadata) {
      routeOk(ctx, { matchID, deleted: false, missing: true });
      return;
    }

    await db.wipe(matchID);
    await markMatchDeleted?.(matchID);
    await logLine('WARN', `admin deleted match matchID=${matchID}`);
    routeOk(ctx, { matchID, deleted: true });
  });

  router.post('/api/admin/matches-delete-all', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/matches-delete-all'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-matches-delete-all', 3, 60_000))) return;

    const db = getMatchDb(ctx);
    if (!db || typeof db.listMatches !== 'function' || typeof db.wipe !== 'function') {
      routeError(ctx, 500, 'Database delete-all controls are unavailable');
      return;
    }

    try {
      const matchIds = await db.listMatches();
      let deleted = 0;
      const failed: string[] = [];
      for (const matchId of matchIds) {
        try {
          await db.wipe(matchId);
          await markMatchDeleted?.(matchId);
          deleted += 1;
        } catch {
          failed.push(matchId);
        }
      }
      await logLine('WARN', `admin deleted all matches requested=${matchIds.length} deleted=${deleted} failed=${failed.length}`);
      routeOk(ctx, {
        requested: matchIds.length,
        deleted,
        failed,
      });
    } catch (error) {
      routeError(ctx, 500, String(error instanceof Error ? error.message : error));
    }
  });

  router.get('/api/admin/matches', async (ctx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/matches'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-matches', 30, 60_000))) return;

    const db = getMatchDb(ctx);
    if (!db || typeof db.listMatches !== 'function') {
      routeError(ctx, 500, 'Database is unavailable');
      return;
    }

    try {
      const matchIds = await db.listMatches();
      await logLine('INFO', `Admin matches: total matchIds from listMatches: ${matchIds.length}`);
      const matches = [];
      for (const matchId of matchIds) {
        // Check match lifecycle in match_records first.
        if (pool) {
          const deletedCheck = await pool.query<{ status: string }>(
            'SELECT status FROM match_records WHERE id = $1 LIMIT 1',
            [matchId]
          );
          if (deletedCheck.rows.length === 0) {
            await logLine('WARN', `Admin matches: skipping orphan live match ${matchId} (no match_records row)`);
            continue;
          }
          if (deletedCheck.rows[0]?.status === 'deleted') {
            await logLine('INFO', `Admin matches: skipping deleted match ${matchId}`);
            continue;
          }
        }
        const fetched = typeof db.fetch === 'function'
          ? await db.fetch(matchId, { metadata: true, state: true })
          : null;
        if (!fetched?.state && !fetched?.metadata) {
          await logLine('WARN', `Admin matches: skipping broken match ${matchId} (no state and no metadata)`);
          continue;
        }
        matches.push({
          matchID: matchId,
          metadata: fetched?.metadata ?? {},
        });
      }
      await logLine('INFO', `Admin matches: showing ${matches.length}`);
      routeOk(ctx, { matches });
    } catch (error) {
      routeError(ctx, 500, String(error instanceof Error ? error.message : error));
    }
  });

  // Public endpoint for lobby to get matches from DB
  router.get('/api/lobby/matches', async (ctx) => {
    if (!(await enforceRateLimit(ctx, 'lobby-matches', 30, 60_000))) return;

    const db = getMatchDb(ctx);
    if (!db || typeof db.listMatches !== 'function') {
      routeError(ctx, 500, 'Database is unavailable');
      return;
    }

    try {
      const matchIds = await db.listMatches();
      await logLine('INFO', `Lobby matches: total matchIds from listMatches: ${matchIds.length}`);
      const matches = [];
      for (const matchId of matchIds) {
        // Check match lifecycle in match_records first.
        if (pool) {
          const deletedCheck = await pool.query<{ status: string }>(
            'SELECT status FROM match_records WHERE id = $1 LIMIT 1',
            [matchId]
          );
          if (deletedCheck.rows.length === 0) {
            await logLine('WARN', `Lobby matches: skipping orphan live match ${matchId} (no match_records row)`);
            continue;
          }
          if (deletedCheck.rows[0]?.status === 'deleted') {
            await logLine('INFO', `Lobby matches: skipping deleted match ${matchId}`);
            continue;
          }
        }
        const fetched = typeof db.fetch === 'function'
          ? await db.fetch(matchId, { metadata: true, state: true })
          : null;
        if (!fetched?.state && !fetched?.metadata) {
          await logLine('WARN', `Lobby matches: skipping broken match ${matchId} (no state and no metadata)`);
          continue;
        }
        const metadata = fetched?.metadata as {
          gameover?: unknown;
          updatedAt?: number | string;
          setupData?: unknown;
          players?: Record<string, { name?: string | null }>;
        } | null;
        // Skip gameover matches for lobby
        if (metadata?.gameover) {
          await logLine('INFO', `Lobby matches: skipping gameover match ${matchId}`);
          continue;
        }
        const players = metadata?.players && typeof metadata.players === 'object'
          ? Object.entries(metadata.players).reduce<Array<{ id: number; name?: string }>>((acc, [playerId, playerMeta]) => {
            const id = Number.parseInt(playerId, 10);
            if (!Number.isFinite(id)) return acc;
            acc.push({
              id,
              name: typeof playerMeta?.name === 'string' ? playerMeta.name : undefined,
            });
            return acc;
          }, []).sort((a, b) => a.id - b.id)
          : [];
        if (!players.some((player) => Boolean(player.name?.trim()))) {
          await logLine('WARN', `Lobby matches: skipping ownerless match ${matchId}`);
          continue;
        }
        matches.push({
          matchID: matchId,
          metadata: metadata ?? {},
          players,
          setupData: metadata?.setupData && typeof metadata.setupData === 'object'
            ? metadata.setupData
            : undefined,
          gameover: Boolean(metadata?.gameover),
        });
      }
      await logLine('INFO', `Lobby matches: showing ${matches.length}`);
      routeOk(ctx, { matches });
    } catch (error) {
      routeError(ctx, 500, String(error instanceof Error ? error.message : error));
    }
  });
};
