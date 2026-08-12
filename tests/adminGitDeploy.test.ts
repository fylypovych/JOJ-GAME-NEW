import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_DEPLOY_COMMANDS,
  registerAdminGitRoutes,
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

  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.deepEqual(detachedCommands, [
    ADMIN_DEPLOY_COMMANDS.restartAndHealthCheck,
  ]);
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
