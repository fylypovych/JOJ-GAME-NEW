#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const repoRoot = path.resolve(__dirname, '..');
const templatePath = path.join(repoRoot, 'database', 'shared-deck-template.json');
const ranksPath = path.join(repoRoot, 'database', 'shared-ranks.json');

const args = new Set(process.argv.slice(2));
const seedTemplate = !args.has('--ranks-only');
const seedRanks = !args.has('--template-only');

if (!seedTemplate && !seedRanks) {
  console.error('[seed-shared-config] nothing to do: choose template and/or ranks');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
if (!databaseUrl) {
  console.error('[seed-shared-config] DATABASE_URL is required');
  process.exit(1);
}

const loadJsonText = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
};

const templateText = seedTemplate ? loadJsonText(templatePath) : null;
const ranksText = seedRanks ? loadJsonText(ranksPath) : null;

if (templateText) JSON.parse(templateText);
if (ranksText) JSON.parse(ranksText);

const upsertSettingSql = `
  INSERT INTO app_settings (key, value, updated_by)
  VALUES ($1, $2::jsonb, 'seed-shared-config-to-db')
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
`;

(async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    if (templateText) {
      await client.query(upsertSettingSql, ['shared_deck_template', templateText]);
    }
    if (ranksText) {
      await client.query(upsertSettingSql, ['shared_ranks', ranksText]);
    }
    await client.query('COMMIT');

    const seeded = [];
    if (templateText) seeded.push('shared_deck_template');
    if (ranksText) seeded.push('shared_ranks');
    console.log(`[seed-shared-config] seeded: ${seeded.join(', ')}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error('[seed-shared-config] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
