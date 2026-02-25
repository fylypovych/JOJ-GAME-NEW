import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDbConnInput } from '../server/services/admin-db-tools';

test('parseDbConnInput parses valid DB draft and normalizes sslMode', () => {
  const parsed = parseDbConnInput({
    host: '127.0.0.1',
    port: '5432',
    database: 'joj_game',
    user: 'joj_user',
    password: 'secret',
    sslMode: 'require',
  });
  assert.equal('error' in parsed, false);
  if ('error' in parsed) return;
  assert.deepEqual(parsed, {
    host: '127.0.0.1',
    port: '5432',
    database: 'joj_game',
    user: 'joj_user',
    password: 'secret',
    sslMode: 'require',
  });
});

test('parseDbConnInput rejects missing required fields', () => {
  const parsed = parseDbConnInput({
    host: '127.0.0.1',
    port: '5432',
    database: '',
    user: 'joj_user',
  });
  assert.equal('error' in parsed, true);
});

