import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike, RouteCtx } from '../routes/types';
import { routeError, routeOk } from '../routes/response';

type CmdResult = { ok: true; stdout: string; stderr: string } | { ok: false; error: string };
type RunGit = (args: string[]) => Promise<CmdResult>;
type RunShellCommand = (command: string, timeoutMs?: number) => Promise<CmdResult>;
type SpawnDetachedShell = (command: string) => void;
type GitAuthStatus = {
  helper: string;
  helperConfigured: boolean;
  hasGithubCredentials: boolean;
  savedUsername: string;
  credentialsPath: string;
  remoteAuthMode: 'https' | 'ssh' | 'other';
};
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

type GitOpDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  requireAdminWriteAccess: (ctx: RouteCtx, routeLabel: string) => Promise<boolean>;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  getGitUpdateStatus: (runGit: RunGit) => Promise<GitUpdateStatusResult>;
  getGitAuthStatus: (runGit: RunGit) => Promise<GitAuthStatus>;
  autoStashRuntimeNoise: (args: { status: { ignoredRuntimeDirtyFiles?: string[] }; runGit: RunGit; logLine: LogLine }) => Promise<{ ok: boolean; error?: string }>;
  runGit: RunGit;
  runShellCommand: RunShellCommand;
  spawnDetachedShell: SpawnDetachedShell;
  devRestartTouchPath: string;
};

const getHeaderValue = (ctx: RouteCtx, name: string) => {
  const headers = ctx?.request?.headers ?? {};
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return typeof value === 'string' ? value.trim() : '';
};

const buildAdminDeployLog = (args: {
  action: 'deploy' | 'update' | 'publish';
  route: string;
  correlationId: string;
  actor: string;
  durationMs: number;
  outcome: 'success' | 'error';
  details?: Record<string, unknown>;
}) => JSON.stringify({
  event: 'admin_git_ops',
  action: args.action,
  route: args.route,
  correlationId: args.correlationId,
  actor: args.actor,
  durationMs: Math.max(0, Math.floor(args.durationMs)),
  outcome: args.outcome,
  ...(args.details ?? {}),
});

const stashAllLocalGitChanges = async (runGit: RunGit) => {
  const stashRes = await runGit(['stash', 'push', '-u', '-m', 'admin-auto-stash-local-changes']);
  if (!stashRes.ok) return { ok: false as const, error: stashRes.error };
  const output = stashRes.stdout.trim() || stashRes.stderr.trim();
  return {
    ok: true as const,
    output: output || 'Local changes were stashed.',
  };
};

export const registerAdminGitRoutes = ({
  router,
  requireAdminAuth,
  requireAdminWriteAccess,
  enforceRateLimit,
  readJsonBodySafe,
  logLine,
  JSON_BODY_LIMIT,
  getGitUpdateStatus,
  getGitAuthStatus,
  autoStashRuntimeNoise,
  runGit,
  runShellCommand,
  spawnDetachedShell,
  devRestartTouchPath,
}: GitOpDeps) => {
  router.get('/api/admin/git/status', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/status'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-status', 20, 60_000))) return;
    const result = await getGitUpdateStatus(runGit);
    if (!result.ok) {
      await logLine('ERROR', `git status failed: ${result.error}`);
      routeError(ctx, 500, 'Failed to read Git status', { details: result.error });
      return;
    }
    ctx.body = result;
  });

  router.get('/api/admin/git/auth-status', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/auth-status'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-auth-status', 20, 60_000))) return;
    try {
      routeOk(ctx, await getGitAuthStatus(runGit));
    } catch (error) {
      const details = String(error instanceof Error ? error.message : error);
      await logLine('ERROR', `git auth status failed: ${details}`);
      routeError(ctx, 500, 'Failed to read GitHub auth status', { details });
    }
  });

  router.post('/api/admin/git/auth-configure', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/git/auth-configure'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-auth-configure', 10, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/git/auth-configure', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    await logLine('WARN', 'admin attempted to configure git credentials via API; operation is disabled');
    routeError(ctx, 410, 'Server-side Git credential persistence is disabled. Use SSH auth or env-based token injection.');
  });

  router.post('/api/admin/restart', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/restart'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-restart', 5, 60_000))) return;
    const isPm2Managed =
      process.env.pm_id !== undefined ||
      process.env.PM2_HOME !== undefined ||
      process.env.name === 'joj-game-server';
    await logLine('WARN', `admin requested server restart (pm2Managed=${isPm2Managed ? 'yes' : 'no'})`);
    if (!isPm2Managed) {
      routeOk(ctx, { message: 'Dev server restart scheduled (file watch)' });
      setTimeout(async () => {
        try {
          await mkdir(path.dirname(devRestartTouchPath), { recursive: true });
          await writeFile(devRestartTouchPath, `${Date.now()}\n`, 'utf8');
        } catch (error) {
          await logLine('ERROR', `dev restart trigger failed: ${String(error)}`);
        }
      }, 250);
      return;
    }
    routeOk(ctx, { message: 'Server restart scheduled' });
    setTimeout(() => {
      process.exit(0);
    }, 400);
  });

  router.post('/api/admin/git/update', async (ctx: RouteCtx) => {
    const startedAt = Date.now();
    const correlationId = getHeaderValue(ctx, 'x-request-id') || getHeaderValue(ctx, 'x-correlation-id') || `admin-update-${startedAt}`;
    const actor = getHeaderValue(ctx, 'x-admin-actor') || 'unknown';
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/git/update'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-update', 5, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/git/update', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const ignoreLocalChanges = body.ignoreLocalChanges === true;
    let status = await getGitUpdateStatus(runGit);
    if (!status.ok) {
      await logLine('ERROR', `git pre-update status failed: ${status.error}`);
      routeError(ctx, 500, 'Failed to read Git status before update', { details: status.error });
      return;
    }
    if (status.dirty) {
      if (!ignoreLocalChanges) {
        routeError(ctx, 409, 'Working tree has local changes. Commit or stash before update.', { status });
        return;
      }
      const stashRes = await stashAllLocalGitChanges(runGit);
      if (!stashRes.ok) {
        await logLine('ERROR', `git safe stash failed before update: ${stashRes.error}`);
        routeError(ctx, 500, 'Failed to stash local changes before update', { details: stashRes.error, status });
        return;
      }
      await logLine('WARN', 'admin update stashed local git changes before pull');
      status = await getGitUpdateStatus(runGit);
      if (!status.ok) {
        await logLine('ERROR', `git status after safe stash failed before update: ${status.error}`);
        routeError(ctx, 500, 'Failed to read Git status after stashing local changes', { details: status.error });
        return;
      }
      if (status.dirty) {
        routeError(ctx, 409, 'Working tree still has local changes after safe stash. Resolve manually before update.', { status });
        return;
      }
    }
    const stashRuntime = await autoStashRuntimeNoise({ status, runGit, logLine });
    if (!stashRuntime.ok) {
      await logLine('ERROR', `git runtime stash failed: ${stashRuntime.error}`);
      routeError(ctx, 500, 'Failed to stash runtime files', { details: stashRuntime.error, status });
      return;
    }
    if (status.behind <= 0 && !(ignoreLocalChanges && status.ahead > 0)) {
      routeOk(ctx, { updated: false, message: 'Already up to date', status });
      return;
    }
    if (status.ahead > 0 && status.behind > 0) {
      routeError(ctx, 409, 'Branch diverged from upstream. Manual reconciliation is required (rebase/merge outside admin API).', { status });
      return;
    }
    const pullRes = await runGit(['pull', '--ff-only']);
    if (!pullRes.ok) {
      await logLine('ERROR', `git update failed: ${pullRes.error}`);
      routeError(ctx, 500, 'Git pull failed', { details: pullRes.error, status });
      return;
    }
    const nextStatus = await getGitUpdateStatus(runGit);
    if (!nextStatus.ok) {
      await logLine('ERROR', `git post-update status failed: ${nextStatus.error}`);
      routeError(ctx, 500, 'Failed to read Git status after update', { details: nextStatus.error });
      return;
    }
    await logLine('WARN', `git update applied on branch=${status.branch}; pull output=${pullRes.stdout.trim() || '(no output)'}`);
    await logLine('INFO', buildAdminDeployLog({
      action: 'update',
      route: '/api/admin/git/update',
      correlationId,
      actor,
      durationMs: Date.now() - startedAt,
      outcome: 'success',
      details: { branch: status.branch, head: nextStatus.head },
    }));
    routeOk(ctx, { updated: true, message: 'Update applied', output: pullRes.stdout.trim(), status: nextStatus });
  });

  router.post('/api/admin/git/deploy', async (ctx: RouteCtx) => {
    const startedAt = Date.now();
    const correlationId = getHeaderValue(ctx, 'x-request-id') || getHeaderValue(ctx, 'x-correlation-id') || `admin-deploy-${startedAt}`;
    const actor = getHeaderValue(ctx, 'x-admin-actor') || 'unknown';
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/git/deploy'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-deploy', 3, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/git/deploy', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const ignoreLocalChanges = body.ignoreLocalChanges === true;

    let status = await getGitUpdateStatus(runGit);
    const steps: Array<{ step: string; output?: string }> = [];
    if (!status.ok) {
      await logLine('ERROR', `git pre-deploy status failed: ${status.error}`);
      routeError(ctx, 500, 'Failed to read Git status before deploy', { details: status.error });
      return;
    }
    if (status.dirty) {
      if (!ignoreLocalChanges) {
        routeError(ctx, 409, 'Working tree has local changes. Commit or stash before deploy.', { status });
        return;
      }
      const stashRes = await stashAllLocalGitChanges(runGit);
      if (!stashRes.ok) {
        await logLine('ERROR', `git safe stash failed before deploy: ${stashRes.error}`);
        routeError(ctx, 500, 'Failed to stash local changes before deploy', { details: stashRes.error, status });
        return;
      }
      steps.push({ step: 'git stash push -u -m admin-auto-stash-local-changes', output: stashRes.output || '(ok)' });
      await logLine('WARN', 'admin deploy stashed local git changes before pull/build');
      status = await getGitUpdateStatus(runGit);
      if (!status.ok) {
        await logLine('ERROR', `git status after safe stash failed before deploy: ${status.error}`);
        routeError(ctx, 500, 'Failed to read Git status after stashing local changes', { details: status.error });
        return;
      }
      if (status.dirty) {
        routeError(ctx, 409, 'Working tree still has local changes after safe stash. Resolve manually before deploy.', { status });
        return;
      }
    }

    const stashRuntime = await autoStashRuntimeNoise({ status, runGit, logLine });
    if (!stashRuntime.ok) {
      await logLine('ERROR', `git runtime stash failed before deploy: ${stashRuntime.error}`);
      routeError(ctx, 500, 'Failed to stash runtime files', { details: stashRuntime.error, status });
      return;
    }

    if (status.ahead > 0 && status.behind > 0) {
      routeError(ctx, 409, 'Branch diverged from upstream. Manual reconciliation is required before deploy.', { status, steps });
      return;
    }
    if (status.behind > 0) {
      const pullRes = await runGit(['pull', '--ff-only']);
      if (!pullRes.ok) {
        await logLine('ERROR', `git deploy pull failed: ${pullRes.error}`);
        routeError(ctx, 500, 'Git pull failed', { details: pullRes.error, status, steps });
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
        await logLine('ERROR', `deploy npm install --include=dev failed: ${installRes.error}`);
        await logLine('ERROR', buildAdminDeployLog({
          action: 'deploy',
          route: '/api/admin/git/deploy',
          correlationId,
          actor,
          durationMs: Date.now() - startedAt,
          outcome: 'error',
          details: { failedStep: 'npm install --include=dev' },
        }));
        routeError(ctx, 500, 'npm install failed', { details: installRes.error, steps });
        return;
      }
      steps.push({ step: 'npm install --include=dev', output: installRes.stdout.trim() || '(ok)' });
    } else {
      steps.push({ step: 'npm ci --include=dev', output: installRes.stdout.trim() || '(ok)' });
    }

    const tscRes = await runShellCommand('npm run typecheck', 20 * 60_000);
    if (!tscRes.ok) {
      await logLine('ERROR', `deploy tsc failed: ${tscRes.error}`);
      await logLine('ERROR', buildAdminDeployLog({
        action: 'deploy',
        route: '/api/admin/git/deploy',
        correlationId,
        actor,
        durationMs: Date.now() - startedAt,
        outcome: 'error',
        details: { failedStep: 'npm run typecheck' },
      }));
      routeError(ctx, 500, 'TypeScript build failed', { details: tscRes.error, steps });
      return;
    }
    steps.push({ step: 'npm run typecheck', output: tscRes.stdout.trim() || '(ok)' });

    const viteRes = await runShellCommand('npm run build', 30 * 60_000);
    if (!viteRes.ok) {
      await logLine('ERROR', `deploy vite build failed: ${viteRes.error}`);
      await logLine('ERROR', buildAdminDeployLog({
        action: 'deploy',
        route: '/api/admin/git/deploy',
        correlationId,
        actor,
        durationMs: Date.now() - startedAt,
        outcome: 'error',
        details: { failedStep: 'npm run build' },
      }));
      routeError(ctx, 500, 'Vite build failed', { details: viteRes.error, steps });
      return;
    }
    steps.push({ step: 'npm run build', output: viteRes.stdout.trim() || '(ok)' });

    const nextStatus = await getGitUpdateStatus(runGit);
    if (!nextStatus.ok) {
      await logLine('ERROR', `git post-deploy status failed: ${nextStatus.error}`);
      routeError(ctx, 500, 'Failed to read Git status after deploy', { details: nextStatus.error, steps });
      return;
    }

    await logLine('WARN', `admin deploy completed; scheduling PM2 restart; head=${nextStatus.head}`);
    await logLine('INFO', buildAdminDeployLog({
      action: 'deploy',
      route: '/api/admin/git/deploy',
      correlationId,
      actor,
      durationMs: Date.now() - startedAt,
      outcome: 'success',
      details: { head: nextStatus.head, branch: nextStatus.branch },
    }));
    routeOk(ctx, { message: 'Update, build and restart scheduled', restarted: true, steps, status: nextStatus });
    setTimeout(() => {
      try {
        spawnDetachedShell('pm2 restart ecosystem.config.cjs --update-env');
      } catch {
        process.exit(0);
      }
    }, 300);
  });

  router.post('/api/admin/git/publish', async (ctx: RouteCtx) => {
    const startedAt = Date.now();
    const correlationId = getHeaderValue(ctx, 'x-request-id') || getHeaderValue(ctx, 'x-correlation-id') || `admin-publish-${startedAt}`;
    const actor = getHeaderValue(ctx, 'x-admin-actor') || 'unknown';
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/git/publish'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-publish', 5, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/git/publish', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const commitMessage = String(body.commitMessage ?? '').trim();
    let status = await getGitUpdateStatus(runGit);
    if (!status.ok) {
      await logLine('ERROR', `git pre-publish status failed: ${status.error}`);
      routeError(ctx, 500, 'Failed to read Git status before publish', { details: status.error });
      return;
    }

    const steps: Array<{ step: string; output?: string }> = [];
    if (status.dirty) {
      if (!commitMessage) {
        routeError(ctx, 400, 'Commit message is required when there are local changes.', { status });
        return;
      }
      const addRes = await runGit(['add', '-A']);
      if (!addRes.ok) {
        await logLine('ERROR', `git publish add failed: ${addRes.error}`);
        routeError(ctx, 500, 'Git add failed', { details: addRes.error, status });
        return;
      }
      steps.push({ step: 'git add -A', output: addRes.stdout.trim() || '(ok)' });

      const commitRes = await runGit(['commit', '-m', commitMessage]);
      if (!commitRes.ok) {
        await logLine('ERROR', `git publish commit failed: ${commitRes.error}`);
        routeError(ctx, 500, 'Git commit failed', { details: commitRes.error, status, steps });
        return;
      }
      steps.push({ step: `git commit -m "${commitMessage}"`, output: commitRes.stdout.trim() || '(ok)' });

      status = await getGitUpdateStatus(runGit);
      if (!status.ok) {
        await logLine('ERROR', `git post-commit status failed: ${status.error}`);
        routeError(ctx, 500, 'Failed to read Git status after commit', { details: status.error, steps });
        return;
      }
    }

    if (status.ahead <= 0) {
      routeError(ctx, 400, 'There are no local commits to push.', { status, steps });
      return;
    }

    const branch = status.branch || 'main';
    const pushRes = await runGit(['push', 'origin', branch]);
    if (!pushRes.ok) {
      await logLine('ERROR', `git publish push failed: ${pushRes.error}`);
      routeError(ctx, 500, 'Git push failed', { details: pushRes.error, status, steps });
      return;
    }
    steps.push({ step: `git push origin ${branch}`, output: pushRes.stdout.trim() || pushRes.stderr.trim() || '(ok)' });

    const nextStatus = await getGitUpdateStatus(runGit);
    if (!nextStatus.ok) {
      await logLine('ERROR', `git post-push status failed: ${nextStatus.error}`);
      routeError(ctx, 500, 'Failed to read Git status after push', { details: nextStatus.error, steps });
      return;
    }

    await logLine('WARN', `git publish completed on branch=${branch}; push output=${pushRes.stdout.trim() || '(no output)'}`);
    await logLine('INFO', buildAdminDeployLog({
      action: 'publish',
      route: '/api/admin/git/publish',
      correlationId,
      actor,
      durationMs: Date.now() - startedAt,
      outcome: 'success',
      details: { branch, head: nextStatus.head },
    }));
    routeOk(ctx, { message: 'Commit and push completed', steps, status: nextStatus });
  });
};
