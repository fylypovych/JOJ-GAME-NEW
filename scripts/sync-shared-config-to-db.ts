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

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const existingResult = await pool.query<{ key: string }>(
      `SELECT key
       FROM app_settings
       WHERE key = ANY($1::text[])`,
      [['shared_deck_template', 'shared_ranks']],
    );
    const existingKeys = new Set(existingResult.rows.map((row) => row.key));
    const templateExists = existingKeys.has('shared_deck_template');
    const ranksExist = existingKeys.has('shared_ranks');

    if (templateExists) {
      await store.loadTemplate();
    } else {
      requireImportSuccess(
        'shared deck template',
        importSharedDeckTemplateJson(templateJson),
      );
    }

    if (ranksExist) {
      await store.loadRanks();
    } else {
      requireImportSuccess('shared ranks', importSharedRanksJson(ranksJson));
    }

    // Rebuild normalized tables from the selected source. Existing app_settings
    // values were loaded first, so this cannot replace production content with
    // repository defaults.
    await store.saveTemplateToDisk();
    await store.saveRanksToDisk();
    await store.syncAdditionalJsonConfigsToPostgres?.(databaseUrl, appRoot);
    await assertSharedConfigConsistency(pool);

    const seeded: string[] = [];
    const preserved: string[] = [];
    (templateExists ? preserved : seeded).push('shared_deck_template');
    (ranksExist ? preserved : seeded).push('shared_ranks');
    if (seeded.length > 0) {
      process.stdout.write(`[sync:shared-config-db] Seeded missing settings: ${seeded.join(', ')}.\n`);
    }
    if (preserved.length > 0) {
      process.stdout.write(`[sync:shared-config-db] Preserved production settings: ${preserved.join(', ')}.\n`);
    }
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
