import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { registerUploadRoutes } from '../server/routes/uploads';
import type { RouteCtx, RouterLike } from '../server/routes/types';
import type { UserStore, UserRecord } from '../server/services/user-store';

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
const pngDataUrl = 'data:image/png;base64,aGVsbG8=';

test('upload-card-image stores file and records asset metadata', async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'joj-upload-'));
  const { router, postHandlers } = makeRouter();
  const upsertCalls: Array<Record<string, unknown>> = [];

  registerUploadRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    IMAGE_UPLOAD_BODY_LIMIT: 100_000,
    uploadsDir,
    assetStore: {
      upsertAsset: async (input) => { upsertCalls.push(input as unknown as Record<string, unknown>); },
      markDeleted: async () => undefined,
      listAssets: async () => [],
      purgeMissingFiles: async () => 0,
      listKnownPaths: async () => new Set<string>(),
    },
  });

  const handler = postHandlers.get('/api/upload-card-image');
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
        dataUrl: pngDataUrl,
        filename: 'Card Image.PNG',
        cardId: 'card-001',
      },
    },
  };

  await handler?.(ctx);

  assert.equal((ctx.body as { ok: boolean }).ok, true);
  const savedPath = String((ctx.body as { path: string }).path);
  const savedFile = path.join(uploadsDir, path.basename(savedPath));
  const buffer = await readFile(savedFile);
  assert.equal(buffer.toString('utf8'), 'hello');
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0]?.kind, 'card-image');
});

test('avatar upload creates a new immutable URL and persists it to the user profile', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'joj-avatar-upload-'));
  const uploadsDir = path.join(rootDir, 'card-assets');
  await mkdir(uploadsDir, { recursive: true });
  const { router, postHandlers } = makeRouter();
  const user: UserRecord = {
    id: 'user-123',
    username: 'avatar-user',
    email: 'avatar@example.com',
    role: 'user',
    displayName: 'Avatar User',
    avatarUrl: '/profile-image/old.webp',
    bio: 'Profile bio',
    preferredLang: 'uk',
    profilePublic: true,
    showStatsPublic: true,
    showRecentMatchesPublic: false,
    createdAt: new Date(0).toISOString(),
    lastLoginAt: null,
  };
  const persistedPaths: string[] = [];
  const userStore = {
    getUserBySessionToken: async () => user,
    updateProfile: async (input: { avatarUrl?: string | null }) => {
      const avatarUrl = input.avatarUrl ?? null;
      if (avatarUrl) persistedPaths.push(avatarUrl);
      return { ...user, avatarUrl };
    },
  } as unknown as UserStore;

  registerUploadRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    IMAGE_UPLOAD_BODY_LIMIT: 100_000,
    uploadsDir,
    userStore,
  });

  const handler = postHandlers.get('/api/profile/avatar-upload');
  assert.ok(handler);
  const uploadOnce = async () => {
    const ctx: RouteCtx = {
      request: {
        headers: {
          cookie: 'joj_user_session=session-token; joj_user_csrf=csrf-token',
          'x-csrf-token': 'csrf-token',
        },
        body: {
          dataUrl: pngDataUrl,
          filename: 'card-image.webp',
        },
      },
    };
    await handler?.(ctx);
    assert.equal((ctx.body as { ok: boolean }).ok, true);
    return String((ctx.body as { path: string }).path);
  };

  const firstPath = await uploadOnce();
  const secondPath = await uploadOnce();

  assert.match(firstPath, /^\/profile-image\/avatar-user-123-\d+\.png$/);
  assert.match(secondPath, /^\/profile-image\/avatar-user-123-\d+(?:-\d+)?\.png$/);
  assert.notEqual(secondPath, firstPath);
  assert.deepEqual(persistedPaths, [firstPath, secondPath]);
});

test('delete-card-image rejects paths outside /card-assets', async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'joj-upload-delete-'));
  const { router, postHandlers } = makeRouter();

  registerUploadRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    IMAGE_UPLOAD_BODY_LIMIT: 100_000,
    uploadsDir,
  });

  const handler = postHandlers.get('/api/admin/delete-card-image');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: {
        cookie: 'joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
      body: { path: '/etc/passwd' },
    },
  };

  await handler?.(ctx);

  assert.equal(ctx.status, 400);
  assert.match(String((ctx.body as { error: string }).error), /Only \/card-assets/);
});

test('admin assets cleanup removes orphan files', async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'joj-upload-clean-'));
  await writeFile(path.join(uploadsDir, 'orphan.png'), 'x', 'utf8');
  const { router, postHandlers } = makeRouter();

  registerUploadRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    IMAGE_UPLOAD_BODY_LIMIT: 100_000,
    uploadsDir,
    assetStore: {
      upsertAsset: async () => undefined,
      markDeleted: async () => undefined,
      listAssets: async () => [],
      purgeMissingFiles: async () => 0,
      listKnownPaths: async () => new Set<string>(),
    },
  });

  const handler = postHandlers.get('/api/admin/assets/cleanup');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: {
        cookie: 'joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
      body: { mode: 'files' },
    },
  };

  await handler?.(ctx);

  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal((ctx.body as { cleaned: number }).cleaned, 1);
});

test('delete-card-image removes files from module subdirectories', async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'joj-upload-delete-module-'));
  await mkdir(path.join(uploadsDir, '2026.LEGENDARY.MODULE'), { recursive: true });
  await writeFile(path.join(uploadsDir, '2026.LEGENDARY.MODULE', 'card.webp'), 'module-image', 'utf8');
  const { router, postHandlers } = makeRouter();
  const deletedPaths: string[] = [];

  registerUploadRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    IMAGE_UPLOAD_BODY_LIMIT: 100_000,
    uploadsDir,
    assetStore: {
      upsertAsset: async () => undefined,
      markDeleted: async (assetPath) => { deletedPaths.push(assetPath); },
      listAssets: async () => [],
      purgeMissingFiles: async () => 0,
      listKnownPaths: async () => new Set<string>(),
    },
  });

  const handler = postHandlers.get('/api/admin/delete-card-image');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: {
        cookie: 'joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
      body: { path: '/card-assets/2026.LEGENDARY.MODULE/card.webp' },
    },
  };

  await handler?.(ctx);

  assert.equal((ctx.body as { ok: boolean }).ok, true);
  await assert.rejects(access(path.join(uploadsDir, '2026.LEGENDARY.MODULE', 'card.webp')));
  assert.deepEqual(deletedPaths, ['/card-assets/2026.LEGENDARY.MODULE/card.webp']);
});

test('admin assets cleanup removes orphan files from module subdirectories', async () => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'joj-upload-clean-module-'));
  await mkdir(path.join(uploadsDir, '2026.LEGENDARY.MODULE'), { recursive: true });
  await writeFile(path.join(uploadsDir, '2026.LEGENDARY.MODULE', 'orphan.webp'), 'x', 'utf8');
  const { router, postHandlers } = makeRouter();

  registerUploadRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit: allowRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: 10_000,
    IMAGE_UPLOAD_BODY_LIMIT: 100_000,
    uploadsDir,
    assetStore: {
      upsertAsset: async () => undefined,
      markDeleted: async () => undefined,
      listAssets: async () => [],
      purgeMissingFiles: async () => 0,
      listKnownPaths: async () => new Set<string>(),
    },
  });

  const handler = postHandlers.get('/api/admin/assets/cleanup');
  assert.ok(handler);
  const ctx: RouteCtx = {
    request: {
      headers: {
        cookie: 'joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
      body: { mode: 'files' },
    },
  };

  await handler?.(ctx);

  assert.equal((ctx.body as { ok: boolean }).ok, true);
  assert.equal((ctx.body as { cleaned: number }).cleaned, 1);
  await assert.rejects(access(path.join(uploadsDir, '2026.LEGENDARY.MODULE', 'orphan.webp')));
});
