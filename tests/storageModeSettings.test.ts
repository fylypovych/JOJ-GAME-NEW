import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensurePostgresStorageModeSettings,
  STORAGE_BACKEND_CAPABILITIES_POSTGRES_VALUE,
  STORAGE_MODE_POSTGRES_VALUE,
} from '../server/services/storage-mode-settings';

test('ensurePostgresStorageModeSettings upserts postgres storage markers', async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return { rowCount: 2 };
    },
  };

  await ensurePostgresStorageModeSettings(db, 'test-run');

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call.sql.includes('INSERT INTO app_settings'));
  assert.ok(call.sql.includes('storage_mode'));
  assert.ok(call.sql.includes('storage_backend_capabilities'));
  assert.deepEqual(call.params, [
    JSON.stringify(STORAGE_MODE_POSTGRES_VALUE),
    JSON.stringify(STORAGE_BACKEND_CAPABILITIES_POSTGRES_VALUE),
    'test-run',
  ]);
});

