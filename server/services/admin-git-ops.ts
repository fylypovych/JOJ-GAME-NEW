import { access, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
type GitLocalChangesPreview = {
  hasLocalChanges: boolean;
  files: string[];
  statusText: string;
  diff: string;
  truncated: boolean;
};

const PRODUCTION_PUBLISH_CONFIG_PATHS = new Set([
  'database/game-ui-config.json',
  'database/shared-deck-template.json',
  'database/shared-ranks.json',
  'database/simulation-baselines.json',
]);
const PRODUCTION_PUBLISH_ASSET_PATTERN = /^public\/(?:card-assets|profile-image)\/.+\.(?:avif|gif|jpe?g|png|webp)$/i;

const normalizeGitPath = (filePath: string) => String(filePath ?? '')
  .trim()
  .replace(/\\/g, '/')
  .replace(/^\.\//, '');

export const isProductionPublishPath = (filePath: string): boolean => {
  const normalized = normalizeGitPath(filePath);
  return PRODUCTION_PUBLISH_CONFIG_PATHS.has(normalized)
    || PRODUCTION_PUBLISH_ASSET_PATTERN.test(normalized);
};

export const classifyProductionPublishFiles = (files: string[]) => {
  const unique = [...new Set(files.map(normalizeGitPath).filter(Boolean))];
  return {
    publishable: unique.filter(isProductionPublishPath),
    excluded: unique.filter((filePath) => !isProductionPublishPath(filePath)),
  };
};

const readGitFileList = async (runGit: RunGit, args: string[]) => {
  const result = await runGit(args);
  if (!result.ok) return result;
  return {
    ok: true as const,
    files: result.stdout.split(/\r?\n/).map(normalizeGitPath).filter(Boolean),
  };
};

const copyProductionFileToWorktree = async (repoRoot: string, worktreeRoot: string, filePath: string) => {
  const normalized = normalizeGitPath(filePath);
  if (!isProductionPublishPath(normalized)) throw new Error(`Publish path is not allowed: ${normalized}`);
  const source = path.resolve(repoRoot, normalized);
  const target = path.resolve(worktreeRoot, normalized);
  const repoPrefix = `${path.resolve(repoRoot)}${path.sep}`;
  const worktreePrefix = `${path.resolve(worktreeRoot)}${path.sep}`;
  if (!source.startsWith(repoPrefix) || !target.startsWith(worktreePrefix)) {
    throw new Error(`Publish path escapes repository root: ${normalized}`);
  }
  try {
    await access(source);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') throw error;
    await rm(target, { force: true });
  }
};

type GitOpDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  requireAdminWriteAccess: (ctx: RouteCtx, routeLabel: string) => Promise<boolean>;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  getGitUpdateStatus: (runGit: RunGit) => Promise<GitUpdateStatusResult>;
  getGitAuthStatus: () => Promise<GitAuthStatus>;
  saveGitAuthCredentials: (args: { username: string; token: string }) => Promise<GitAuthStatus>;
  clearGitAuthCredentials: () => Promise<GitAuthStatus>;
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

const parsePorcelainFiles = (stdout: string): string[] =>
  stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      let rest = line.slice(3).trim();
      if (rest.includes(' -> ')) rest = rest.split(' -> ').pop() ?? rest;
      return rest;
    })
    .filter(Boolean);

const truncateText = (value: string, maxChars: number) => {
  if (value.length <= maxChars) return { value, truncated: false };
  return {
    value: `${value.slice(0, Math.max(0, maxChars))}\n\n[...truncated by admin API...]`,
    truncated: true,
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
  saveGitAuthCredentials,
  clearGitAuthCredentials,
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

  router.get('/api/admin/git/local-changes', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/local-changes'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-local-changes', 20, 60_000))) return;

    const statusRes = await runGit(['status', '--porcelain', '--untracked-files=all']);
    if (!statusRes.ok) {
      await logLine('ERROR', `git local changes status failed: ${statusRes.error}`);
      routeError(ctx, 500, 'Failed to read local git changes', { details: statusRes.error });
      return;
    }

    const files = parsePorcelainFiles(statusRes.stdout);
    const hasLocalChanges = files.length > 0;
    if (!hasLocalChanges) {
      routeOk<GitLocalChangesPreview>(ctx, {
        hasLocalChanges: false,
        files: [],
        statusText: '',
        diff: '',
        truncated: false,
      });
      return;
    }

    const unstagedDiffRes = await runGit(['diff', '--no-ext-diff', '--submodule=short']);
    if (!unstagedDiffRes.ok) {
      await logLine('ERROR', `git local changes diff failed: ${unstagedDiffRes.error}`);
      routeError(ctx, 500, 'Failed to read unstaged git diff', { details: unstagedDiffRes.error });
      return;
    }
    const stagedDiffRes = await runGit(['diff', '--cached', '--no-ext-diff', '--submodule=short']);
    if (!stagedDiffRes.ok) {
      await logLine('ERROR', `git local changes cached diff failed: ${stagedDiffRes.error}`);
      routeError(ctx, 500, 'Failed to read staged git diff', { details: stagedDiffRes.error });
      return;
    }

    const combinedDiff = [
      '### git status --porcelain',
      statusRes.stdout.trim() || '(empty)',
      '',
      '### git diff (unstaged)',
      unstagedDiffRes.stdout.trim() || '(no unstaged diff)',
      '',
      '### git diff --cached (staged)',
      stagedDiffRes.stdout.trim() || '(no staged diff)',
    ]
      .join('\n')
      .trim();
    const truncated = truncateText(combinedDiff, 120_000);

    routeOk<GitLocalChangesPreview>(ctx, {
      hasLocalChanges,
      files,
      statusText: statusRes.stdout.trim(),
      diff: truncated.value,
      truncated: truncated.truncated,
    });
  });

  router.get('/api/admin/git/auth-status', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/auth-status'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-auth-status', 20, 60_000))) return;
    try {
      routeOk(ctx, await getGitAuthStatus());
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
    const action = String(body.action ?? '').trim();
    if (action === 'save') {
      const username = String(body.username ?? '').trim();
      const token = String(body.token ?? '').trim();
      if (!username || !token) {
        routeError(ctx, 400, 'GitHub username and token are required.');
        return;
      }
      try {
        const status = await saveGitAuthCredentials({ username, token });
        routeOk(ctx, { message: 'GitHub credentials saved', status });
      } catch (error) {
        const details = String(error instanceof Error ? error.message : error);
        await logLine('ERROR', `git auth save failed: ${details}`);
        routeError(ctx, 500, 'Failed to save GitHub credentials', { details });
      }
      return;
    }
    if (action === 'clear') {
      try {
        const status = await clearGitAuthCredentials();
        routeOk(ctx, { message: 'GitHub credentials cleared', status });
      } catch (error) {
        const details = String(error instanceof Error ? error.message : error);
        await logLine('ERROR', `git auth clear failed: ${details}`);
        routeError(ctx, 500, 'Failed to clear GitHub credentials', { details });
      }
      return;
    }
    routeError(ctx, 400, 'Unsupported GitHub auth action');
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
    if (commitMessage.length > 200 || /[\r\n\0]/.test(commitMessage)) {
      routeError(ctx, 400, 'Commit message must be a single line of at most 200 characters.');
      return;
    }
    const status = await getGitUpdateStatus(runGit);
    if (!status.ok) {
      await logLine('ERROR', `git pre-publish status failed: ${status.error}`);
      routeError(ctx, 500, 'Failed to read Git status before publish', { details: status.error });
      return;
    }

    if (status.behind > 0) {
      routeError(ctx, 409, 'Production is behind its upstream branch. Update and verify production before publishing content.', { status });
      return;
    }
    if (!status.upstream) {
      routeError(ctx, 409, 'Production branch has no upstream branch configured.', { status });
      return;
    }
    const targetBranch = status.branch.trim();
    if (!targetBranch || status.upstream !== `origin/${targetBranch}`) {
      routeError(ctx, 409, 'Production branch must track the matching origin branch before direct publish.', { status });
      return;
    }

    const stagedBefore = await readGitFileList(runGit, ['diff', '--cached', '--name-only']);
    if (!stagedBefore.ok) {
      routeError(ctx, 500, 'Failed to inspect staged Git changes before publish', { details: stagedBefore.error, status });
      return;
    }
    if (stagedBefore.files.length > 0) {
      routeError(ctx, 409, 'Git index already contains staged changes. Unstage and review them before production publish.', {
        status,
        stagedFiles: stagedBefore.files,
      });
      return;
    }

    if (status.ahead > 0) {
      routeError(ctx, 409, 'Production has local commits. Resolve them before publishing a production content branch.', { status });
      return;
    }

    const steps: Array<{ step: string; output?: string }> = [];
    const localStatusRes = await runGit(['status', '--porcelain', '--untracked-files=all']);
    if (!localStatusRes.ok) {
      routeError(ctx, 500, 'Failed to inspect production content changes', { details: localStatusRes.error, status });
      return;
    }
    const localFiles = parsePorcelainFiles(localStatusRes.stdout);
    const classification = classifyProductionPublishFiles(localFiles);
    if (classification.publishable.length === 0) {
      routeError(ctx, 400, 'There are no publishable production content changes.', {
        status,
        excludedFiles: classification.excluded,
      });
      return;
    }
    if (!commitMessage) {
      routeError(ctx, 400, 'Commit message is required when publishing production content.', {
        status,
        publishableFiles: classification.publishable,
        excludedFiles: classification.excluded,
      });
      return;
    }

    const repoRootRes = await runGit(['rev-parse', '--show-toplevel']);
    if (!repoRootRes.ok) {
      routeError(ctx, 500, 'Failed to resolve production repository root', { details: repoRootRes.error, status });
      return;
    }
    const repoRoot = path.resolve(repoRootRes.stdout.trim());
    const worktreeRoot = await mkdtemp(path.join(tmpdir(), 'joj-production-publish-'));
    let worktreeRegistered = false;
    let publishedHead = '';
    try {
      const worktreeRes = await runGit(['worktree', 'add', '--detach', worktreeRoot, status.upstream]);
      if (!worktreeRes.ok) throw new Error(worktreeRes.error);
      worktreeRegistered = true;
      steps.push({ step: `git worktree add ${status.upstream}`, output: '(ok)' });

      for (const filePath of classification.publishable) {
        await copyProductionFileToWorktree(repoRoot, worktreeRoot, filePath);
      }
      steps.push({
        step: `copy production content (${classification.publishable.length} files)`,
        output: classification.publishable.join('\n'),
      });

      const addRes = await runGit(['-C', worktreeRoot, 'add', '-A', '--', ...classification.publishable]);
      if (!addRes.ok) throw new Error(addRes.error);
      const stagedFiles = await readGitFileList(runGit, ['-C', worktreeRoot, 'diff', '--cached', '--name-only']);
      if (!stagedFiles.ok) throw new Error(stagedFiles.error);
      const stagedClassification = classifyProductionPublishFiles(stagedFiles.files);
      if (stagedClassification.excluded.length > 0 || stagedClassification.publishable.length === 0) {
        throw new Error('Temporary publish commit failed the production content allowlist check.');
      }

      for (const configPath of stagedClassification.publishable.filter((filePath) => filePath.endsWith('.json'))) {
        const stagedJson = await runGit(['-C', worktreeRoot, 'show', `:${configPath}`]);
        if (!stagedJson.ok) throw new Error(`Unable to read staged JSON configuration: ${configPath}`);
        try {
          JSON.parse(stagedJson.stdout);
        } catch {
          throw new Error(`Invalid JSON configuration blocked from publish: ${configPath}`);
        }
      }

      const commitRes = await runGit([
        '-C', worktreeRoot,
        '-c', 'user.name=JOJ Production',
        '-c', 'user.email=production@joj.lol',
        'commit', '-m', commitMessage,
      ]);
      if (!commitRes.ok) throw new Error(commitRes.error);
      steps.push({ step: `git commit -m "${commitMessage}"`, output: commitRes.stdout.trim() || '(ok)' });

      const publishedHeadRes = await runGit(['-C', worktreeRoot, 'rev-parse', 'HEAD']);
      if (!publishedHeadRes.ok) throw new Error(publishedHeadRes.error);
      publishedHead = publishedHeadRes.stdout.trim();

      const pushRes = await runGit(['-C', worktreeRoot, 'push', 'origin', `HEAD:refs/heads/${targetBranch}`]);
      if (!pushRes.ok) throw new Error(pushRes.error);
      steps.push({
        step: `git push origin ${targetBranch}`,
        output: pushRes.stdout.trim() || pushRes.stderr.trim() || '(ok)',
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      await logLine('ERROR', `git production content publish failed: ${details}`);
      routeError(ctx, 500, 'Production content publish failed', { details, status, steps });
      return;
    } finally {
      if (worktreeRegistered) await runGit(['worktree', 'remove', '--force', worktreeRoot]);
      await rm(worktreeRoot, { recursive: true, force: true });
    }

    const alignRes = await runGit(['reset', '--mixed', publishedHead]);
    if (!alignRes.ok) {
      await logLine('ERROR', `production content was pushed but local HEAD alignment failed: ${alignRes.error}`);
      routeError(ctx, 500, 'Content was pushed to GitHub, but production Git status needs manual alignment.', {
        details: alignRes.error,
        pushed: true,
        publishedHead,
        branch: targetBranch,
        steps,
      });
      return;
    }
    steps.push({ step: `align production HEAD ${publishedHead}`, output: '(working files preserved)' });

    const nextStatus = await getGitUpdateStatus(runGit);
    if (!nextStatus.ok) {
      routeError(ctx, 500, 'Content was pushed, but the updated Git status could not be read.', {
        details: nextStatus.error,
        pushed: true,
        publishedHead,
        branch: targetBranch,
        steps,
      });
      return;
    }

    await logLine('WARN', `production content published directly to branch=${targetBranch}`);
    await logLine('INFO', buildAdminDeployLog({
      action: 'publish',
      route: '/api/admin/git/publish',
      correlationId,
      actor,
      durationMs: Date.now() - startedAt,
      outcome: 'success',
      details: { branch: targetBranch, base: status.upstream, files: classification.publishable },
    }));
    routeOk(ctx, {
      message: `Production content pushed directly to ${targetBranch}`,
      steps,
      status: nextStatus,
      publishBranch: targetBranch,
      publishableFiles: classification.publishable,
      excludedFiles: classification.excluded,
    });
  });
};
