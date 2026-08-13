import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_DEPLOY_COMMANDS,
  registerAdminGitRoutes,
  summarizeCommandFailure,
} from '../server/services/admin-git-ops';
import type { RouteCtx } from '../server/routes/types';

test('web deployment performs backup, verification, migrations and sync before restart', async () => {
  const postHandlers = new Map<string, (ctx: RouteCtx) => unknown>();
  const shellCommands: string[] = [];
  const gitCommands: string[][] = [];
  const detachedCommands: string[] = [];

  registerAdminGitRoutes({
    router: {
      get: () => undefined,
      post: (route, handler) => postHandlers.set(route, handler),
    },
    requireAdminAuth: async () => true,
    requireAdminWriteAccess: async () => true,
    enforceRateLimit: async () => true,
    readJsonBodySafe: async ({ ctx }) =>
      (ctx.request?.body ?? {}) as Record<string, unknown>,
    logLine: async () => undefined,
    JSON_BODY_LIMIT: 1024,
    getGitUpdateStatus: async () => ({
      ok: true,
      branch: 'main',
      remote: 'origin',
      upstream: 'origin/main',
      ahead: 0,
      behind: 1,
      dirty: false,
      canUpdate: true,
      head: 'abc123',
    }),
    getGitAuthStatus: async () => ({
      helper: '',
      helperConfigured: false,
      hasGithubCredentials: false,
      savedUsername: '',
      credentialsPath: '',
      remoteAuthMode: 'ssh',
    }),
    saveGitAuthCredentials: async () => {
      throw new Error('unused');
    },
    clearGitAuthCredentials: async () => {
      throw new Error('unused');
    },
    autoStashRuntimeNoise: async () => ({ ok: true }),
    runGit: async (args) => {
      gitCommands.push(args);
      return { ok: true, stdout: 'ok', stderr: '' };
    },
    runShellCommand: async (command) => {
      shellCommands.push(command);
      return { ok: true, stdout: 'ok', stderr: '' };
    },
    spawnDetachedShell: (command) => detachedCommands.push(command),
    devRestartTouchPath: 'unused',
  });

  const ctx: RouteCtx = { request: { body: { ignoreLocalChanges: false } } };
  await postHandlers.get('/api/admin/git/deploy')?.(ctx);

  assert.deepEqual(shellCommands, [
    ADMIN_DEPLOY_COMMANDS.backup,
    ADMIN_DEPLOY_COMMANDS.install,
    ADMIN_DEPLOY_COMMANDS.verify,
    ADMIN_DEPLOY_COMMANDS.migrate,
    ADMIN_DEPLOY_COMMANDS.syncSharedConfig,
  ]);
  assert.deepEqual(gitCommands, [['pull', '--ff-only']]);
  assert.equal((ctx.body as { ok: boolean; restarted: boolean }).ok, true);
  assert.equal((ctx.body as { restarted: boolean }).restarted, true);
  const steps = (
    ctx.body as { steps: Array<{ step: string; output?: string }> }
  ).steps;
  assert.deepEqual(
    steps.map((step) => step.step),
    [
      'Production backup',
      'GitHub files updated',
      'Dependencies installed',
      'Release checks passed',
      'Database migrations completed',
      'Shared configuration sync completed',
      'PM2 restart and health check scheduled',
    ],
  );
  assert.equal(
    steps.some((step) => Boolean(step.output)),
    false,
  );

  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.deepEqual(detachedCommands, [
    ADMIN_DEPLOY_COMMANDS.restartAndHealthCheck,
  ]);
});

test('deployment failure summary drops successful test noise and keeps the actual error', () => {
  const noisyTests = Array.from(
    { length: 195 },
    (_, index) => `✔ successful test ${index + 1}`,
  ).join('\n');
  const summary = summarizeCommandFailure(
    [
      '$ sh -lc npm run check:release',
      'message: Command failed: sh -lc npm run check:release',
      'code: 1',
      `stdout:\n${noisyTests}`,
      'stderr:',
      'Error: Referenced asset files are missing from public/card-assets: 2026.LYAP.STARTER/lyap-04.webp',
      '    at scripts/check-asset-inventory.ts:86:9',
    ].join('\n'),
  );

  assert.match(summary, /Referenced asset files are missing/);
  assert.match(summary, /2026\.LYAP\.STARTER\/lyap-04\.webp/);
  assert.doesNotMatch(summary, /successful test 195/);
  assert.ok(summary.length < 1_000);
});

test('web deployment aborts before Git changes when backup fails', async () => {
  const postHandlers = new Map<string, (ctx: RouteCtx) => unknown>();
  const gitCommands: string[][] = [];
  registerAdminGitRoutes({
    router: {
      get: () => undefined,
      post: (route, handler) => postHandlers.set(route, handler),
    },
    requireAdminAuth: async () => true,
    requireAdminWriteAccess: async () => true,
    enforceRateLimit: async () => true,
    readJsonBodySafe: async () => ({}),
    logLine: async () => undefined,
    JSON_BODY_LIMIT: 1024,
    getGitUpdateStatus: async () => ({
      ok: true,
      branch: 'main',
      remote: 'origin',
      upstream: 'origin/main',
      ahead: 0,
      behind: 1,
      dirty: false,
      canUpdate: true,
      head: 'abc123',
    }),
    getGitAuthStatus: async () => {
      throw new Error('unused');
    },
    saveGitAuthCredentials: async () => {
      throw new Error('unused');
    },
    clearGitAuthCredentials: async () => {
      throw new Error('unused');
    },
    autoStashRuntimeNoise: async () => ({ ok: true }),
    runGit: async (args) => {
      gitCommands.push(args);
      return { ok: true, stdout: '', stderr: '' };
    },
    runShellCommand: async () => ({ ok: false, error: 'pg_dump failed' }),
    spawnDetachedShell: () => undefined,
    devRestartTouchPath: 'unused',
  });

  const ctx: RouteCtx = { request: { body: {} } };
  await postHandlers.get('/api/admin/git/deploy')?.(ctx);

  assert.equal(ctx.status, 500);
  assert.match(String((ctx.body as { error: string }).error), /backup failed/i);
  assert.deepEqual(gitCommands, []);
});
