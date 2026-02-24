import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
}: any) => {
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
    const result = await getGitUpdateStatus(runGit);
    if (!result.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status', details: result.error };
      await logLine('ERROR', `git status failed: ${result.error}`);
      return;
    }
    ctx.body = result;
  });

  router.post('/api/admin/restart', async (ctx: any) => {
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

  router.post('/api/admin/git/update', async (ctx: any) => {
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

  router.post('/api/admin/git/deploy', async (ctx: any) => {
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

    const tscRes = await runShellCommand('npx tsc -b', 20 * 60_000);
    if (!tscRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'TypeScript build failed', details: tscRes.error, steps };
      await logLine('ERROR', `deploy tsc failed: ${tscRes.error}`);
      return;
    }
    steps.push({ step: 'npx tsc -b', output: tscRes.stdout.trim() || '(ok)' });

    const viteRes = await runShellCommand('npx vite build', 30 * 60_000);
    if (!viteRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Vite build failed', details: viteRes.error, steps };
      await logLine('ERROR', `deploy vite build failed: ${viteRes.error}`);
      return;
    }
    steps.push({ step: 'npx vite build', output: viteRes.stdout.trim() || '(ok)' });

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
