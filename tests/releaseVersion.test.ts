import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeReleaseVersion,
  incrementReleaseVersion,
  findLatestReleaseVersion,
  getNextReleaseVersion,
} = require('../scripts/release-version.cjs') as {
  normalizeReleaseVersion: (value: string) => string;
  incrementReleaseVersion: (value: string) => string;
  findLatestReleaseVersion: (subjects: string[]) => string;
  getNextReleaseVersion: (subjects: string[]) => string;
};

test('normalizes historical build overflow using base 100', () => {
  assert.equal(normalizeReleaseVersion('0.0.3.100'), '0.0.4.0');
  assert.equal(normalizeReleaseVersion('0.0.3.101'), '0.0.4.1');
});

test('increments build and carries into patch at 99', () => {
  assert.equal(incrementReleaseVersion('0.0.3.98'), '0.0.3.99');
  assert.equal(incrementReleaseVersion('0.0.3.99'), '0.0.4.0');
});

test('carries patch into minor and minor into major', () => {
  assert.equal(incrementReleaseVersion('0.0.99.99'), '0.1.0.0');
  assert.equal(incrementReleaseVersion('0.99.99.99'), '1.0.0.0');
});

test('finds and normalizes the latest release summary while skipping content commits', () => {
  assert.equal(findLatestReleaseVersion([
    'Update production deck',
    '0.0.3.101',
    '0.0.3.100',
  ]), '0.0.4.1');
});

test('calculates the requested next release after historical overflow', () => {
  assert.equal(getNextReleaseVersion(['0.0.3.101']), '0.0.4.2');
});
