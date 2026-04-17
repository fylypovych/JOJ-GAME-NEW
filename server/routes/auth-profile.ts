import { readJsonBodySafe } from '../request-utils';
import type { LogLine, RouteCtx, RouterLike } from './types';
import type { UserStore } from '../services/user-store';
import {
  clearUserCsrfCookie,
  clearUserSessionCookie,
  issueUserCsrfToken,
  requireUserCsrf,
  requireUserAuth,
} from '../services/user-auth';
import { routeError, routeOk } from './response';
import { getVerifiedMatchParticipant, persistFinishedLinkedMatches } from './auth-helpers';

export interface AuthProfileConfig {
  jsonBodyLimit: number;
}

export const registerAuthProfileRoutes = (
  router: RouterLike,
  userStore: UserStore | null,
  logLine: LogLine,
  _enforceRateLimit: (ctx: RouteCtx, bucket: string, limit: number, windowMs: number) => Promise<boolean>,
  config: AuthProfileConfig,
) => {
  const { jsonBodyLimit } = config;

  const requireUserStore = (ctx: RouteCtx): boolean => {
    if (userStore) return true;
    routeError(ctx, 503, 'User module is unavailable. Configure DATABASE_URL first.');
    return false;
  };

  const getStore = () => {
    if (!userStore) throw new Error('User module is unavailable.');
    return userStore;
  };

  router.get('/api/profile/me', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    const user = await requireUserAuth(ctx, store);
    if (!user) return;
    routeOk(ctx, {
      user,
      stats: (await persistFinishedLinkedMatches(ctx, store, user.id), await store.getUserStatsSummary(user.id)),
      awards: await store.evaluateUserAwards(user.id),
      matchHistory: await store.listUserMatchHistory(user.id, 20),
      csrfToken: issueUserCsrfToken(ctx),
    });
  });

  router.post('/api/profile/me', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const user = await requireUserAuth(ctx, store);
    if (!user) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/profile/me', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const updated = await store.updateProfile({
      userId: user.id,
      displayName: String(body.displayName ?? user.displayName),
      email: typeof body.email === 'string' ? body.email : user.email,
      bio: typeof body.bio === 'string' ? body.bio : user.bio,
      avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl : user.avatarUrl,
      preferredLang: body.preferredLang === 'en' ? 'en' : 'uk',
      profilePublic: body.profilePublic !== false,
      showStatsPublic: body.showStatsPublic !== false,
      showRecentMatchesPublic: body.showRecentMatchesPublic === true,
    });
    routeOk(ctx, { user: updated, csrfToken: issueUserCsrfToken(ctx) });
  });

  router.get('/api/profile/sessions', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    const user = await requireUserAuth(ctx, store);
    if (!user) return;
    routeOk(ctx, {
      sessions: await store.listUserSessions(user.id),
      csrfToken: issueUserCsrfToken(ctx),
    });
  });

  router.post('/api/profile/logout-all', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const user = await requireUserAuth(ctx, store);
    if (!user) return;
    await store.deleteAllSessionsForUser(user.id);
    clearUserSessionCookie(ctx);
    clearUserCsrfCookie(ctx);
    routeOk(ctx);
  });

  router.post('/api/profile/logout-session', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const user = await requireUserAuth(ctx, store);
    if (!user) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/profile/logout-session', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const sessionId = String(body.sessionId ?? '').trim();
    if (!sessionId) {
      routeError(ctx, 400, 'Missing sessionId.');
      return;
    }
    await store.deleteSessionByIdForUser(user.id, sessionId);
    routeOk(ctx, { csrfToken: issueUserCsrfToken(ctx) });
  });

  router.post('/api/profile/bind-session-match', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const user = await requireUserAuth(ctx, store);
    if (!user) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/profile/bind-session-match', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const matchId = String(body.matchID ?? '').trim();
    const playerId = String(body.playerID ?? '').trim();
    const credentials = String(body.credentials ?? '').trim();
    const playerName = typeof body.playerName === 'string' ? body.playerName.trim() : '';
    if (!matchId || !playerId || !credentials) {
      routeError(ctx, 400, 'Missing matchID, playerID or credentials.');
      return;
    }
    const verified = await getVerifiedMatchParticipant(ctx, matchId, playerId);
    if (!verified) return;
    const { state, knownPlayerName, metadataPlayer } = verified;
    if (!metadataPlayer?.credentials || metadataPlayer.credentials !== credentials) {
      routeError(ctx, 403, 'Invalid match credentials.');
      return;
    }
    await store.linkUserToMatch({
      userId: user.id,
      matchId,
      playerId,
      playerName: knownPlayerName || playerName || undefined,
    });
    await store.persistMatchResultIfFinished(matchId, state ?? null);
    routeOk(ctx);
  });
};
