import { access, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike, RouteCtx } from './types';
import { requireAdminMutationAuth } from '../admin-auth';
import type { UserStore } from '../services/user-store';
import { issueUserCsrfToken, requireUserAuth, requireUserCsrf } from '../services/user-auth';

export type UploadRoutesDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  IMAGE_UPLOAD_BODY_LIMIT: number;
  uploadsDir: string;
  userStore?: UserStore | null;
  getModules?: () => unknown[];
  assetStore?: {
    upsertAsset: (input: {
      assetPath: string;
      fileName: string;
      mime: string;
      sizeBytes: number;
      kind: string;
      source: string;
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
  auditAdminAction?: (input: {
    action: string;
    ctx: RouteCtx;
    success: boolean;
    details?: Record<string, unknown>;
  }) => Promise<void>;
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
  userStore,
  getModules,
  assetStore,
  auditAdminAction,
}: UploadRoutesDeps) => {
  const CARD_ASSET_BASE_PATH = '/public/card-assets/';
  const AVATAR_ASSET_BASE_PATH = '/profile-image/';
  const avatarUploadsDir = path.resolve(uploadsDir, '..', 'profile-image');
  const systemIconsDir = path.resolve(uploadsDir, '..', 'sys.icons');
  const isCardAssetPath = (value: string) => value.startsWith('/card-assets/') || value.startsWith('/cards/') || value.startsWith('/public/card-assets/');
  const toUploadsRelativePath = (assetPath: string) => {
    const normalized = assetPath.replace(/\\/g, '/').trim();
    if (normalized.startsWith('/public/card-assets/')) return normalized.slice('/public/card-assets/'.length);
    if (normalized.startsWith('/card-assets/')) return normalized.slice('/card-assets/'.length);
    if (normalized.startsWith('/cards/')) return normalized.slice('/cards/'.length);
    return '';
  };
  const resolveCardAssetTargetPath = (assetPath: string) => {
    const relativePath = toUploadsRelativePath(assetPath);
    if (!relativePath || relativePath === '.' || relativePath === '..') return null;
    const normalizedRelative = path.normalize(relativePath);
    if (!normalizedRelative || normalizedRelative.startsWith('..') || path.isAbsolute(normalizedRelative)) return null;
    const targetPath = path.resolve(uploadsDir, normalizedRelative);
    const uploadsRoot = path.resolve(uploadsDir);
    if (targetPath !== uploadsRoot && !targetPath.startsWith(`${uploadsRoot}${path.sep}`)) return null;
    return { targetPath, normalizedRelative };
  };
  const listRelativeFiles = async (rootDir: string, prefix = ''): Promise<string[]> => {
    const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await listRelativeFiles(absPath, relativePath));
        continue;
      }
      if (!entry.isFile()) continue;
      const fileStat = await stat(absPath).catch(() => null);
      if (!fileStat?.isFile()) continue;
      files.push(relativePath.replace(/\\/g, '/'));
    }
    return files;
  };
  const toCardAssetPath = (fileName: string, moduleName?: string) => {
    if (moduleName) {
      return `${CARD_ASSET_BASE_PATH}${moduleName}/${fileName}`;
    }
    return `${CARD_ASSET_BASE_PATH}${fileName}`;
  };
  const toAvatarPath = (fileName: string) => `${AVATAR_ASSET_BASE_PATH}${fileName}`;
  const buildCardAssetAliases = (normalizedRelative: string) => ([
    `/public/card-assets/${normalizedRelative}`,
    `/card-assets/${normalizedRelative}`,
    `/cards/${normalizedRelative}`,
  ]);
  const serveAvatarFile = async (ctx: RouteCtx) => {
    const fileName = typeof (ctx as RouteCtx & { params?: Record<string, unknown> }).params?.fileName === 'string'
      ? String((ctx as RouteCtx & { params?: Record<string, unknown> }).params?.fileName).trim()
      : '';
    if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
      ctx.status = 400;
      ctx.body = 'Invalid avatar path';
      return;
    }
    const absPath = path.join(avatarUploadsDir, fileName);
    try {
      const fileBuffer = await readFile(absPath);
      const ext = path.extname(fileName).toLowerCase();
      const mime = ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/webp';
      if (typeof ctx.set === 'function') {
        ctx.set('Content-Type', mime);
      }
      ctx.body = fileBuffer;
    } catch {
      ctx.status = 404;
      ctx.body = 'Avatar not found';
    }
  };

  const requireAdminWriteAccess = (ctx: RouteCtx, routeLabel: string) =>
    requireAdminMutationAuth(ctx, routeLabel, requireAdminAuth);
  const parseUploadBody = async (ctx: RouteCtx, routeLabel: string) => {
    const body = await readJsonBodySafe({ ctx, routeLabel, maxBytes: IMAGE_UPLOAD_BODY_LIMIT, logLine });
    if (!body) return null;
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    const filename = typeof body.filename === 'string' ? body.filename : '';
    const cardId = typeof body.cardId === 'string' ? body.cardId : '';
    if (!dataUrl) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing dataUrl' };
      return null;
    }

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid image data URL' };
      return null;
    }

    return {
      body,
      dataUrl,
      filename,
      cardId,
      mime: match[1],
      base64: match[2],
    };
  };
  const saveUploadedImage = async ({
    mime,
    base64,
    filename,
    fallbackBaseName,
    assetKind,
    cardId,
  }: {
    mime: string;
    base64: string;
    filename: string;
    fallbackBaseName: string;
    assetKind: string;
    cardId?: string;
  }) => {
    const extByMime: Record<string, string> = {
      'image/png': 'png',
      'image/webp': 'webp',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
    };
    const fallbackExt = extByMime[mime] ?? 'png';
    const parsedInput = path.parse(filename || '');
    const inputBase = parsedInput.name || fallbackBaseName || `asset-${Date.now()}`;
    const inputExt = (parsedInput.ext || '').replace(/^\./, '').toLowerCase();
    const ext = /^[a-z0-9]+$/.test(inputExt) ? inputExt : fallbackExt;
    const normalizedBase = inputBase
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '');
    const safeNameBase = /[a-z0-9]/.test(normalizedBase)
      ? normalizedBase
      : `asset-${Date.now()}`;

    // Get module name if this is a card image
    let moduleName: string | undefined;
    if (assetKind === 'card-image' && cardId && getModules) {
      const modules = getModules();
      for (const module of modules) {
        if (module && typeof module === 'object' && 'cardIds' in module && 'name' in module) {
          const cardIds = (module as { cardIds: string[] }).cardIds || [];
          if (cardIds.includes(cardId)) {
            moduleName = (module as { name: string }).name;
            break;
          }
        }
      }
    }

    // Use separate directory for avatars, module subdirectories for cards, and system icons
    const isAvatar = assetKind === 'avatar-image';
    const isCard = assetKind === 'card-image';
    const isSystemIcon = assetKind === 'system-icon';
    let targetDir: string;
    if (isAvatar) {
      targetDir = avatarUploadsDir;
    } else if (isCard && moduleName) {
      targetDir = path.join(uploadsDir, moduleName);
    } else if (isSystemIcon) {
      targetDir = systemIconsDir;
    } else {
      targetDir = uploadsDir;
    }
    await mkdir(targetDir, { recursive: true });
    let candidate = `${safeNameBase}.${ext}`;
    let outPath = path.join(targetDir, candidate);
    try {
      await access(outPath);
      candidate = `${safeNameBase}-${Date.now()}.${ext}`;
      outPath = path.join(targetDir, candidate);
    } catch {
      // file doesn't exist
    }

    const buffer = Buffer.from(base64, 'base64');
    await writeFile(outPath, buffer);
    let assetPath: string;
    if (isAvatar) {
      assetPath = toAvatarPath(candidate);
    } else if (isSystemIcon) {
      assetPath = `/sys.icons/${candidate}`;
    } else {
      assetPath = toCardAssetPath(candidate, moduleName);
    }
    await assetStore?.upsertAsset({
      assetPath,
      fileName: candidate,
      mime,
      sizeBytes: buffer.byteLength,
      kind: assetKind,
      source: 'upload',
    });
    await logLine('INFO', `image uploaded: ${candidate}`);
    return assetPath;
  };

  router.get('/api/admin/assets', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/assets'))) return;
    const kind = typeof ctx?.query?.kind === 'string' ? ctx.query.kind.trim() : 'card-image';
    const limit = typeof ctx?.query?.limit === 'string' ? Number.parseInt(ctx.query.limit, 10) : 100;
    const assets = assetStore ? await assetStore.listAssets({ kind, limit }) : [];
    ctx.body = { ok: true, assets };
  });

  router.get('/profile-image/:fileName', serveAvatarFile);
  router.get('/public/profile-image/:fileName', serveAvatarFile);

  router.post('/api/upload-card-image', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/upload-card-image'))) return;
    if (!(await enforceRateLimit(ctx, 'upload-card-image', 240, 60_000))) return;
    const parsed = await parseUploadBody(ctx, '/api/upload-card-image');
    if (!parsed) return;

    try {
      const assetPath = await saveUploadedImage({
        mime: parsed.mime,
        base64: parsed.base64,
        filename: parsed.filename,
        fallbackBaseName: parsed.cardId || `card-${Date.now()}`,
        assetKind: 'card-image',
        cardId: parsed.cardId || undefined,
      });
      await auditAdminAction?.({ action: 'uploads.card-image.upload', ctx, success: true, details: { path: assetPath } });
      ctx.body = { ok: true, path: assetPath };
    } catch (error) {
      await auditAdminAction?.({ action: 'uploads.card-image.upload', ctx, success: false, details: { error: String(error) } });
      await logLine('ERROR', `image upload failed: ${String(error)}`);
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to save image' };
    }
  });

  router.post('/api/profile/avatar-upload', async (ctx: RouteCtx) => {
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    if (!requireUserCsrf(ctx)) return;
    const user = await requireUserAuth(ctx, userStore);
    if (!user) return;
    if (!(await enforceRateLimit(ctx, 'profile-avatar-upload', 30, 60_000))) return;
    const parsed = await parseUploadBody(ctx, '/api/profile/avatar-upload');
    if (!parsed) return;
    try {
      const assetPath = await saveUploadedImage({
        mime: parsed.mime,
        base64: parsed.base64,
        filename: parsed.filename,
        fallbackBaseName: `avatar-${user.id}`,
        assetKind: 'avatar-image',
      });
      ctx.body = { ok: true, path: assetPath, csrfToken: issueUserCsrfToken(ctx) };
    } catch (error) {
      await logLine('ERROR', `avatar upload failed: ${String(error)}`);
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
    if (!isCardAssetPath(imagePath)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Only /card-assets/* paths can be deleted' };
      return;
    }
    const resolvedAsset = resolveCardAssetTargetPath(imagePath);
    if (!resolvedAsset) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid file path' };
      return;
    }
    try {
      await unlink(resolvedAsset.targetPath);
      await assetStore?.markDeleted(imagePath);
      const canonicalAssetPath = `/card-assets/${resolvedAsset.normalizedRelative.replace(/\\/g, '/')}`;
      if (imagePath !== canonicalAssetPath) {
        await assetStore?.markDeleted(canonicalAssetPath);
      }
      await logLine('INFO', `image deleted: ${resolvedAsset.normalizedRelative}`);
      await auditAdminAction?.({ action: 'uploads.card-image.delete', ctx, success: true, details: { fileName: resolvedAsset.normalizedRelative } });
      ctx.body = { ok: true };
    } catch (error) {
      const errorMessage = String(error);
      const isNotFound = errorMessage.includes('ENOENT') || errorMessage.includes('no such file');
      await auditAdminAction?.({ action: 'uploads.card-image.delete', ctx, success: false, details: { fileName: resolvedAsset.normalizedRelative, error: errorMessage } });
      ctx.status = isNotFound ? 404 : 500;
      ctx.body = { ok: false, error: isNotFound ? 'File not found' : 'Failed to delete image' };
      await logLine('ERROR', `image delete failed (${resolvedAsset.normalizedRelative}): ${errorMessage}`);
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
    const descriptors = [
      { rootDir: uploadsDir, basePath: '/public/card-assets', kind: 'card-image' as const },
      { rootDir: avatarUploadsDir, basePath: '/profile-image', kind: 'avatar-image' },
      { rootDir: systemIconsDir, basePath: '/sys.icons', kind: 'system-icon' },
    ] as const;

    if (mode === 'records') {
      let cleaned = 0;
      for (const descriptor of descriptors) {
        const fileNames = await listRelativeFiles(descriptor.rootDir);
        const existingPaths = new Set<string>();
        for (const name of fileNames) {
          const normalizedName = name.replace(/\\/g, '/');
          if (descriptor.kind === 'card-image') {
            buildCardAssetAliases(normalizedName).forEach((alias) => existingPaths.add(alias));
          } else {
            existingPaths.add(`${descriptor.basePath}/${normalizedName}`);
          }
        }
        cleaned += await assetStore.purgeMissingFiles(existingPaths, descriptor.kind);
      }
      await auditAdminAction?.({ action: 'uploads.assets.cleanup', ctx, success: true, details: { mode, cleaned } });
      ctx.body = { ok: true, mode, cleaned };
      return;
    }

    let cleaned = 0;
    for (const descriptor of descriptors) {
      const knownPaths = await assetStore.listKnownPaths(descriptor.kind);
      const fileNames = await listRelativeFiles(descriptor.rootDir);
      for (const relativeName of fileNames) {
        const normalizedRelative = relativeName.replace(/\\/g, '/');
        const known = descriptor.kind === 'card-image'
          ? buildCardAssetAliases(normalizedRelative).some((alias) => knownPaths.has(alias))
          : knownPaths.has(`${descriptor.basePath}/${normalizedRelative}`);
        if (known) continue;
        try {
          await unlink(path.join(descriptor.rootDir, normalizedRelative));
          cleaned += 1;
        } catch {
          // ignore missing/locked file and continue cleanup
        }
      }
    }
    await auditAdminAction?.({ action: 'uploads.assets.cleanup', ctx, success: true, details: { mode, cleaned } });
    ctx.body = { ok: true, mode, cleaned };
  });
};
