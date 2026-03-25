import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseVersionFromCommitMessage, VERSION_PATTERN } = require('../scripts/version-from-commit.cjs') as {
  parseVersionFromCommitMessage: (message: string) => string;
  VERSION_PATTERN: RegExp;
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
