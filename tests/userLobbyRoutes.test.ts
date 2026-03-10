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
