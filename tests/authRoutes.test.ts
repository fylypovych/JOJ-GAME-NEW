import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAuthRoutes } from '../server/routes/auth';
import type { RouteCtx, RouterLike } from '../server/routes/types';

type Handler = (ctx: RouteCtx) => unknown;

const TEST_USER = {
  id: 'u1',
  username: 'tester',
  email: 't@example.com',
  role: 'user' as const,
  displayName: 'Tester',
  avatarUrl: null,
  bio: '',
  preferredLang: 'uk' as const,
  profilePublic: true,
  showStatsPublic: true,
  showRecentMatchesPublic: false,
  createdAt: new Date().toISOString(),
  lastLoginAt: null,
};

const makeSameOriginCsrfHeaders = (cookie = 'joj_user_csrf=csrf-token') => ({
  cookie,
  'x-csrf-token': 'csrf-token',
  host: 'localhost:8000',
  origin: 'http://localhost:8000',
});

const allowRateLimit = async () => true;

const makeRouter = () => {
  const getHandlers = new Map<string, Handler>();
  const postHandlers = new Map<string, Handler>();
  const router: RouterLike = {
    get: (path, handler) => { getHandlers.set(path, handler); },
    post: (path, handler) => { postHandlers.set(path, handler); },
  };
  return { router, getHandlers, postHandlers };
};

const baseStore = () => ({
  ensureSchema: async () => undefined,
  createUser: async () => ({ ...TEST_USER }),
  authenticateUser: async () => ({ ...TEST_USER }),
  createSession: async () => ({ token: 'session-token', expiresAt: new Date().toISOString() }),
  getUserById: async () => null,
  getUserBySessionToken: async (token: string) => token === 'session-token' ? { ...TEST_USER } : null,
  deleteSession: async () => undefined,
  deleteAllSessionsForUser: async () => undefined,
  deleteExpiredSessions: async () => undefined,
  updateProfile: async () => ({ ...TEST_USER, displayName: 'Tester 2', bio: 'bio' }),
  changePassword: async () => undefined,
  createPasswordResetToken: async () => ({ token: 'reset-token', expiresAt: new Date().toISOString(), userId: 'u1' }),
  resetPasswordWithToken: async () => ({ ...TEST_USER }),
  getPublicUserByUsername: async (username: string) => username === 'tester' ? ({
    username: 'tester',
    displayName: 'Tester',
    avatarUrl: null,
    bio: '',
    showStatsPublic: true,
    showRecentMatchesPublic: false,
    createdAt: new Date().toISOString(),
  }) : null,
  getPublicProfileByUsername: async (username: string) => username === 'tester' ? ({
    user: {
      username: 'tester',
      displayName: 'Tester',
      avatarUrl: null,
      bio: '',
      showStatsPublic: true,
      showRecentMatchesPublic: false,
      createdAt: new Date().toISOString(),
    },
    stats: {
      matchesLinked: 1,
      matchesFinished: 1,
      wins: 1,
      winRatePct: 100,
      avgTurns: 12,
      bestRankId: 'soldier',
      bestRankName: 'soldier',
      resourcesGainedTotal: 5,
      resourcesLostTotal: 2,
      lyapsPlayedOnOthers: 1,
      scandalsPlayedOnOthers: 0,
      lastMatchAt: new Date().toISOString(),
    },
    recentMatches: [],
  }) : null,
  linkUserToMatch: async () => undefined,
  listUserSessions: async () => [{
    id: 's1',
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000).toISOString(),
    sourceIp: '127.0.0.1',
    userAgent: 'test-agent',
  }],
  deleteSessionByIdForUser: async () => undefined,
  deleteSessionById: async () => undefined,
  listUserMatchLinks: async () => [{ match_id: 'm1', player_id: '0', player_name: 'Tester', linked_at: new Date().toISOString() }],
  listUserMatchHistory: async () => [],
  persistMatchResultIfFinished: async () => true,
  getUserStatsSummary: async () => ({
    matchesLinked: 1,
    matchesFinished: 1,
    wins: 1,
    rankWins: 1,
    scoreWins: 0,
    stalledMatches: 0,
    botMatchesFinished: 0,
    winRatePct: 100,
    avgTurns: 12,
    bestRankId: 'soldier',
    bestRankName: 'soldier',
    resourcesGainedTotal: 5,
    resourcesLostTotal: 2,
    lyapsPlayedOnOthers: 1,
    scandalsPlayedOnOthers: 0,
    lastMatchAt: new Date().toISOString(),
    byMode: [],
    byPlayerCount: [],
  }),
  evaluateUserAwards: async () => [],
  listAwardDefinitions: async () => [],
  saveAwardDefinition: async () => [],
  deleteAwardDefinition: async () => [],
  listUsersAdmin: async () => [],
  updateUserStatus: async () => null,
  getAdminUserDetail: async () => null,
});

test('auth register sets cookie and returns user', async () => {
  const { router, postHandlers } = makeRouter();
  registerAuthRoutes({
    router,
    userStore: baseStore(),
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: allowRateLimit,
  });
  const handler = postHandlers.get('/api/auth/register');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      body: {
        username: 'tester',
        email: 't@example.com',
        password: 'password123',
        displayName: 'Tester',
      },
      headers: makeSameOriginCsrfHeaders(),
    },
    response: { headers: {} } as never,
  };
  await handler?.(ctx);
  assert.equal(ctx.status, undefined);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
});

test('profile me requires auth cookie and returns stats', async () => {
  const { router, getHandlers } = makeRouter();
  registerAuthRoutes({
    router,
    userStore: baseStore(),
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: allowRateLimit,
  });
  const handler = getHandlers.get('/api/profile/me');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: { cookie: 'joj_user_session=session-token' },
    },
    db: {
      fetch: async () => ({
        state: {
          G: {
            ranks: { '0': 'soldier' },
            playerNames: { '0': 'Tester' },
            playerGameStats: { '0': { resourcesGainedTotal: 5 } },
            gameStats: { turnsCompleted: 12 },
          },
          ctx: { gameover: { winner: '0', endReason: 'winner' } },
        },
      }),
    },
  };
  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal((ctx.body as { stats: { wins: number } }).stats.wins, 1);
});

test('bind-session-match verifies boardgame credentials', async () => {
  const { router, postHandlers } = makeRouter();
  registerAuthRoutes({
    router,
    userStore: baseStore(),
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: allowRateLimit,
  });
  const handler = postHandlers.get('/api/profile/bind-session-match');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: {
        ...makeSameOriginCsrfHeaders('joj_user_session=session-token; joj_user_csrf=csrf-token'),
      },
      body: { matchID: 'm1', playerID: '0', playerName: 'Tester', credentials: 'secret-0' },
    },
    db: {
      fetch: async () => ({
        state: {
          G: {
            ranks: { '0': 'soldier' },
            playerNames: { '0': 'Tester' },
          },
        },
        metadata: {
          players: {
            '0': { id: '0', name: 'Tester', credentials: 'secret-0' },
          },
        },
      }),
    },
  };
  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
});

test('bind-session-match rejects invalid boardgame credentials', async () => {
  const { router, postHandlers } = makeRouter();
  registerAuthRoutes({
    router,
    userStore: baseStore(),
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: allowRateLimit,
  });
  const handler = postHandlers.get('/api/profile/bind-session-match');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: {
        ...makeSameOriginCsrfHeaders('joj_user_session=session-token; joj_user_csrf=csrf-token'),
      },
      body: { matchID: 'm1', playerID: '0', playerName: 'Tester', credentials: 'wrong-secret' },
    },
    db: {
      fetch: async () => ({
        state: {
          G: {
            ranks: { '0': 'soldier' },
            playerNames: { '0': 'Tester' },
          },
        },
        metadata: {
          players: {
            '0': { id: '0', name: 'Tester', credentials: 'secret-0' },
          },
        },
      }),
    },
  };
  await handler?.(ctx);
  assert.equal(ctx.status, 403);
});

test('public profile endpoint returns user by username', async () => {
  const { router, getHandlers } = makeRouter();
  registerAuthRoutes({
    router,
    userStore: baseStore(),
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: allowRateLimit,
  });
  const handler = getHandlers.get('/api/users/profile');
  assert.ok(handler);
  const ctx: RouteCtx = {
    query: { username: 'tester' },
  };
  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal((ctx.body as { user: { username: string } }).user.username, 'tester');
  assert.equal('email' in ((ctx.body as { user: Record<string, unknown> }).user), false);
  assert.equal('role' in ((ctx.body as { user: Record<string, unknown> }).user), false);
});

test('auth me returns csrf token even without session', async () => {
  const { router, getHandlers } = makeRouter();
  const store = baseStore();
  registerAuthRoutes({
    router,
    userStore: {
      ...store,
      getUserBySessionToken: async () => null,
    },
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: allowRateLimit,
  });
  const handler = getHandlers.get('/api/auth/me');
  const ctx: RouteCtx = {
    request: { headers: {} },
    response: { headers: {} } as never,
  };
  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal(typeof (ctx.body as { csrfToken?: string }).csrfToken, 'string');
});

test('request-password-reset does not expose reset token in response', async () => {
  const { router, postHandlers } = makeRouter();
  registerAuthRoutes({
    router,
    userStore: baseStore(),
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: allowRateLimit,
  });
  const handler = postHandlers.get('/api/auth/request-password-reset');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      body: { login: 'tester' },
      headers: makeSameOriginCsrfHeaders(),
    },
    response: { headers: {} } as never,
  };
  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal('resetTokenPreview' in (ctx.body as Record<string, unknown>), false);
  assert.equal('resetTokenExpiresAt' in (ctx.body as Record<string, unknown>), false);
});

test('profile sessions returns active sessions for authenticated user', async () => {
  const { router, getHandlers } = makeRouter();
  registerAuthRoutes({
    router,
    userStore: baseStore(),
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: allowRateLimit,
  });
  const handler = getHandlers.get('/api/profile/sessions');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: { cookie: 'joj_user_session=session-token' },
    },
    response: { headers: {} } as never,
  };
  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal(Array.isArray((ctx.body as { sessions?: unknown[] }).sessions), true);
});

test('logout-session accepts authenticated session removal request', async () => {
  const { router, postHandlers } = makeRouter();
  registerAuthRoutes({
    router,
    userStore: baseStore(),
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: allowRateLimit,
  });
  const handler = postHandlers.get('/api/profile/logout-session');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      body: { sessionId: 's1' },
      headers: makeSameOriginCsrfHeaders('joj_user_session=session-token; joj_user_csrf=csrf-token'),
    },
    response: { headers: {} } as never,
  };
  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
});

test('auth login is blocked when rate limit is exceeded', async () => {
  const { router, postHandlers } = makeRouter();
  registerAuthRoutes({
    router,
    userStore: baseStore(),
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    enforceRateLimit: async (ctx) => {
      ctx.status = 429;
      ctx.body = { ok: false, error: 'Too many requests' };
      return false;
    },
  });
  const handler = postHandlers.get('/api/auth/login');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      body: { login: 'tester', password: 'password123' },
      headers: makeSameOriginCsrfHeaders(),
    },
  };
  await handler?.(ctx);
  assert.equal(ctx.status, 429);
  assert.equal((ctx.body as { ok: boolean }).ok, false);
});
