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

test('user-lobby join binds owned session after verified join', async () => {
  const { router, postHandlers } = makeRouter();
  registerUserLobbyRoutes({
    router,
    userStore: baseStore() as never,
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
  });
  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({ playerID: '1', playerCredentials: 'cred-1' }),
  })) as typeof global.fetch;
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
  try {
    await handler?.(ctx);
    assert.equal((ctx.body as { ok: boolean }).ok, true);
    assert.equal((ctx.body as { session: { playerID: string } }).session.playerID, '1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('user-lobby create-and-join creates bot seats and returns session', async () => {
  const { router, postHandlers } = makeRouter();
  registerUserLobbyRoutes({
    router,
    userStore: baseStore() as never,
    logLine: async () => undefined,
    jsonBodyLimit: 10_000,
  });
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  global.fetch = (async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ url, body });
    if (url.endsWith('/games/joj-game/create')) {
      return {
        ok: true,
        json: async () => ({ matchID: 'm-bot' }),
      } as Response;
    }
    if (url.endsWith('/games/joj-game/m-bot/join') && body.playerID === '0') {
      return {
        ok: true,
        json: async () => ({ playerID: '0', playerCredentials: 'cred-owner' }),
      } as Response;
    }
    if (url.endsWith('/games/joj-game/m-bot/join')) {
      return {
        ok: true,
        json: async () => ({ playerID: String(body.playerID ?? ''), playerCredentials: '' }),
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof global.fetch;
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
  try {
    await handler?.(ctx);
    assert.equal((ctx.body as { ok: boolean }).ok, true);
    assert.equal((ctx.body as { session: { matchID: string } }).session.matchID, 'm-bot');
    const joinBodies = calls
      .filter((entry) => entry.url.endsWith('/games/joj-game/m-bot/join'))
      .map((entry) => entry.body);
    assert.equal(joinBodies.length, 4);
    assert.deepEqual(joinBodies.map((row) => String(row.playerID)), ['0', '1', '2', '3']);
  } finally {
    global.fetch = originalFetch;
  }
});
