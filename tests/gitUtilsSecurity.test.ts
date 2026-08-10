import test from 'node:test';
import assert from 'node:assert/strict';
import { autoStashRuntimeNoise, redactGitCredentials } from '../server/git-utils';

test('redactGitCredentials hides credentials embedded in HTTPS remotes', () => {
  const remote = 'https://deploy-user:github_pat_SECRET_VALUE@github.com/example/project.git';

  const redacted = redactGitCredentials(remote);

  assert.equal(redacted, 'https://***@github.com/example/project.git');
  assert.equal(redacted.includes('github_pat_SECRET_VALUE'), false);
});

test('redactGitCredentials leaves credential-free remotes unchanged', () => {
  assert.equal(
    redactGitCredentials('https://github.com/example/project.git'),
    'https://github.com/example/project.git',
  );
  assert.equal(
    redactGitCredentials('git@github.com:example/project.git'),
    'git@github.com:example/project.git',
  );
});

test('runtime auto-stash scopes the operation to the reported runtime files', async () => {
  const calls: string[][] = [];
  const result = await autoStashRuntimeNoise({
    status: {
      ignoredRuntimeDirtyFiles: [
        'package.json',
        'database/admin-db-ui-config.json',
      ],
    },
    runGit: async (args) => {
      calls.push(args);
      return { ok: true, stdout: 'saved', stderr: '' };
    },
    logLine: async () => undefined,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [[
    'stash',
    'push',
    '-u',
    '-m',
    'admin-auto-stash-runtime',
    '--',
    'package.json',
    'database/admin-db-ui-config.json',
  ]]);
});
