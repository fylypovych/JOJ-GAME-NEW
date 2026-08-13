import test from 'node:test';
import assert from 'node:assert/strict';
import { registerUserLobbyRoutes } from '../server/routes/user-lobby';
import type { RouteCtx, RouterLike } from '../server/routes/types';

type Handler = (ctx: RouteCtx) => unknown;

const makeRouter = () => {
  const postHandlers = new Map<string, Handler>();
  const router: RouterLike = {
    get: () => undefined,
    post: (path, handler) => { postHandlers.set(path, handler); },
  };
  return { router, postHandlers };
};

const baseStore = () => ({
  getUserBySessionToken: async (token: string) => token === 'session-token' ? ({
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
  }) : null,
  linkUserToMatch: async () => undefined,
  persistMatchResultIfFinished: async () => true,
});

const allowRateLimit = async () => true;
const leaveMatch = async () => undefined;

const createSettingsPool = (initial: Record<string, unknown> = {}) => {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT value FROM app_settings')) {
        const key = String(params?.[0] ?? '');
        const value = store.get(key);
        return value === undefined
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [{ value }] };
      }
      if (sql.includes('INSERT INTO app_settings')) {
        const key = String(params?.[0] ?? '');
        const rawValue = String(params?.[1] ?? 'null');
        store.set(key, JSON.parse(rawValue));
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
};

test('user-lobby join binds owned session after verified join', async () => {
  const { router, postHandlers } = makeRouter();
  const joinCalls: Array<{ gameName: string; matchID: string; playerID: string; playerName: string }> = [];
  registerUserLobbyRoutes({
    router,
    userStore: baseStore() as never,
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    gameUiConfigPath: 'unused',
    pool: createSettingsPool() as never,
    enforceRateLimit: allowRateLimit,
    lobbyApiFactory: () => ({
      createMatch: async () => ({ matchID: 'unused' }),
      leaveMatch,
      joinMatch: async (gameName, matchID, args) => {
        joinCalls.push({ gameName, matchID, playerID: args.playerID, playerName: args.playerName });
        return { playerID: '1', playerCredentials: 'cred-1' };
      },
    }),
  });
  const handler = postHandlers.get('/api/user-lobby/join');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      body: { gameName: 'joj-game', matchID: 'm1', playerID: '1', playerName: 'Tester' },
      headers: {
        cookie: 'joj_user_session=session-token; joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
    },
    db: {
      fetch: async () => ({
        state: {
          G: {
            playerNames: { '1': 'Tester' },
            ranks: { '1': 'soldier' },
          },
        },
        metadata: {
          players: {
            '1': { name: 'Tester', credentials: 'cred-1' },
          },
        },
      }),
    },
  };
  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal((ctx.body as { session: { playerID: string } }).session.playerID, '1');
  assert.deepEqual(joinCalls, [{ gameName: 'joj-game', matchID: 'm1', playerID: '1', playerName: 'Tester' }]);
});

test('user-lobby create-and-join creates bot seats and returns session', async () => {
  const { router, postHandlers } = makeRouter();
  const calls: Array<{ type: 'create' | 'join'; gameName: string; matchID?: string; body: Record<string, unknown> }> = [];
  registerUserLobbyRoutes({
    router,
    userStore: baseStore() as never,
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    gameUiConfigPath: 'unused',
    pool: createSettingsPool() as never,
    enforceRateLimit: allowRateLimit,
    lobbyApiFactory: () => ({
      createMatch: async (gameName, args) => {
        calls.push({ type: 'create', gameName, body: args as unknown as Record<string, unknown> });
        return { matchID: 'm-bot' };
      },
      joinMatch: async (gameName, matchID, args) => {
        calls.push({ type: 'join', gameName, matchID, body: args as unknown as Record<string, unknown> });
        if (args.playerID === '0') {
          return { playerID: '0', playerCredentials: 'cred-owner' };
        }
        return { playerID: String(args.playerID), playerCredentials: '' };
      },
      leaveMatch,
    }),
  });
  const handler = postHandlers.get('/api/user-lobby/create-and-join');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      body: {
        gameName: 'joj-game',
        playerName: 'Tester',
        numPlayers: 4,
        setupData: {
          bots: { count: 3, difficulty: 'easy' },
        },
      },
      headers: {
        cookie: 'joj_user_session=session-token; joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
    },
    db: {
      fetch: async () => ({
        state: {
          G: {
            playerNames: { '0': 'Tester' },
            ranks: { '0': 'recruit' },
          },
        },
        metadata: {
          players: {
            '0': { name: 'Tester', credentials: 'cred-owner' },
          },
        },
      }),
    },
  };
  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal((ctx.body as { session: { matchID: string } }).session.matchID, 'm-bot');
  const joinBodies = calls
    .filter((entry) => entry.type === 'join' && entry.matchID === 'm-bot')
    .map((entry) => entry.body);
  assert.equal(joinBodies.length, 4);
  assert.deepEqual(joinBodies.map((row) => String(row.playerID)), ['0', '1', '2', '3']);
});

test('public lobby create-and-join works without an authenticated user session', async () => {
  const { router, postHandlers } = makeRouter();
  const joinedPlayerIDs: string[] = [];
  registerUserLobbyRoutes({
    router,
    userStore: baseStore() as never,
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    gameUiConfigPath: 'unused',
    pool: createSettingsPool() as never,
    enforceRateLimit: allowRateLimit,
    lobbyApiFactory: () => ({
      createMatch: async () => ({ matchID: 'mobile-room' }),
      joinMatch: async (_gameName, _matchID, args) => {
        joinedPlayerIDs.push(args.playerID);
        return {
          playerID: args.playerID,
          playerCredentials: args.playerID === '0' ? 'mobile-credentials' : '',
        };
      },
      leaveMatch,
    }),
  });
  const handler = postHandlers.get('/api/lobby/create-and-join');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      body: {
        gameName: 'joj-game',
        playerName: 'Mobile player',
        numPlayers: 4,
        setupData: { bots: { count: 3, difficulty: 'normal', profile: 'balanced' } },
      },
      headers: {
        cookie: 'joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
    },
  };

  await handler?.(ctx);

  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.deepEqual((ctx.body as { session: Record<string, string> }).session, {
    matchID: 'mobile-room',
    playerID: '0',
    credentials: 'mobile-credentials',
  });
  assert.deepEqual(joinedPlayerIDs, ['0', '1', '2', '3']);
});

test('public lobby removes a partially created room when its owner cannot join', async () => {
  const { router, postHandlers } = makeRouter();
  const wipedMatchIDs: string[] = [];
  registerUserLobbyRoutes({
    router,
    userStore: baseStore() as never,
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    gameUiConfigPath: 'unused',
    pool: createSettingsPool() as never,
    enforceRateLimit: allowRateLimit,
    lobbyApiFactory: () => ({
      createMatch: async () => ({ matchID: 'partial-room' }),
      joinMatch: async () => { throw new Error('Player 0 not found'); },
      leaveMatch,
      wipeMatch: async (matchID) => { wipedMatchIDs.push(matchID); },
    }),
  });
  const handler = postHandlers.get('/api/lobby/create-and-join');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      body: { gameName: 'joj-game', playerName: 'Browser player', numPlayers: 2 },
      headers: {
        cookie: 'joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
    },
  };

  await handler?.(ctx);

  assert.equal(ctx.status, 400);
  assert.match(String((ctx.body as { error?: string }).error), /Player 0 not found/);
  assert.deepEqual(wipedMatchIDs, ['partial-room']);
});

test('user-lobby join returns controlled error when internal lobby api fails', async () => {
  const { router, postHandlers } = makeRouter();
  registerUserLobbyRoutes({
    router,
    userStore: baseStore() as never,
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
    gameUiConfigPath: 'unused',
    pool: createSettingsPool() as never,
    enforceRateLimit: allowRateLimit,
    lobbyApiFactory: () => ({
      createMatch: async () => ({ matchID: 'unused' }),
      leaveMatch,
      joinMatch: async () => {
        throw new Error('Internal lobby exploded.');
      },
    }),
  });
  const handler = postHandlers.get('/api/user-lobby/join');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      body: { gameName: 'joj-game', matchID: 'm1', playerID: '1', playerName: 'Tester' },
      headers: {
        cookie: 'joj_user_session=session-token; joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
    },
  };

  await handler?.(ctx);

  assert.equal(ctx.status, 400);
  assert.equal((ctx.body as { ok: boolean }).ok, false);
  assert.match(String((ctx.body as { error?: string }).error ?? ''), /Internal lobby exploded/);
});
