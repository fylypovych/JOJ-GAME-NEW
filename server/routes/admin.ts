import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EnforceRateLimit, LogLine, RequireAdminAuth, RouterLike, RouteCtx } from './types';

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
  logLine: LogLine;
  getGitUpdateStatus: (runGit: RunGit) => Promise<GitUpdateStatusResult>;
  autoStashRuntimeNoise: (args: { status: { ignoredRuntimeDirtyFiles?: string[] }; runGit: RunGit; logLine: LogLine }) => Promise<{ ok: boolean; error?: string }>;
  runGit: RunGit;
  runShellCommand: RunShellCommand;
  spawnDetachedShell: SpawnDetachedShell;
  isAdminAuthEnabled: boolean;
  devRestartTouchPath: string;
};

export const registerAdminRoutes = ({
  router,
  requireAdminAuth,
  enforceRateLimit,
  logLine,
  getGitUpdateStatus,
  autoStashRuntimeNoise,
  runGit,
  runShellCommand,
  spawnDetachedShell,
  isAdminAuthEnabled,
  devRestartTouchPath,
}: AdminRoutesDeps) => {
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

    const installRes = await runShellCommand('npm install', 30 * 60_000);
    if (!installRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'npm install failed', details: installRes.error, steps };
      await logLine('ERROR', `deploy npm install failed: ${installRes.error}`);
      return;
    }
    steps.push({ step: 'npm install', output: installRes.stdout.trim() || '(ok)' });

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
