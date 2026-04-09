import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { registerBugReportRoutes } from '../server/routes/bug-reports';
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

test('bug report submit validates description length', async () => {
  const { router, postHandlers } = makeRouter();
  registerBugReportRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    IMAGE_UPLOAD_BODY_LIMIT: 100_000,
    bugReportStore: {
      create: async () => ({ id: 'unused' }),
      list: async () => [],
      getById: async () => null,
      updateStatus: async () => null,
      getImagePathById: async () => null,
    },
    bugReportUiConfigPath: path.join(await mkdtemp(path.join(os.tmpdir(), 'joj-bug-')), 'bug-report-ui.json'),
    uploadsDir: await mkdtemp(path.join(os.tmpdir(), 'joj-bug-upload-')),
  });

  const handler = postHandlers.get('/api/bug-reports');
  assert.ok(handler);
  const ctx: RouteCtx = { request: { headers: {}, body: { description: 'short' } } };
  await handler?.(ctx);
  assert.equal(ctx.status, 400);
});

test('bug report submit stores screenshot and summary', async () => {
  const { router, postHandlers } = makeRouter();
  let createInput: Record<string, unknown> | null = null;
  registerBugReportRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    IMAGE_UPLOAD_BODY_LIMIT: 100_000,
    bugReportStore: {
      create: async (input) => {
        createInput = input as unknown as Record<string, unknown>;
        return {
          id: 'br-1',
          status: 'new',
          description: input.description,
          screenshotFileName: 'br-1.png',
          createdAt: '2026-04-09T10:00:00.000Z',
          updatedAt: '2026-04-09T10:00:00.000Z',
          matchID: input.matchID,
          playerName: input.playerName,
          spectator: input.spectator,
          uiVariant: input.uiVariant,
          lang: input.lang,
          submittedBy: null,
        };
      },
      list: async () => [],
      getById: async () => null,
      updateStatus: async () => null,
      getImagePathById: async () => null,
    },
    bugReportUiConfigPath: path.join(await mkdtemp(path.join(os.tmpdir(), 'joj-bug-2-')), 'bug-report-ui.json'),
    uploadsDir: await mkdtemp(path.join(os.tmpdir(), 'joj-bug-upload-2-')),
  });

  const handler = postHandlers.get('/api/bug-reports');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: { 'user-agent': 'unit-test-agent' },
      body: {
        description: 'Detailed bug report text',
        screenshotDataUrl: 'data:image/png;base64,aGVsbG8=',
        matchID: 'm-1',
        playerName: 'Tester',
        uiVariant: 'v2',
        lang: 'uk',
      },
    },
    ip: '127.0.0.1',
  };
  await handler?.(ctx);

  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal((ctx.body as { report: { id: string } }).report.id, 'br-1');
  assert.equal((createInput?.matchID as string), 'm-1');
  assert.ok(createInput?.screenshot);
});

test('bug report ui image serves configured file', async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'joj-bug-image-'));
  await writeFile(path.join(uploadsDir, 'bug.webp'), 'image-bytes', 'utf8');
  const uiConfigPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'joj-bug-config-')), 'bug-report-ui.json');
  await writeFile(uiConfigPath, JSON.stringify({ imagePath: '/card-assets/bug.webp' }), 'utf8');
  const { router, getHandlers } = makeRouter();
  const headers = new Map<string, string | string[]>();

  registerBugReportRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    IMAGE_UPLOAD_BODY_LIMIT: 100_000,
    bugReportStore: {
      create: async () => ({ id: 'unused' }),
      list: async () => [],
      getById: async () => null,
      updateStatus: async () => null,
      getImagePathById: async () => null,
    },
    bugReportUiConfigPath: uiConfigPath,
    uploadsDir,
    assetStore: {
      getByPath: async () => ({ fileName: 'bug.webp', mime: 'image/webp', deletedAt: null }),
    },
  });

  const handler = getHandlers.get('/api/bug-reports/ui-image');
  assert.ok(handler);
  const ctx: RouteCtx = {
    set: (name, value) => { headers.set(name, value); },
  };
  await handler?.(ctx);

  assert.equal(ctx.status, 200);
  assert.equal(headers.get('Content-Type'), 'image/webp');
  assert.equal(Buffer.isBuffer(ctx.body), true);
});
