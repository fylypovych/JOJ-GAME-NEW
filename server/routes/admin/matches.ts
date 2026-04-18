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
      const matches = [];
      for (const matchId of matchIds) {
        const fetched = typeof db.fetch === 'function'
          ? await db.fetch(matchId, { metadata: true })
          : null;
        if (fetched?.metadata) {
          matches.push({
            matchID: matchId,
            metadata: fetched.metadata,
          });
        }
      }
      routeOk(ctx, { matches });
    } catch (error) {
      routeError(ctx, 500, String(error instanceof Error ? error.message : error));
    }
  });
};
