import { access, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike, RouteCtx } from './types';
import { requireAdminMutationAuth } from '../admin-auth';

type UploadRoutesDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  IMAGE_UPLOAD_BODY_LIMIT: number;
  uploadsDir: string;
  assetStore?: {
    upsertAsset: (input: {
      assetPath: string;
      fileName: string;
      mime: string;
      sizeBytes: number;
      kind?: string;
      source?: string;
    }) => Promise<void>;
    markDeleted: (assetPath: string) => Promise<void>;
    listAssets: (args?: { kind?: string; includeDeleted?: boolean; limit?: number }) => Promise<Array<{
      path: string;
      fileName: string;
      mime: string;
      sizeBytes: number;
      kind: string;
      source: string;
      updatedAt: string;
      deletedAt: string | null;
    }>>;
    purgeMissingFiles: (existingAssetPaths: Set<string>, kind?: string) => Promise<number>;
    listKnownPaths: (kind?: string) => Promise<Set<string>>;
  } | null;
};

export const registerUploadRoutes = ({
  router,
  requireAdminAuth,
  enforceRateLimit,
  readJsonBodySafe,
  logLine,
  JSON_BODY_LIMIT,
  IMAGE_UPLOAD_BODY_LIMIT,
  uploadsDir,
  assetStore,
}: UploadRoutesDeps) => {
  const requireAdminWriteAccess = (ctx: RouteCtx, routeLabel: string) =>
    requireAdminMutationAuth(ctx, routeLabel, requireAdminAuth);

  router.get('/api/admin/assets', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/assets'))) return;
    const kind = typeof ctx?.query?.kind === 'string' ? ctx.query.kind.trim() : 'card-image';
    const limit = typeof ctx?.query?.limit === 'string' ? Number.parseInt(ctx.query.limit, 10) : 100;
    const assets = assetStore ? await assetStore.listAssets({ kind, limit }) : [];
    ctx.body = { ok: true, assets };
  });

  router.post('/api/upload-card-image', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/upload-card-image'))) return;
    if (!(await enforceRateLimit(ctx, 'upload-card-image', 240, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/upload-card-image', maxBytes: IMAGE_UPLOAD_BODY_LIMIT, logLine });
    if (!body) return;
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    const filename = typeof body.filename === 'string' ? body.filename : '';
    const cardId = typeof body.cardId === 'string' ? body.cardId : '';
    if (!dataUrl) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing dataUrl' };
      return;
    }

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid image data URL' };
      return;
    }

    const mime = match[1];
    const base64 = match[2];
    const extByMime: Record<string, string> = {
      'image/png': 'png',
      'image/webp': 'webp',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
    };
    const fallbackExt = extByMime[mime] ?? 'png';
    const parsedInput = path.parse(filename || '');
    const inputBase = parsedInput.name || cardId || `card-${Date.now()}`;
    const inputExt = (parsedInput.ext || '').replace(/^\./, '').toLowerCase();
    const ext = /^[a-z0-9]+$/.test(inputExt) ? inputExt : fallbackExt;
    const normalizedBase = inputBase
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '');
    const safeNameBase = /[a-z0-9]/.test(normalizedBase)
      ? normalizedBase
      : `card-${Date.now()}`;

    await mkdir(uploadsDir, { recursive: true });
    let candidate = `${safeNameBase}.${ext}`;
    let outPath = path.join(uploadsDir, candidate);
    try {
      await access(outPath);
      candidate = `${safeNameBase}-${Date.now()}.${ext}`;
      outPath = path.join(uploadsDir, candidate);
    } catch {
      // file doesn't exist
    }

    try {
      const buffer = Buffer.from(base64, 'base64');
      await writeFile(outPath, buffer);
      await assetStore?.upsertAsset({
        assetPath: `/cards/${candidate}`,
        fileName: candidate,
        mime,
        sizeBytes: buffer.byteLength,
        kind: 'card-image',
        source: 'upload',
      });
      await logLine('INFO', `image uploaded: ${candidate}`);
      ctx.body = { ok: true, path: `/cards/${candidate}` };
    } catch (error) {
      await logLine('ERROR', `image upload failed: ${String(error)}`);
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to save image' };
    }
  });

  router.post('/api/admin/delete-card-image', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/delete-card-image'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-delete-card-image', 240, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/delete-card-image', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const imagePath = typeof body.path === 'string' ? body.path.trim() : '';
    if (!imagePath.startsWith('/cards/')) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Only /cards/* paths can be deleted' };
      return;
    }
    const fileName = path.basename(imagePath);
    if (!fileName || fileName === '.' || fileName === '..') {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid file path' };
      return;
    }
    const targetPath = path.resolve(uploadsDir, fileName);
    if (!targetPath.startsWith(uploadsDir + path.sep) && targetPath !== path.resolve(uploadsDir, fileName)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid target path' };
      return;
    }
    try {
      await unlink(targetPath);
      await assetStore?.markDeleted(imagePath);
      await logLine('INFO', `image deleted: ${fileName}`);
      ctx.body = { ok: true };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to delete image' };
      await logLine('ERROR', `image delete failed (${fileName}): ${String(error)}`);
    }
  });

  router.post('/api/admin/assets/cleanup', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/assets/cleanup'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-assets-cleanup', 30, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/assets/cleanup', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const mode = body.mode === 'records' ? 'records' : 'files';
    if (!assetStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'Asset metadata store is unavailable.' };
      return;
    }
    const entries = await readdir(uploadsDir, { withFileTypes: true }).catch(() => []);
    const fileNames = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const absPath = path.join(uploadsDir, entry.name);
      const fileStat = await stat(absPath).catch(() => null);
      if (!fileStat?.isFile()) return null;
      return entry.name;
    }));
    const existingPaths = new Set(fileNames.filter((name): name is string => Boolean(name)).map((name) => `/cards/${name}`));

    if (mode === 'records') {
      const cleaned = await assetStore.purgeMissingFiles(existingPaths, 'card-image');
      ctx.body = { ok: true, mode, cleaned };
      return;
    }

    const knownPaths = await assetStore.listKnownPaths('card-image');
    let cleaned = 0;
    for (const assetPath of existingPaths) {
      if (knownPaths.has(assetPath)) continue;
      const fileName = path.basename(assetPath);
      const targetPath = path.resolve(uploadsDir, fileName);
      try {
        await unlink(targetPath);
        cleaned += 1;
      } catch {
        // ignore missing/locked file and continue cleanup
      }
    }
    ctx.body = { ok: true, mode, cleaned };
  });
};
