import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { registerAdminRoutes } from '../server/routes/admin';
import type { RouteCtx, RouterLike } from '../server/routes/types';

type Handler = (ctx: RouteCtx) => unknown;

const makeRouter = () => {
  const getHandlers = new Map<string, Handler>();
  const postHandlers = new Map<string, Handler>();
  const router: RouterLike = {
    get: (route, handler) => { getHandlers.set(route, handler); },
    post: (route, handler) => { postHandlers.set(route, handler); },
  };
  return { router, getHandlers, postHandlers };
};

const readJsonBodySafe = async ({ ctx }: { ctx: RouteCtx }) => (ctx.request?.body as Record<string, unknown>) ?? {};
const allowRateLimit = async () => true;
const requireAdminAuth = async () => true;
const logLine = async () => undefined;

const createSettingsPool = (initial: Record<string, unknown> = {}) => {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    pool: {
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
    },
    getSetting: (key: string) => store.get(key),
  };
};

test('admin game ui config save persists normalized config', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'joj-admin-ui-'));
  const gameUiConfigPath = path.join(tempDir, 'game-ui-config.json');
  const { router, postHandlers } = makeRouter();
  const settings = createSettingsPool();

  registerAdminRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    getGitUpdateStatus: async () => ({ ok: false, error: 'unused' }),
    getGitAuthStatus: async () => ({
      helper: '',
      helperConfigured: false,
      hasGithubCredentials: false,
      savedUsername: '',
      credentialsPath: '',
      remoteAuthMode: 'https',
    }),
    saveGithubHttpsCredentials: async () => ({ ok: true }),
    clearGithubHttpsCredentials: async () => ({ ok: true }),
    autoStashRuntimeNoise: async () => ({ ok: true }),
    runGit: async () => ({ ok: false, error: 'unused' }),
    runShellCommand: async () => ({ ok: false, error: 'unused' }),
    spawnDetachedShell: () => undefined,
    devRestartTouchPath: path.join(tempDir, 'restart.touch'),
    dbSchemaPath: path.join(tempDir, 'db.sql'),
    adminDbUiConfigPath: path.join(tempDir, 'db-ui-config.json'),
    gameUiConfigPath,
    importJsonConfigToDb: async () => undefined,
    pool: settings.pool as never,
  });

  const handler = postHandlers.get('/api/admin/game/ui-config');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: {
        cookie: 'joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
      body: {
        allowedRoomCapacities: [2, 4],
        allowedBotCounts: [0, 1],
        defaultBotCount: 1,
      },
    },
  };

  await handler?.(ctx);

  assert.equal((ctx.body as { ok: boolean }).ok, true);
  const saved = settings.getSetting('game_ui_config') as { allowedRoomCapacities: number[]; defaultBotCount: number };
  assert.deepEqual(saved.allowedRoomCapacities, [2, 4]);
  assert.equal(saved.defaultBotCount, 1);
});
