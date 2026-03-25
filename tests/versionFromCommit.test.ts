import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseVersionFromCommitMessage, VERSION_PATTERN } = require('../scripts/version-from-commit.cjs') as {
  parseVersionFromCommitMessage: (message: string) => string;
  VERSION_PATTERN: RegExp;
};
const { getConflictAbortText, resolveVersionFromInput } = require('../scripts/sync-version-from-commit.cjs') as {
  getConflictAbortText: (files: string[], version: string) => string[];
  resolveVersionFromInput: () => string;
};
const { getValidationErrorText } = require('../scripts/check-version-sync.cjs') as {
  getValidationErrorText: (version: string) => string[];
};
const { getSkipReason, isCiEnvironment } = require('../scripts/install-git-hooks.cjs') as {
  getSkipReason: (args: { env: Record<string, string | undefined>; gitDirExists: boolean; hooksDirExists: boolean }) => string;
  isCiEnvironment: (env: Record<string, string | undefined>) => boolean;
};

test('parseVersionFromCommitMessage returns version from bare marker', () => {
  assert.equal(parseVersionFromCommitMessage('v=0.0.0.26'), '0.0.0.26');
});

test('parseVersionFromCommitMessage returns version from descriptive commit message', () => {
  assert.equal(parseVersionFromCommitMessage('auth fixes, v=0.0.0.27'), '0.0.0.27');
});

test('parseVersionFromCommitMessage ignores messages without version marker', () => {
  assert.equal(parseVersionFromCommitMessage('auth fixes only'), '');
});

test('VERSION_PATTERN does not match malformed marker', () => {
  assert.equal(VERSION_PATTERN.test('v=0.0.0'), false);
});

test('getConflictAbortText explains why auto-sync is blocked', () => {
  assert.deepEqual(getConflictAbortText(['package.json'], '0.0.0.26'), [
    '[version-sync] aborted: package.json contain unstaged changes.',
    '[version-sync] set version 0.0.0.26 in those files manually, then retry the commit.',
  ]);
});

test('isCiEnvironment detects CI mode', () => {
  assert.equal(isCiEnvironment({ CI: 'true' }), true);
  assert.equal(isCiEnvironment({ CI: '1' }), false);
});

test('getSkipReason prefers CI skip over filesystem checks', () => {
  assert.equal(getSkipReason({
    env: { CI: 'true' },
    gitDirExists: true,
    hooksDirExists: true,
  }), 'CI environment detected');
});

test('getSkipReason reports missing git metadata locally', () => {
  assert.equal(getSkipReason({
    env: {},
    gitDirExists: false,
    hooksDirExists: true,
  }), '.git not found');
});

test('resolveVersionFromInput parses raw commit message argument', () => {
  const originalArgv = process.argv;
  process.argv = ['node', 'script', 'release: v=0.0.0.95'];
  try {
    assert.equal(resolveVersionFromInput(), '0.0.0.95');
  } finally {
    process.argv = originalArgv;
  }
});

test('getValidationErrorText explains how to repair staged version mismatch', () => {
  assert.deepEqual(getValidationErrorText('0.0.0.95'), [
    '[version-check] aborted: staged package version does not match 0.0.0.95.',
    '[version-check] run npm run set:version -- "v=0.0.0.95" and retry the commit.',
  ]);
});
