import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike, RouteCtx } from './types';

type CmdResult = { ok: true; stdout: string; stderr: string } | { ok: false; error: string };
type RunGit = (args: string[]) => Promise<CmdResult>;
type RunShellCommand = (command: string, timeoutMs?: number) => Promise<CmdResult>;
type SpawnDetachedShell = (command: string) => void;
type GitUpdateStatusOk = {
  ok: true;
  branch: string;
  remote: string;
  upstream: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  canUpdate: boolean;
  head: string;
  note?: string;
  ignoredRuntimeDirtyFiles?: string[];
};
type GitUpdateStatusResult = GitUpdateStatusOk | { ok: false; error: string };
type MatchDbStateLike = { G?: unknown; ctx?: Record<string, unknown> | null } & Record<string, unknown>;
type MatchDbMetadataLike = { updatedAt?: number; gameover?: unknown } & Record<string, unknown>;
type MatchDbFetchResult = { state?: MatchDbStateLike | null; metadata?: MatchDbMetadataLike | null } | null;
type MatchDbLike = {
  fetch: (matchID: string, opts: { state?: boolean; metadata?: boolean; initialState?: boolean }) => Promise<MatchDbFetchResult & { initialState?: MatchDbStateLike | null }>;
  setState?: (matchID: string, state: unknown, deltalog?: unknown[]) => Promise<unknown>;
  setMetadata?: (matchID: string, metadata: unknown) => Promise<void>;
  wipe?: (matchID: string) => Promise<void>;
};

type AdminRoutesDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  getGitUpdateStatus: (runGit: RunGit) => Promise<GitUpdateStatusResult>;
  autoStashRuntimeNoise: (args: { status: { ignoredRuntimeDirtyFiles?: string[] }; runGit: RunGit; logLine: LogLine }) => Promise<{ ok: boolean; error?: string }>;
  runGit: RunGit;
  runShellCommand: RunShellCommand;
  spawnDetachedShell: SpawnDetachedShell;
  isAdminAuthEnabled: boolean;
  devRestartTouchPath: string;
  dbSchemaPath: string;
  importJsonConfigToDb: (draft?: {
    host: string;
    port: string;
    database: string;
    user: string;
    password?: string;
    sslMode?: 'disable' | 'require';
  }) => Promise<void>;
};

export const registerAdminRoutes = ({
  router,
  requireAdminAuth,
  enforceRateLimit,
  readJsonBodySafe,
  logLine,
  JSON_BODY_LIMIT,
  getGitUpdateStatus,
  autoStashRuntimeNoise,
  runGit,
  runShellCommand,
  spawnDetachedShell,
  isAdminAuthEnabled,
  devRestartTouchPath,
  dbSchemaPath,
  importJsonConfigToDb,
}: AdminRoutesDeps) => {
  const ADMIN_DB_SQL_BODY_LIMIT = Math.max(JSON_BODY_LIMIT, 32 * 1024 * 1024);
  router.get('/api/health', (ctx: RouteCtx) => {
    ctx.body = {
      ok: true,
      service: 'joj-game-server',
      now: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      port: Number(process.env.PORT ?? 8000),
      adminAuthEnabled: isAdminAuthEnabled,
    };
  });

  router.get('/api/admin/verify', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/verify'))) return;
    ctx.body = { ok: true, adminAuthEnabled: isAdminAuthEnabled };
  });

  router.post('/api/admin/db/test-connection', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/db/test-connection'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-test-connection', 20, 60_000))) return;
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/db/test-connection',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;

    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const port = typeof body.port === 'string' ? body.port.trim() : '';
    const database = typeof body.database === 'string' ? body.database.trim() : '';
    const user = typeof body.user === 'string' ? body.user.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const sslMode = body.sslMode === 'require' ? 'require' : 'disable';

    if (!host || !port || !database || !user) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing required DB connection fields' };
      return;
    }

    const result = await new Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }>((resolve) => {
      const child = spawn(
        'psql',
        ['-h', host, '-p', port, '-U', user, '-d', database, '-tA', '-c', 'SELECT 1;'],
        {
          env: {
            ...process.env,
            PGPASSWORD: password,
            PGSSLMODE: sslMode,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* noop */ }
      }, 8_000);
      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ ok: false, stdout, stderr, error: String(error) });
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ ok: code === 0 && stdout.trim() === '1', stdout, stderr });
      });
    });

    if (!result.ok) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: 'Failed to connect to PostgreSQL',
        details: (result.stderr || result.error || result.stdout || '').trim(),
      };
      return;
    }
    ctx.body = { ok: true, message: 'PostgreSQL connection successful' };
  });

  router.get('/api/admin/db/schema', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/db/schema'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-schema', 20, 60_000))) return;
    try {
      const content = await readFile(dbSchemaPath, 'utf8');
      ctx.body = { ok: true, filename: 'db.sql', content };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read db.sql', details: String(error) };
    }
  });

  router.post('/api/admin/db/import-schema', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/db/import-schema'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-import-schema', 5, 60_000))) return;
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/db/import-schema',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;

    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const port = typeof body.port === 'string' ? body.port.trim() : '';
    const database = typeof body.database === 'string' ? body.database.trim() : '';
    const user = typeof body.user === 'string' ? body.user.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const sslMode = body.sslMode === 'require' ? 'require' : 'disable';

    if (!host || !port || !database || !user) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing required DB connection fields' };
      return;
    }

    const result = await new Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }>((resolve) => {
      const child = spawn(
        'psql',
        ['-h', host, '-p', port, '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', dbSchemaPath],
        {
          env: {
            ...process.env,
            PGPASSWORD: password,
            PGSSLMODE: sslMode,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* noop */ }
      }, 60_000);
      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ ok: false, stdout, stderr, error: String(error) });
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ ok: code === 0, stdout, stderr });
      });
    });

    if (!result.ok) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: 'Failed to import db.sql',
        details: (result.stderr || result.error || result.stdout || '').trim(),
      };
      return;
    }
    ctx.body = { ok: true, message: 'db.sql imported successfully' };
  });

  router.post('/api/admin/db/import-json-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/db/import-json-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-import-json-config', 5, 60_000))) return;
    try {
      const body = await readJsonBodySafe({
        ctx,
        routeLabel: '/api/admin/db/import-json-config',
        maxBytes: JSON_BODY_LIMIT,
        logLine,
      });
      if (!body) return;
      const host = typeof body.host === 'string' ? body.host.trim() : '';
      const port = typeof body.port === 'string' ? body.port.trim() : '';
      const database = typeof body.database === 'string' ? body.database.trim() : '';
      const user = typeof body.user === 'string' ? body.user.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const sslMode = body.sslMode === 'require' ? 'require' : 'disable';
      if (!host || !port || !database || !user) {
        ctx.status = 400;
        ctx.body = { ok: false, error: 'Missing required DB connection fields' };
        return;
      }
      await importJsonConfigToDb({ host, port, database, user, password, sslMode });
      await logLine('INFO', 'admin imported shared JSON config into postgres');
      ctx.body = { ok: true, message: 'Shared JSON config imported into database' };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Failed to import shared JSON config into database', details: String(error) };
    }
  });

  router.post('/api/admin/db/export-backup', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/db/export-backup'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-export-backup', 5, 60_000))) return;
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/db/export-backup',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;

    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const port = typeof body.port === 'string' ? body.port.trim() : '';
    const database = typeof body.database === 'string' ? body.database.trim() : '';
    const user = typeof body.user === 'string' ? body.user.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const sslMode = body.sslMode === 'require' ? 'require' : 'disable';

    if (!host || !port || !database || !user) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing required DB connection fields' };
      return;
    }

    const result = await new Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }>((resolve) => {
      const child = spawn(
        'pg_dump',
        ['-h', host, '-p', port, '-U', user, '-d', database, '--no-owner', '--no-privileges'],
        {
          env: {
            ...process.env,
            PGPASSWORD: password,
            PGSSLMODE: sslMode,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* noop */ }
      }, 30_000);
      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ ok: false, stdout, stderr, error: String(error) });
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ ok: code === 0 && stdout.trim().length > 0, stdout, stderr });
      });
    });

    if (!result.ok) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: 'Failed to export PostgreSQL backup',
        details: (result.stderr || result.error || result.stdout || '').trim(),
      };
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ctx.body = {
      ok: true,
      filename: `joj-backup-${database}-${stamp}.sql`,
      content: result.stdout,
    };
  });

  router.post('/api/admin/db/restore-backup', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/db/restore-backup'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-restore-backup', 3, 60_000))) return;
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/db/restore-backup',
      maxBytes: ADMIN_DB_SQL_BODY_LIMIT,
      logLine,
    });
    if (!body) return;

    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const port = typeof body.port === 'string' ? body.port.trim() : '';
    const database = typeof body.database === 'string' ? body.database.trim() : '';
    const user = typeof body.user === 'string' ? body.user.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const sslMode = body.sslMode === 'require' ? 'require' : 'disable';
    const sql = typeof body.sql === 'string' ? body.sql : '';
    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';

    if (!host || !port || !database || !user) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing required DB connection fields' };
      return;
    }
    if (!sql.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing SQL content for restore' };
      return;
    }

    const result = await new Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }>((resolve) => {
      const child = spawn(
        'psql',
        ['-h', host, '-p', port, '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1'],
        {
          env: {
            ...process.env,
            PGPASSWORD: password,
            PGSSLMODE: sslMode,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* noop */ }
      }, 180_000);
      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ ok: false, stdout, stderr, error: String(error) });
      });
      child.stdin.on('error', () => {
        // process may exit before stdin flush; handled by close/error events above
      });
      child.stdin.write(sql, 'utf8', () => {
        try { child.stdin.end(); } catch { /* noop */ }
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ ok: code === 0, stdout, stderr });
      });
    });

    if (!result.ok) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: 'Failed to restore PostgreSQL backup',
        details: (result.stderr || result.error || result.stdout || '').trim(),
      };
      return;
    }

    ctx.body = {
      ok: true,
      message: `Backup restored successfully${filename ? ` (${filename})` : ''}`,
    };
  });

  router.get('/api/admin/match-state', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/match-state'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-state', 60, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    if (!dbCandidate || typeof dbFetch !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database is unavailable' };
      return;
    }
    const db = dbCandidate as MatchDbLike;

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

  router.post('/api/admin/match-stop', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/match-stop'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-stop', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    const dbSetState = (dbCandidate as { setState?: unknown } | undefined)?.setState;
    const dbSetMetadata = (dbCandidate as { setMetadata?: unknown } | undefined)?.setMetadata;
    if (!dbCandidate || typeof dbFetch !== 'function' || typeof dbSetState !== 'function' || typeof dbSetMetadata !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database stop controls are unavailable' };
      return;
    }
    const db = dbCandidate as MatchDbLike;

    const fetched = await db.fetch(matchID, { state: true, metadata: true });
    const state = fetched?.state;
    if (!state) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Match not found' };
      return;
    }

    const now = Date.now();
    const nextState: MatchDbStateLike = {
      ...state,
      ctx: {
        ...(state.ctx ?? {}),
        gameover: {
          forcedStop: true,
          stoppedAt: now,
        },
      },
    };
    const nextMetadata: MatchDbMetadataLike = {
      ...(fetched?.metadata ?? {}),
      updatedAt: now,
      gameover: { forcedStop: true, stoppedAt: now },
    };

    await db.setState?.(matchID, nextState);
    await db.setMetadata?.(matchID, nextMetadata);
    await logLine('WARN', `admin stopped match matchID=${matchID}`);

    ctx.body = {
      ok: true,
      matchID,
      stopped: true,
      snapshot: {
        G: nextState.G,
        ctx: nextState.ctx,
        updatedAt: now,
      },
    };
  });

  router.post('/api/admin/match-reset', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/match-reset'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-reset', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    const dbSetState = (dbCandidate as { setState?: unknown } | undefined)?.setState;
    const dbSetMetadata = (dbCandidate as { setMetadata?: unknown } | undefined)?.setMetadata;
    if (!dbCandidate || typeof dbFetch !== 'function' || typeof dbSetState !== 'function' || typeof dbSetMetadata !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database reset controls are unavailable' };
      return;
    }
    const db = dbCandidate as MatchDbLike;

    const fetched = await db.fetch(matchID, { state: true, metadata: true, initialState: true });
    const state = fetched?.state;
    const initialState = fetched?.initialState;
    if (!state || !initialState) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Match or initial state not found' };
      return;
    }

    const now = Date.now();
    const nextMetadata: MatchDbMetadataLike = {
      ...(fetched?.metadata ?? {}),
      updatedAt: now,
    };
    delete nextMetadata.gameover;

    await db.setState?.(matchID, initialState, []);
    await db.setMetadata?.(matchID, nextMetadata);
    await logLine('WARN', `admin reset match matchID=${matchID}`);

    ctx.body = {
      ok: true,
      matchID,
      reset: true,
      snapshot: {
        G: initialState.G,
        ctx: initialState.ctx,
        updatedAt: now,
      },
    };
  });

  router.post('/api/admin/match-delete', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/match-delete'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-delete', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbWipe = (dbCandidate as { wipe?: unknown } | undefined)?.wipe;
    if (!dbCandidate || typeof dbWipe !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database delete controls are unavailable' };
      return;
    }
    const db = dbCandidate as MatchDbLike;

    await db.wipe?.(matchID);
    await logLine('WARN', `admin deleted match matchID=${matchID}`);
    ctx.body = { ok: true, matchID, deleted: true };
  });

  router.get('/api/admin/git/status', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/status'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-status', 20, 60_000))) return;
    const result = await getGitUpdateStatus(runGit);
    if (!result.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status', details: result.error };
      await logLine('ERROR', `git status failed: ${result.error}`);
      return;
    }
    ctx.body = result;
  });

  router.post('/api/admin/restart', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/restart'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-restart', 5, 60_000))) return;
    const isPm2Managed =
      process.env.pm_id !== undefined ||
      process.env.PM2_HOME !== undefined ||
      process.env.name === 'joj-game-server';
    await logLine('WARN', `admin requested server restart (pm2Managed=${isPm2Managed ? 'yes' : 'no'})`);
    if (!isPm2Managed) {
      try {
        await mkdir(path.dirname(devRestartTouchPath), { recursive: true });
        await writeFile(devRestartTouchPath, `${Date.now()}\n`, 'utf8');
        ctx.body = { ok: true, message: 'Dev server restart triggered (file watch)' };
      } catch (error) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Failed to trigger watch-mode restart' };
        await logLine('ERROR', `dev restart trigger failed: ${String(error)}`);
      }
      return;
    }
    ctx.body = { ok: true, message: 'Server restart scheduled' };
    setTimeout(() => {
      process.exit(0);
    }, 150);
  });

  router.post('/api/admin/git/update', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/update'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-update', 5, 60_000))) return;
    const status = await getGitUpdateStatus(runGit);
    if (!status.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status before update', details: status.error };
      await logLine('ERROR', `git pre-update status failed: ${status.error}`);
      return;
    }
    if (status.dirty) {
      ctx.status = 409;
      ctx.body = { ok: false, error: 'Working tree has local changes. Commit or stash before update.', status };
      return;
    }
    const stashRuntime = await autoStashRuntimeNoise({ status, runGit, logLine });
    if (!stashRuntime.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to stash runtime files', details: stashRuntime.error, status };
      await logLine('ERROR', `git runtime stash failed: ${stashRuntime.error}`);
      return;
    }
    if (status.behind <= 0) {
      ctx.body = { ok: true, updated: false, message: 'Already up to date', status };
      return;
    }

    const pullRes = await runGit(['pull', '--ff-only']);
    if (!pullRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Git pull failed', details: pullRes.error, status };
      await logLine('ERROR', `git update failed: ${pullRes.error}`);
      return;
    }

    const nextStatus = await getGitUpdateStatus(runGit);
    if (!nextStatus.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status after update', details: nextStatus.error };
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

  router.post('/api/admin/git/deploy', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/deploy'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-deploy', 3, 60_000))) return;

    const status = await getGitUpdateStatus(runGit);
    if (!status.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status before deploy', details: status.error };
      await logLine('ERROR', `git pre-deploy status failed: ${status.error}`);
      return;
    }
    if (status.dirty) {
      ctx.status = 409;
      ctx.body = { ok: false, error: 'Working tree has local changes. Commit or stash before deploy.', status };
      return;
    }

    const stashRuntime = await autoStashRuntimeNoise({ status, runGit, logLine });
    if (!stashRuntime.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to stash runtime files', details: stashRuntime.error, status };
      await logLine('ERROR', `git runtime stash failed before deploy: ${stashRuntime.error}`);
      return;
    }

    const steps: Array<{ step: string; output?: string }> = [];

    if (status.behind > 0) {
      const pullRes = await runGit(['pull', '--ff-only']);
      if (!pullRes.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Git pull failed', details: pullRes.error, status };
        await logLine('ERROR', `git deploy pull failed: ${pullRes.error}`);
        return;
      }
      steps.push({ step: 'git pull --ff-only', output: pullRes.stdout.trim() || pullRes.stderr.trim() || '(ok)' });
    } else {
      steps.push({ step: 'git pull --ff-only', output: 'Already up to date' });
    }

    let installRes = await runShellCommand('npm ci --include=dev', 30 * 60_000);
    if (!installRes.ok) {
      await logLine('WARN', `deploy npm ci --include=dev failed, falling back to npm install --include=dev: ${installRes.error}`);
      steps.push({ step: 'npm ci --include=dev', output: `FAILED (fallback to npm install --include=dev): ${installRes.error}` });
      installRes = await runShellCommand('npm install --include=dev', 30 * 60_000);
      if (!installRes.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'npm install failed', details: installRes.error, steps };
        await logLine('ERROR', `deploy npm install --include=dev failed: ${installRes.error}`);
        return;
      }
      steps.push({ step: 'npm install --include=dev', output: installRes.stdout.trim() || '(ok)' });
    } else {
      steps.push({ step: 'npm ci --include=dev', output: installRes.stdout.trim() || '(ok)' });
    }

    const tscRes = await runShellCommand('npm run typecheck', 20 * 60_000);
    if (!tscRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'TypeScript build failed', details: tscRes.error, steps };
      await logLine('ERROR', `deploy tsc failed: ${tscRes.error}`);
      return;
    }
    steps.push({ step: 'npm run typecheck', output: tscRes.stdout.trim() || '(ok)' });

    const viteRes = await runShellCommand('npm run build', 30 * 60_000);
    if (!viteRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Vite build failed', details: viteRes.error, steps };
      await logLine('ERROR', `deploy vite build failed: ${viteRes.error}`);
      return;
    }
    steps.push({ step: 'npm run build', output: viteRes.stdout.trim() || '(ok)' });

    const nextStatus = await getGitUpdateStatus(runGit);
    if (!nextStatus.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status after deploy', details: nextStatus.error, steps };
      await logLine('ERROR', `git post-deploy status failed: ${nextStatus.error}`);
      return;
    }

    await logLine('WARN', `admin deploy completed; scheduling PM2 restart; head=${nextStatus.head}`);
    ctx.body = {
      ok: true,
      message: 'Update, build and restart scheduled',
      restarted: true,
      steps,
      status: nextStatus,
    };

    setTimeout(() => {
      try {
        spawnDetachedShell('pm2 restart ecosystem.config.cjs --update-env');
      } catch {
        process.exit(0);
      }
    }, 300);
  });
};
