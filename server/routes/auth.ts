import { getClientIp, getCookieValue, readJsonBodySafe, setCookieHeader } from '../request-utils';
import type { LogLine, RouteCtx, RouterLike } from './types';
import type { UserStore } from '../services/user-store';
import {
  USER_SESSION_COOKIE,
  clearUserCsrfCookie,
  clearUserSessionCookie,
  getCurrentUserFromRequest,
  issueUserCsrfToken,
  requireUserCsrf,
  requireUserAuth,
} from '../services/user-auth';
import { deliverPasswordReset } from '../services/user-recovery';
import { markPasswordResetDeliveryDegraded, markPasswordResetDeliveryHealthy } from '../services/password-reset-health';
import { routeError, routeOk } from './response';

type MatchDbStateLike = {
  G?: {
    ranks?: Record<string, string>;
    resources?: Record<string, Record<string, number>>;
    playerNames?: Record<string, string>;
    playerGameStats?: Record<string, {
      resourcesGainedTotal?: number;
      resourcesLostTotal?: number;
      lyapsPlayedOnOthers?: number;
      scandalsPlayedOnOthers?: number;
    }>;
    gameStats?: { turnsCompleted?: number };
  };
  ctx?: { gameover?: { winner?: string; endReason?: string } | null } | null;
};
type MatchMetadataLike = {
  players?: Record<string, {
    id?: number | string;
    name?: string;
    credentials?: string;
  }>;
};
type MatchDbLike = {
  fetch: (
    matchID: string,
    opts: { state?: boolean; metadata?: boolean }
  ) => Promise<{ state?: MatchDbStateLike | null; metadata?: MatchMetadataLike | null } | null>;
};

const getVerifiedMatchParticipant = async (ctx: RouteCtx, matchId: string, playerId: string) => {
  const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
  const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
  if (!dbCandidate || typeof dbFetch !== 'function') {
    routeError(ctx, 400, 'Match database is unavailable for verification.');
    return null;
  }
  const db = dbCandidate as MatchDbLike;
  const fetched = await db.fetch(matchId, { state: true, metadata: true });
  const state = fetched?.state ?? null;
  const metadata = fetched?.metadata ?? null;
  const knownPlayerName = String(state?.G?.playerNames?.[playerId] ?? metadata?.players?.[playerId]?.name ?? '');
  const playerExists = Boolean(state?.G?.ranks?.[playerId] || metadata?.players?.[playerId]);
  if (!playerExists) {
    routeError(ctx, 404, 'Player not found in match.');
    return null;
  }
  return {
    state,
    metadata,
    knownPlayerName,
    metadataPlayer: metadata?.players?.[playerId] ?? null,
  };
};

const persistFinishedLinkedMatches = async (ctx: RouteCtx, userStore: UserStore, userId: string) => {
  const links = await userStore.listUserMatchLinks(userId);
  if (!links.length) return;
  const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
  const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
  if (!dbCandidate || typeof dbFetch !== 'function') {
    return;
  }
  const db = dbCandidate as MatchDbLike;
  for (const link of links) {
    const fetched = await db.fetch(link.match_id, { state: true, metadata: true });
    await userStore.persistMatchResultIfFinished(link.match_id, fetched?.state ?? null);
  }
};

export const registerAuthRoutes = (args: {
  router: RouterLike;
  userStore: UserStore | null;
  logLine: LogLine;
  jsonBodyLimit: number;
  enforceRateLimit: (ctx: RouteCtx, bucket: string, limit: number, windowMs: number) => Promise<boolean>;
  deliverPasswordResetFn?: typeof deliverPasswordReset;
}) => {
  const {
    router,
    userStore,
    logLine,
    jsonBodyLimit,
    enforceRateLimit,
    deliverPasswordResetFn = deliverPasswordReset,
  } = args;

  const requireUserStore = (ctx: RouteCtx): boolean => {
    if (userStore) return true;
    routeError(ctx, 503, 'User module is unavailable. Configure DATABASE_URL first.');
    return false;
  };

  const getStore = () => {
    if (!userStore) throw new Error('User module is unavailable.');
    return userStore;
  };

  router.get('/api/auth/me', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    const user = await getCurrentUserFromRequest(ctx, store);
    if (!user) {
      routeOk(ctx, { user: null, csrfToken: issueUserCsrfToken(ctx) });
      return;
    }
    routeOk(ctx, { user, csrfToken: issueUserCsrfToken(ctx) });
  });

  router.post('/api/auth/register', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-register', 10, 15 * 60_000))) return;
    const store = getStore();
    await store.deleteExpiredSessions();
    if (!requireUserCsrf(ctx)) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/register', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    try {
      const user = await store.createUser({
        username: String(body.username ?? ''),
        email: typeof body.email === 'string' ? body.email : undefined,
        password: String(body.password ?? ''),
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
        preferredLang: body.preferredLang === 'en' ? 'en' : 'uk',
        role: 'user',
      });
      const session = await store.createSession({
        userId: user.id,
        sourceIp: getClientIp(ctx),
        userAgent: typeof ctx?.request?.headers?.['user-agent'] === 'string' ? ctx.request.headers['user-agent'] : undefined,
      });
      setCookieHeader(ctx, USER_SESSION_COOKIE, session.token, { maxAgeSec: 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'Lax' });
      routeOk(ctx, { user, csrfToken: issueUserCsrfToken(ctx) });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/auth/login', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-login', 20, 15 * 60_000))) return;
    const store = getStore();
    await store.deleteExpiredSessions();
    if (!requireUserCsrf(ctx)) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/login', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const user = await store.authenticateUser(String(body.login ?? ''), String(body.password ?? ''));
    if (!user) {
      routeError(ctx, 401, 'Invalid credentials.');
      return;
    }
    const session = await store.createSession({
      userId: user.id,
      sourceIp: getClientIp(ctx),
      userAgent: typeof ctx?.request?.headers?.['user-agent'] === 'string' ? ctx.request.headers['user-agent'] : undefined,
    });
    setCookieHeader(ctx, USER_SESSION_COOKIE, session.token, { maxAgeSec: 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'Lax' });
    routeOk(ctx, { user, csrfToken: issueUserCsrfToken(ctx) });
  });

  router.post('/api/auth/logout', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const token = getCookieValue(ctx, USER_SESSION_COOKIE);
    if (token) {
      await store.deleteSession(token);
    }
    clearUserSessionCookie(ctx);
    clearUserCsrfCookie(ctx);
    routeOk(ctx);
  });

  router.post('/api/auth/change-password', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-change-password', 10, 15 * 60_000))) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const user = await requireUserAuth(ctx, store);
    if (!user) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/change-password', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    try {
      await store.changePassword({
        userId: user.id,
        currentPassword: String(body.currentPassword ?? ''),
        nextPassword: String(body.nextPassword ?? ''),
      });
      await store.deleteAllSessionsForUser(user.id);
      const session = await store.createSession({
        userId: user.id,
        sourceIp: getClientIp(ctx),
        userAgent: typeof ctx?.request?.headers?.['user-agent'] === 'string' ? ctx.request.headers['user-agent'] : undefined,
      });
      setCookieHeader(ctx, USER_SESSION_COOKIE, session.token, { maxAgeSec: 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'Lax' });
      routeOk(ctx, { csrfToken: issueUserCsrfToken(ctx) });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/auth/request-password-reset', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-request-password-reset', 8, 15 * 60_000))) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/request-password-reset', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const result = await store.createPasswordResetToken(String(body.login ?? ''));
    if (result) {
      try {
        const delivery = await deliverPasswordResetFn({
          usernameOrEmail: String(body.login ?? ''),
          token: result.token,
          expiresAt: result.expiresAt,
          logLine,
        });
        if (delivery.mode === 'log') {
          markPasswordResetDeliveryDegraded({ mode: 'log' });
          await logLine(
            'ERROR',
            'password-reset-delivery-degraded mode=log',
          );
        } else {
          markPasswordResetDeliveryHealthy();
        }
      } catch (error) {
        markPasswordResetDeliveryDegraded({
          mode: 'error',
          error: String(error instanceof Error ? error.message : error),
        });
        await logLine(
          'ERROR',
          `password-reset-delivery-degraded mode=error reason=${String(error instanceof Error ? error.message : error)}`,
        );
      }
    }
    routeOk(ctx, { csrfToken: issueUserCsrfToken(ctx) });
  });

  router.post('/api/auth/reset-password', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-reset-password', 10, 15 * 60_000))) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/reset-password', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    try {
      await store.resetPasswordWithToken({
        token: String(body.token ?? ''),
        nextPassword: String(body.nextPassword ?? ''),
      });
      clearUserSessionCookie(ctx);
      routeOk(ctx, { csrfToken: issueUserCsrfToken(ctx) });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

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

  router.get('/api/users/profile', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    const username = typeof ctx?.query?.username === 'string' ? ctx.query.username.trim() : '';
    if (!username) {
      routeError(ctx, 400, 'Missing username.');
      return;
    }
    const profile = await store.getPublicProfileByUsername(username);
    if (!profile) {
      routeError(ctx, 404, 'User not found.');
      return;
    }
    routeOk(ctx, profile);
  });
};
