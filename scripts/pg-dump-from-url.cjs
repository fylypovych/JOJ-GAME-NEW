#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const preparePgDumpConnection = (databaseUrl) => {
  const parsed = new URL(String(databaseUrl ?? '').trim());
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use the postgresql:// or postgres:// protocol');
  }

  const password = parsed.password ? decodeURIComponent(parsed.password) : '';
  parsed.password = '';
  return { safeUrl: parsed.toString(), password };
};

const main = () => {
  const outputPath = String(process.argv[2] ?? '').trim();
  if (!outputPath) throw new Error('Database dump output path is required');

  const { safeUrl, password } = preparePgDumpConnection(process.env.JOJ_DATABASE_URL);
  const env = { ...process.env };
  delete env.JOJ_DATABASE_URL;
  if (password) env.PGPASSWORD = password;

  const result = spawnSync(
    'pg_dump',
    ['--dbname', safeUrl, '--format=custom', '--file', outputPath],
    { env, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  return typeof result.status === 'number' ? result.status : 1;
};

module.exports = { preparePgDumpConnection };

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`pg_dump wrapper: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
