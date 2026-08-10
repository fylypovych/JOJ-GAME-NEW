#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadEnvFile } from '../server/env';
import {
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  getCardCatalog,
  importSharedDeckTemplateJson,
  importSharedRanksJson,
  resetSharedRanks,
} from '../server/game/game-adapter';
import { assertSharedConfigConsistency } from '../server/services/shared-config-consistency';
import { createSharedConfigStore } from '../server/storage/shared-config';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const requireImportSuccess = (
  label: string,
  result: { ok: true } | { ok: false; error: string },
) => {
  if (!result.ok) throw new Error(`${label} import failed: ${result.error}`);
};

const main = async () => {
  loadEnvFile(path.resolve(appRoot, '.env'));
  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required in .env.');

  const [templateJson, ranksJson] = await Promise.all([
    readFile(
      path.resolve(appRoot, 'database', 'shared-deck-template.json'),
      'utf8',
    ),
    readFile(path.resolve(appRoot, 'database', 'shared-ranks.json'), 'utf8'),
  ]);
  requireImportSuccess(
    'shared deck template',
    importSharedDeckTemplateJson(templateJson),
  );
  requireImportSuccess('shared ranks', importSharedRanksJson(ranksJson));

  const store = createSharedConfigStore(
    {
      exportSharedDeckTemplateJson,
      exportSharedRanksJson,
      getCardCatalog,
      importSharedDeckTemplateJson,
      importSharedRanksJson,
      resetSharedRanks,
      storageMode: 'postgres',
      databaseUrl,
    },
    appRoot,
  );
  await store.syncCurrentJsonToPostgres();

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await assertSharedConfigConsistency(pool);
  } finally {
    await pool.end();
  }
  process.stdout.write(
    '[sync:shared-config-db] Normalized shared config is ready and consistent.\n',
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[sync:shared-config-db] ${message}\n`);
  process.exitCode = 1;
});
