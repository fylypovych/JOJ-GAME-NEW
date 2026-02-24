import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike } from './types';

type UploadRoutesDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  IMAGE_UPLOAD_BODY_LIMIT: number;
  uploadsDir: string;
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
}: UploadRoutesDeps) => {
  router.post('/api/upload-card-image', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/upload-card-image'))) return;
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
    const safeNameBase = inputBase
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || `card-${Date.now()}`;

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
      await writeFile(outPath, Buffer.from(base64, 'base64'));
      await logLine('INFO', `image uploaded: ${candidate}`);
      ctx.body = { ok: true, path: `/cards/${candidate}` };
    } catch (error) {
      await logLine('ERROR', `image upload failed: ${String(error)}`);
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to save image' };
    }
  });

  router.post('/api/admin/delete-card-image', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/delete-card-image'))) return;
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
      await logLine('INFO', `image deleted: ${fileName}`);
      ctx.body = { ok: true };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to delete image' };
      await logLine('ERROR', `image delete failed (${fileName}): ${String(error)}`);
    }
  });
};
