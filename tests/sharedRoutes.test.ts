import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSharedRoutes } from '../server/routes/shared';
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

const allowRateLimit = async () => true;
const requireAdminAuth = async () => true;
const readJsonBodySafe = async ({ ctx }: { ctx: RouteCtx }) => (ctx.request?.body as Record<string, unknown>) ?? {};
const logLine = async () => undefined;

test('shared ranks update validates payload and saves on success', async () => {
  const { router, postHandlers } = makeRouter();
  let saved = false;
  registerSharedRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    LARGE_JSON_BODY_LIMIT: 100_000,
    exportSharedDeckTemplateJson: () => '{"ok":true}',
    getSharedDeckTemplateStats: () => ({ cards: 1 }),
    getSharedRanks: () => [{ id: 'recruit' }],
    setSharedRanks: (value) => Array.isArray(value) && value.length === 1,
    resetSharedRanks: () => undefined,
    importSharedDeckTemplateJson: () => ({ ok: true }),
    resetSharedDeckTemplate: () => undefined,
    saveRanksToDisk: async () => { saved = true; },
    saveTemplateToDisk: async () => undefined,
  });

  const handler = postHandlers.get('/api/shared-ranks');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: {
        cookie: 'joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
      body: { ranks: [{ id: 'recruit' }] },
    },
  };

  await handler?.(ctx);
  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal(saved, true);
});

test('shared deck template import reports validation error', async () => {
  const { router, postHandlers } = makeRouter();
  registerSharedRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    LARGE_JSON_BODY_LIMIT: 100_000,
    exportSharedDeckTemplateJson: () => '{"ok":true}',
    getSharedDeckTemplateStats: () => ({ cards: 1 }),
    getSharedRanks: () => [{ id: 'recruit' }],
    setSharedRanks: () => true,
    resetSharedRanks: () => undefined,
    importSharedDeckTemplateJson: () => ({ ok: false, error: 'bad template' }),
    resetSharedDeckTemplate: () => undefined,
    saveRanksToDisk: async () => undefined,
    saveTemplateToDisk: async () => undefined,
  });

  const handler = postHandlers.get('/api/shared-deck-template/import');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: {
        cookie: 'joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
      body: { json: '{"broken":true}' },
    },
  };

  await handler?.(ctx);
  assert.equal(ctx.status, 400);
  assert.equal((ctx.body as { error: string }).error, 'bad template');
});
