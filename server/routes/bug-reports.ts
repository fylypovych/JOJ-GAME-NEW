import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';
import { getClientIp } from '../request-utils';
import { getCurrentUserFromRequest } from '../services/user-auth';
import type { UserStore } from '../services/user-store';
import type { BugReportStatus } from '../services/bug-report-store';
import { loadAppSettingJson, saveAppSettingJson } from '../services/app-settings-store';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouteCtx, RouterLike } from './types';

type BugReportStoreLike = {
  create: (input: {
    description: string;
    screenshot?: { mime: string; buffer: Buffer } | null;
    pageUrl?: string;
    matchID?: string | null;
    playerID?: string | null;
    playerName?: string | null;
    spectator?: boolean;
    uiVariant?: string | null;
    lang?: string | null;
    userAgent?: string | null;
    sourceIp?: string | null;
    submittedBy?: { userId?: string | null; username?: string | null; displayName?: string | null } | null;
  }) => Promise<any>;
  list: () => Promise<any[]>;
  getById: (id: string) => Promise<any | null>;
  updateStatus: (id: string, status: BugReportStatus) => Promise<any | null>;
  getImagePathById: (id: string) => Promise<{ absPath?: string; buffer?: Buffer; mime: string } | null>;
};

const BUG_REPORT_UI_CONFIG_KEY = 'bug_report_ui_config';

const isStatus = (value: unknown): value is BugReportStatus =>
  value === 'new' || value === 'resolved' || value === 'closed';

const parseScreenshotDataUrl = (value: unknown): { mime: string; buffer: Buffer } | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error('Invalid screenshot payload.');
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const summarize = (report: any) => {
  if (!report) return null;
  return {
    id: report.id,
    status: report.status,
    descriptionPreview: String(report.description ?? '').slice(0, 160),
    hasScreenshot: Boolean(report.screenshotFileName),
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    matchID: report.matchID,
    playerName: report.playerName,
    spectator: report.spectator,
    uiVariant: report.uiVariant,
    lang: report.lang,
    submittedBy: report.submittedBy,
  };
};

export const registerBugReportRoutes = (args: {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  IMAGE_UPLOAD_BODY_LIMIT: number;
  bugReportStore: BugReportStoreLike;
  bugReportUiConfigPath: string;
  uploadsDir: string;
  userStore?: UserStore | null;
  pool?: Pool | null;
  assetStore?: {
    getByPath: (assetPath: string) => Promise<{ fileName: string; mime: string; deletedAt: string | null } | null>;
  } | null;
}) => {
  const {
    router,
    requireAdminAuth,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT,
    IMAGE_UPLOAD_BODY_LIMIT,
    bugReportStore,
    bugReportUiConfigPath,
    uploadsDir,
    userStore,
    pool,
    assetStore,
  } = args;

  const readBugReportUiConfig = async () => {
    const stored = await loadAppSettingJson<{ imagePath?: string }>(pool, BUG_REPORT_UI_CONFIG_KEY);
    if (stored) {
      return {
        imagePath: typeof stored.imagePath === 'string' ? stored.imagePath.trim() : '',
      };
    }
    try {
      const raw = await readFile(bugReportUiConfigPath, 'utf8');
      const parsed = JSON.parse(raw) as { imagePath?: string };
      const migrated = {
        imagePath: typeof parsed.imagePath === 'string' ? parsed.imagePath.trim() : '',
      };
      if (pool) {
        await saveAppSettingJson(pool, BUG_REPORT_UI_CONFIG_KEY, { ...migrated, updatedAt: Date.now() }, 'migration-bug-report-ui');
      }
      return migrated;
    } catch {
      return { imagePath: '' };
    }
  };

  router.get('/api/bug-reports/ui-config', async (ctx: RouteCtx) => {
    const config = await readBugReportUiConfig();
    ctx.body = { ok: true, imagePath: config.imagePath };
  });

  router.get('/api/bug-reports/ui-image', async (ctx: RouteCtx) => {
    const requestedImagePath = typeof ctx?.query?.path === 'string' ? ctx.query.path.trim() : '';
    const config = requestedImagePath ? null : await readBugReportUiConfig();
    const imagePath = requestedImagePath || config?.imagePath || '';
    if (!imagePath.startsWith('/cards/')) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Bug report image is not configured.' };
      return;
    }
    const fileName = path.basename(imagePath);
    if (!fileName || fileName === '.' || fileName === '..') {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid bug report image path.' };
      return;
    }
    const assetMeta = await assetStore?.getByPath(imagePath);
    if (assetMeta?.deletedAt) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Bug report image was deleted.' };
      return;
    }
    const absPath = path.join(uploadsDir, fileName);
    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(absPath);
    } catch {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Bug report image file not found.' };
      return;
    }
    const ext = path.extname(fileName).toLowerCase();
    const mime = assetMeta?.mime ?? (
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/webp'
    );
    ctx.status = 200;
    if (typeof (ctx as { set?: (name: string, value: string) => void }).set === 'function') {
      (ctx as { set: (name: string, value: string) => void }).set('Content-Type', mime);
      (ctx as { set: (name: string, value: string) => void }).set('Cache-Control', 'public, max-age=300');
    }
    ctx.body = fileBuffer;
  });

  router.post('/api/bug-reports', async (ctx: RouteCtx) => {
    if (!(await enforceRateLimit(ctx, 'bug-report-submit', 10, 15 * 60_000))) return;
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/bug-reports',
      maxBytes: IMAGE_UPLOAD_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const description = String(body.description ?? '').trim();
    if (description.length < 8) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Description is too short.' };
      return;
    }
    try {
      const currentUser = userStore ? await getCurrentUserFromRequest(ctx, userStore) : null;
      const record = await bugReportStore.create({
        description,
        screenshot: parseScreenshotDataUrl(body.screenshotDataUrl),
        pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl : '',
        matchID: typeof body.matchID === 'string' ? body.matchID : null,
        playerID: typeof body.playerID === 'string' ? body.playerID : null,
        playerName: typeof body.playerName === 'string' ? body.playerName : null,
        spectator: body.spectator === true,
        uiVariant: typeof body.uiVariant === 'string' ? body.uiVariant : null,
        lang: typeof body.lang === 'string' ? body.lang : null,
        userAgent: typeof ctx?.request?.headers?.['user-agent'] === 'string' ? ctx.request.headers['user-agent'] : '',
        sourceIp: getClientIp(ctx),
        submittedBy: currentUser ? {
          userId: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
        } : null,
      });
      ctx.body = { ok: true, report: summarize(record) };
      await logLine('WARN', `bug-report submitted id=${record.id} matchID=${record.matchID ?? '-'} player=${record.playerName ?? record.submittedBy.username ?? '-'}`);
    } catch (error) {
      ctx.status = 400;
      ctx.body = { ok: false, error: String(error instanceof Error ? error.message : error) };
    }
  });

  router.get('/api/admin/bug-reports', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/bug-reports'))) return;
    const reports = await bugReportStore.list();
    ctx.body = { ok: true, reports: reports.map((report) => summarize(report)) };
  });

  router.get('/api/admin/bug-reports/ui-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/bug-reports/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-bug-report-ui-config-get', 30, 60_000))) return;
    const config = await readBugReportUiConfig();
    ctx.body = { ok: true, imagePath: config.imagePath };
  });

  router.get('/api/admin/bug-reports/detail', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/bug-reports/detail'))) return;
    const id = typeof ctx?.query?.id === 'string' ? ctx.query.id.trim() : '';
    if (!id) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing report id.' };
      return;
    }
    const report = await bugReportStore.getById(id);
    if (!report) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Bug report not found.' };
      return;
    }
    ctx.body = { ok: true, report: { ...report, hasScreenshot: Boolean(report.screenshotFileName) } };
  });

  router.get('/api/admin/bug-reports/image', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/bug-reports/image'))) return;
    const id = typeof ctx?.query?.id === 'string' ? ctx.query.id.trim() : '';
    if (!id) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing report id.' };
      return;
    }
    const image = await bugReportStore.getImagePathById(id);
    if (!image) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Screenshot not found.' };
      return;
    }
    ctx.status = 200;
    if (typeof (ctx as { set?: (name: string, value: string) => void }).set === 'function') {
      (ctx as { set: (name: string, value: string) => void }).set('Content-Type', image.mime);
      (ctx as { set: (name: string, value: string) => void }).set('Cache-Control', 'private, max-age=60');
    }
    ctx.body = image.buffer ?? await readFile(String(image.absPath));
  });

  router.post('/api/admin/bug-reports/status', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/bug-reports/status'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-bug-report-status', 60, 60_000))) return;
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/bug-reports/status',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const id = String(body.id ?? '').trim();
    const status = body.status;
    if (!id || !isStatus(status)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid bug report status update.' };
      return;
    }
    const updated = await bugReportStore.updateStatus(id, status);
    if (!updated) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Bug report not found.' };
      return;
    }
    ctx.body = { ok: true, report: summarize(updated) };
  });

  router.post('/api/admin/bug-reports/ui-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/bug-reports/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-bug-report-ui-config-post', 20, 60_000))) return;
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/bug-reports/ui-config',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const imagePath = typeof body.imagePath === 'string' ? body.imagePath.trim() : '';
    try {
      if (pool) {
        await saveAppSettingJson(pool, BUG_REPORT_UI_CONFIG_KEY, { imagePath, updatedAt: Date.now() }, 'admin-bug-report-ui');
        ctx.body = { ok: true, imagePath };
        return;
      }
      const dir = bugReportUiConfigPath.replace(/[\\/][^\\/]+$/, '');
      await mkdir(dir, { recursive: true });
      await writeFile(
        bugReportUiConfigPath,
        `${JSON.stringify({ imagePath, updatedAt: Date.now() }, null, 2)}\n`,
        'utf8',
      );
      ctx.body = { ok: true, imagePath };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { ok: false, error: String(error instanceof Error ? error.message : error) };
    }
  });
};
