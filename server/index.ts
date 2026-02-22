import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  exportSharedDeckTemplateJson,
  getSharedRanks,
  getSharedDeckTemplateStats,
  importSharedDeckTemplateJson,
  jojGame,
  resetSharedRanks,
  resetSharedDeckTemplate,
  setSharedRanks,
} from '../src/game/jojGame';

const require = createRequire(import.meta.url);
const { Server, FlatFile } = require('boardgame.io/server') as {
  FlatFile: new (args: { dir: string; logging?: boolean }) => unknown;
  Server: (args: { games: unknown[]; origins?: string[]; db?: unknown }) => {
    run: (port: number, callback?: () => void) => void;
  };
};

const logsPath = path.resolve(process.cwd(), 'logs', 'server.log');
const matchesDbDir = path.resolve(process.cwd(), 'database', 'matches');
const envPath = path.resolve(process.cwd(), '.env');
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

const JSON_BODY_LIMIT = 2 * 1024 * 1024;
const LARGE_JSON_BODY_LIMIT = 8 * 1024 * 1024;
const IMAGE_UPLOAD_BODY_LIMIT = 16 * 1024 * 1024;

class BodyTooLargeError extends Error {
  readonly code = 'BODY_TOO_LARGE';
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds limit (${maxBytes} bytes)`);
    this.name = 'BodyTooLargeError';
  }
}

const loadEnvFile = () => {
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // .env is optional
  }
};

loadEnvFile();

const adminToken = (process.env.ADMIN_TOKEN ?? '').trim();
const isAdminAuthEnabled = adminToken.length > 0;

const logLine = async (level: 'INFO' | 'WARN' | 'ERROR', message: string) => {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  try {
    await mkdir(path.dirname(logsPath), { recursive: true });
    await appendFile(logsPath, line, 'utf8');
  } catch {
    // ignore logging failures
  }
  // eslint-disable-next-line no-console
  console.log(line.trimEnd());
};

const server = Server({
  games: [jojGame],
  origins: [process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'],
  db: new FlatFile({ dir: matchesDbDir, logging: false }),
});
const router = (server as { router?: any }).router;
const templatePath = path.resolve(process.cwd(), 'database', 'shared-deck-template.json');
const ranksPath = path.resolve(process.cwd(), 'database', 'shared-ranks.json');
const uploadsDir = path.resolve(process.cwd(), 'public', 'cards');
const repoDir = process.cwd();

const getClientIp = (ctx: any): string => {
  const forwarded = ctx?.request?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return String(ctx?.ip ?? ctx?.request?.ip ?? 'unknown');
};

const getAdminTokenFromRequest = (ctx: any): string => {
  const authHeader = ctx?.request?.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const xToken = ctx?.request?.headers?.['x-admin-token'];
  return typeof xToken === 'string' ? xToken.trim() : '';
};

const requireAdminAuth = async (ctx: any, routeLabel: string): Promise<boolean> => {
  if (!isAdminAuthEnabled) return true;
  const token = getAdminTokenFromRequest(ctx);
  if (token === adminToken) return true;
  ctx.status = 401;
  ctx.body = { ok: false, error: 'Unauthorized' };
  await logLine('WARN', `unauthorized route=${routeLabel} ip=${getClientIp(ctx)}`);
  return false;
};

const enforceRateLimit = async (
  ctx: any,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<boolean> => {
  const now = Date.now();
  const key = `${bucket}:${getClientIp(ctx)}`;
  const current = rateLimitState.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitState.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  current.count += 1;
  if (current.count <= limit) return true;

  const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  if (typeof ctx?.set === 'function') ctx.set('Retry-After', String(retryAfterSec));
  ctx.status = 429;
  ctx.body = { ok: false, error: 'Too many requests', retryAfterSec };
  await logLine('WARN', `rate-limit hit bucket=${bucket} ip=${getClientIp(ctx)}`);
  return false;
};

const readJsonBody = async (ctx: any, maxBytes = JSON_BODY_LIMIT): Promise<Record<string, unknown>> => {
  const existingBody = ctx?.request?.body;
  if (existingBody && typeof existingBody === 'object') {
    return existingBody as Record<string, unknown>;
  }

  const req = ctx?.req;
  if (!req || typeof req.on !== 'function') return {};

  const raw = await new Promise<string>((resolve, reject) => {
    let data = '';
    let size = 0;
    let done = false;
    const fail = (error: Error) => {
      if (done) return;
      done = true;
      reject(error);
    };
    const succeed = (value: string) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on('data', (chunk: Buffer | string) => {
      const chunkText = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      size += Buffer.byteLength(chunkText, 'utf8');
      if (size > maxBytes) {
        fail(new BodyTooLargeError(maxBytes));
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      data += chunkText;
    });
    req.on('end', () => succeed(data));
    req.on('error', (error: Error) => fail(error));
  });

  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const readJsonBodySafe = async (
  ctx: any,
  routeLabel: string,
  maxBytes = JSON_BODY_LIMIT,
): Promise<Record<string, unknown> | null> => {
  try {
    return await readJsonBody(ctx, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      ctx.status = 413;
      ctx.body = { ok: false, error: `Payload too large. Limit: ${error.maxBytes} bytes` };
      await logLine('WARN', `payload-too-large route=${routeLabel} ip=${getClientIp(ctx)} limit=${error.maxBytes}`);
      return null;
    }
    ctx.status = 400;
    ctx.body = { ok: false, error: 'Invalid request body' };
    await logLine('WARN', `invalid-body route=${routeLabel} ip=${getClientIp(ctx)} error=${String(error)}`);
    return null;
  }
};

const runGit = async (args: string[]): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; error: string }> =>
  new Promise((resolve) => {
    execFile('git', args, { cwd: repoDir, windowsHide: true, timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error: String(stderr || error.message || error) });
        return;
      }
      resolve({ ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });

const getGitUpdateStatus = async () => {
  const branchRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branchRes.ok) return { ok: false as const, error: branchRes.error };
  const branch = branchRes.stdout.trim();

  const remoteRes = await runGit(['remote', 'get-url', 'origin']);
  const remote = remoteRes.ok ? remoteRes.stdout.trim() : '';

  const fetchRes = await runGit(['fetch', '--prune', 'origin']);
  if (!fetchRes.ok) return { ok: false as const, error: fetchRes.error };

  const statusRes = await runGit(['status', '--porcelain']);
  if (!statusRes.ok) return { ok: false as const, error: statusRes.error };
  const dirty = statusRes.stdout.trim().length > 0;

  const headRes = await runGit(['rev-parse', 'HEAD']);
  if (!headRes.ok) return { ok: false as const, error: headRes.error };
  const head = headRes.stdout.trim();

  const upstreamRes = await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!upstreamRes.ok) {
    return {
      ok: true as const,
      branch,
      remote,
      upstream: '',
      ahead: 0,
      behind: 0,
      dirty,
      canUpdate: false,
      head,
      note: 'No upstream branch configured',
    };
  }
  const upstream = upstreamRes.stdout.trim();

  const countsRes = await runGit(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
  if (!countsRes.ok) return { ok: false as const, error: countsRes.error };
  const [aheadStr, behindStr] = countsRes.stdout.trim().split(/\s+/);
  const ahead = Number(aheadStr || 0);
  const behind = Number(behindStr || 0);

  return {
    ok: true as const,
    branch,
    remote,
    upstream,
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
    dirty,
    canUpdate: !dirty && (Number.isFinite(behind) ? behind : 0) > 0,
    head,
    note: dirty ? 'Working tree has local changes' : undefined,
  };
};

const saveTemplateToDisk = async () => {
  await mkdir(path.dirname(templatePath), { recursive: true });
  await writeFile(templatePath, exportSharedDeckTemplateJson(), 'utf8');
};

const saveRanksToDisk = async () => {
  await mkdir(path.dirname(ranksPath), { recursive: true });
  await writeFile(ranksPath, JSON.stringify(getSharedRanks(), null, 2), 'utf8');
};

const loadTemplateFromDisk = async () => {
  try {
    const raw = await readFile(templatePath, 'utf8');
    const result = importSharedDeckTemplateJson(raw);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[template] invalid saved template, fallback to default: ${result.error}`);
      await saveTemplateToDisk();
    }
  } catch {
    await saveTemplateToDisk();
  }
};

const loadRanksFromDisk = async () => {
  try {
    const raw = await readFile(ranksPath, 'utf8');
    const parsed = JSON.parse(raw);
    const ok = setSharedRanks(parsed);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn('[ranks] invalid saved ranks, fallback to default');
      resetSharedRanks();
      await saveRanksToDisk();
    }
  } catch {
    await saveRanksToDisk();
  }
};

if (router) {
  router.get('/api/health', (ctx: any) => {
    ctx.body = {
      ok: true,
      service: 'joj-game-server',
      now: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      port: Number(process.env.PORT ?? 8000),
      adminAuthEnabled: isAdminAuthEnabled,
    };
  });

  router.get('/api/admin/verify', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/verify'))) return;
    ctx.body = { ok: true, adminAuthEnabled: isAdminAuthEnabled };
  });

  router.get('/api/admin/match-state', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/match-state'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-state', 60, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const db = ctx?.db ?? ctx?.app?.context?.db;
    if (!db || typeof db.fetch !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database is unavailable' };
      return;
    }

    const fetched = await db.fetch(matchID, { state: true, metadata: true });
    const state = fetched?.state;
    const metadata = fetched?.metadata;
    if (!state) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Match not found' };
      return;
    }

    ctx.body = {
      ok: true,
      snapshot: {
        G: state.G,
        ctx: state.ctx,
        updatedAt: metadata?.updatedAt ?? Date.now(),
      },
    };
  });

  router.get('/api/admin/git/status', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/status'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-status', 20, 60_000))) return;
    const result = await getGitUpdateStatus();
    if (!result.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: result.error };
      await logLine('ERROR', `git status failed: ${result.error}`);
      return;
    }
    ctx.body = result;
  });

  router.get('/api/shared-deck-template', (ctx: any) => {
    ctx.body = {
      json: exportSharedDeckTemplateJson(),
      stats: getSharedDeckTemplateStats(),
    };
  });

  router.get('/api/shared-ranks', (ctx: any) => {
    ctx.body = { ranks: getSharedRanks() };
  });

  router.post('/api/shared-ranks', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/shared-ranks'))) return;
    if (!(await enforceRateLimit(ctx, 'shared-ranks-write', 20, 60_000))) return;
    const body = await readJsonBodySafe(ctx, '/api/shared-ranks', JSON_BODY_LIMIT);
    if (!body) return;
    const ranks = body.ranks;
    if (!Array.isArray(ranks)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing ranks array' };
      return;
    }
    const ok = setSharedRanks(ranks);
    if (!ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid ranks schema' };
      return;
    }
    await saveRanksToDisk();
    await logLine('INFO', `shared-ranks updated (${ranks.length} rows)`);
    ctx.body = { ok: true, ranks: getSharedRanks() };
  });

  router.post('/api/shared-ranks/reset', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/shared-ranks/reset'))) return;
    if (!(await enforceRateLimit(ctx, 'shared-ranks-reset', 10, 60_000))) return;
    resetSharedRanks();
    await saveRanksToDisk();
    await logLine('INFO', 'shared-ranks reset to default');
    ctx.body = { ok: true, ranks: getSharedRanks() };
  });

  router.post('/api/shared-deck-template/import', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/shared-deck-template/import'))) return;
    if (!(await enforceRateLimit(ctx, 'template-import', 10, 60_000))) return;
    const body = await readJsonBodySafe(ctx, '/api/shared-deck-template/import', LARGE_JSON_BODY_LIMIT);
    if (!body) return;
    const json = body.json;
    if (typeof json !== 'string') {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing json string' };
      return;
    }
    const result = importSharedDeckTemplateJson(json);
    if (!result.ok) {
      ctx.status = 400;
      ctx.body = result;
      return;
    }
    await saveTemplateToDisk();
    await logLine('INFO', 'shared-deck-template imported');
    ctx.body = { ok: true, stats: getSharedDeckTemplateStats() };
  });

  router.post('/api/shared-deck-template/reset', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/shared-deck-template/reset'))) return;
    if (!(await enforceRateLimit(ctx, 'template-reset', 10, 60_000))) return;
    resetSharedDeckTemplate();
    await saveTemplateToDisk();
    await logLine('INFO', 'shared-deck-template reset to default');
    ctx.body = { ok: true, stats: getSharedDeckTemplateStats() };
  });

  router.post('/api/upload-card-image', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/upload-card-image'))) return;
    if (!(await enforceRateLimit(ctx, 'upload-card-image', 20, 60_000))) return;
    const body = await readJsonBodySafe(ctx, '/api/upload-card-image', IMAGE_UPLOAD_BODY_LIMIT);
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

  router.post('/api/admin/restart', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/restart'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-restart', 5, 60_000))) return;
    ctx.body = { ok: true, message: 'Server restart scheduled' };
    await logLine('WARN', 'admin requested server restart');
    setTimeout(() => {
      process.exit(0);
    }, 150);
  });

  router.post('/api/admin/git/update', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/update'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-update', 5, 60_000))) return;
    const status = await getGitUpdateStatus();
    if (!status.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: status.error };
      await logLine('ERROR', `git pre-update status failed: ${status.error}`);
      return;
    }
    if (status.dirty) {
      ctx.status = 409;
      ctx.body = { ok: false, error: 'Working tree has local changes. Commit or stash before update.', status };
      return;
    }
    if (status.behind <= 0) {
      ctx.body = { ok: true, updated: false, message: 'Already up to date', status };
      return;
    }

    const pullRes = await runGit(['pull', '--ff-only']);
    if (!pullRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: pullRes.error, status };
      await logLine('ERROR', `git update failed: ${pullRes.error}`);
      return;
    }

    const nextStatus = await getGitUpdateStatus();
    if (!nextStatus.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: nextStatus.error };
      await logLine('ERROR', `git post-update status failed: ${nextStatus.error}`);
      return;
    }

    await logLine('WARN', `git update applied on branch=${status.branch}; pull output=${pullRes.stdout.trim() || '(no output)'}`);
    ctx.body = {
      ok: true,
      updated: true,
      message: 'Update applied',
      output: pullRes.stdout.trim(),
      status: nextStatus,
    };
  });
}

const port = Number(process.env.PORT ?? 8000);

void (async () => {
  await loadTemplateFromDisk();
  await loadRanksFromDisk();
  await logLine(
    isAdminAuthEnabled ? 'INFO' : 'WARN',
    isAdminAuthEnabled ? 'admin auth enabled (ADMIN_TOKEN set)' : 'admin auth disabled (ADMIN_TOKEN is empty)',
  );
  server.run(port, () => {
    void logLine('INFO', `boardgame.io server running at http://localhost:${port}`);
  });
})();
