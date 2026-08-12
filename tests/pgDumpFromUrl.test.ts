import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { preparePgDumpConnection } = require('../scripts/pg-dump-from-url.cjs') as {
  preparePgDumpConnection: (databaseUrl: string) => {
    safeUrl: string;
    password: string;
  };
};

test('pg_dump connection keeps credentials out of its command arguments', () => {
  const result = preparePgDumpConnection(
    'postgresql://joj_user:p%40ss%3Aword@127.0.0.1:5432/joj_game?sslmode=disable',
  );

  assert.equal(result.password, 'p@ss:word');
  assert.equal(
    result.safeUrl,
    'postgresql://joj_user@127.0.0.1:5432/joj_game?sslmode=disable',
  );
  assert.doesNotMatch(result.safeUrl, /p%40ss|word/);
});

test('pg_dump connection rejects non-PostgreSQL URLs', () => {
  assert.throws(
    () => preparePgDumpConnection('https://example.com/database'),
    /postgresql:\/\//,
  );
});
