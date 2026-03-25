import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAdminRoutes } from '../server/routes/admin';
import type { RouteCtx, RouterLike } from '../server/routes/types';

type Handler = (ctx: RouteCtx) => unknown;

test('health endpoint exposes password reset delivery health', async () => {
  const getHandlers = new Map<string, Handler>();
  const router: RouterLike = {
    get: (path, handler) => { getHandlers.set(path, handler); },
    post: () => undefined,
  };

  registerAdminRoutes({
    router,
    requireAdminAuth: async () => true,
    enforceRateLimit: async () => true,
    readJsonBodySafe: async () => ({}),
    logLine: async () => undefined,
    JSON_BODY_LIMIT: 10_000,
    getGitUpdateStatus: async () => ({ ok: false, error: 'unused' }),
    autoStashRuntimeNoise: async () => ({ ok: true }),
    runGit: async () => ({ ok: false, error: 'unused' }),
    runShellCommand: async () => ({ ok: false, error: 'unused' }),
    spawnDetachedShell: () => undefined,
    isAdminAuthEnabled: true,
    devRestartTouchPath: 'restart.touch',
    dbSchemaPath: 'db.sql',
    adminDbUiConfigPath: 'config.json',
    importJsonConfigToDb: async () => undefined,
    userStore: null,
    getPasswordResetDeliveryHealth: () => ({
      status: 'degraded',
      ok: false,
      lastDegradedAt: '2026-03-25T10:00:00.000Z',
      lastDegradedMode: 'error',
      lastHealthyAt: '2026-03-25T09:00:00.000Z',
      lastError: 'smtp failed',
      observedSinceStartAt: '2026-03-25T08:00:00.000Z',
    }),
    getPublicPasswordResetDeliveryHealth: () => ({
      status: 'degraded',
      ok: false,
      lastDegradedAt: '2026-03-25T10:00:00.000Z',
      lastDegradedMode: 'error',
      lastHealthyAt: '2026-03-25T09:00:00.000Z',
      observedSinceStartAt: '2026-03-25T08:00:00.000Z',
    }),
  });

  const handler = getHandlers.get('/api/health');
  assert.ok(handler);
  const ctx: RouteCtx = {};
  await handler?.(ctx);

  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.deepEqual((ctx.body as { passwordResetDelivery: unknown }).passwordResetDelivery, {
    status: 'degraded',
    ok: false,
    lastDegradedAt: '2026-03-25T10:00:00.000Z',
    lastDegradedMode: 'error',
    lastHealthyAt: '2026-03-25T09:00:00.000Z',
    observedSinceStartAt: '2026-03-25T08:00:00.000Z',
  });
});
