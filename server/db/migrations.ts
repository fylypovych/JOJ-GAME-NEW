import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

export const runSqlMigrations = async (pool: Pool, migrationsDir: string) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  let files: string[] = [];
  try {
    files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return;
  }
  for (const file of files) {
    const already = await pool.query('SELECT 1 FROM app_schema_migrations WHERE id = $1 LIMIT 1', [file]);
    if (already.rowCount) continue;
    const sql = await readFile(path.resolve(migrationsDir, file), 'utf8');
    if (!sql.trim()) continue;
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO app_schema_migrations (id) VALUES ($1)', [file]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }
};
