#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { runSqlMigrations } from '../server/db/migrations';
import { loadEnvFile } from '../server/env';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const main = async () => {
  loadEnvFile(path.resolve(appRoot, '.env'));
  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required in .env.');

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('SELECT 1');
    await runSqlMigrations(pool, path.resolve(appRoot, 'db', 'migrations'));
    process.stdout.write('[db:migrate] All database migrations are applied.\n');
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[db:migrate] ${message}\n`);
  process.exitCode = 1;
});
