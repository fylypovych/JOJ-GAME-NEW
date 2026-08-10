import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBootstrapArgs } from '../scripts/bootstrap-admin';

test('admin bootstrap parses safe stdin-based options', () => {
  assert.deepEqual(
    parseBootstrapArgs([
      '--username',
      'admin',
      '--email',
      'admin@example.com',
      '--display-name',
      'Main Admin',
      '--lang',
      'en',
      '--if-no-admin',
      '--password-stdin',
    ]),
    {
      username: 'admin',
      email: 'admin@example.com',
      displayName: 'Main Admin',
      preferredLang: 'en',
      ifNoAdmin: true,
      passwordStdin: true,
    },
  );
});

test('admin bootstrap rejects passwords passed as arguments', () => {
  assert.throws(
    () =>
      parseBootstrapArgs([
        '--username',
        'admin',
        '--password',
        'visible-secret',
      ]),
    /Unknown option: --password/,
  );
  assert.throws(
    () => parseBootstrapArgs(['--username', 'admin']),
    /--password-stdin is required/,
  );
});
