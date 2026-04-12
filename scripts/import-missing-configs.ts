import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

interface ConfigSet {
  config_type: 'shared_ranks' | 'shared_deck_template' | 'server_settings' | 'ui_settings';
  slug: string;
  title: string;
  payload: any;
}

const CONFIG_FILES: ConfigSet[] = [
  {
    config_type: 'ui_settings',
    slug: 'admin-db-ui-config',
    title: 'Admin DB UI Config',
    payload: null, // Will be loaded from file
  },
  {
    config_type: 'ui_settings',
    slug: 'bug-report-ui-config',
    title: 'Bug Report UI Config',
    payload: null,
  },
  {
    config_type: 'ui_settings',
    slug: 'game-ui-config',
    title: 'Game UI Config',
    payload: null,
  },
  {
    config_type: 'shared_deck_template',
    slug: 'shared-deck-template',
    title: 'Shared Deck Template',
    payload: null,
  },
  {
    config_type: 'shared_ranks',
    slug: 'shared-ranks',
    title: 'Shared Ranks',
    payload: null,
  },
  {
    config_type: 'server_settings',
    slug: 'simulation-baselines',
    title: 'Simulation Baselines',
    payload: null,
  },
];

function getFileSlug(slug: string): string {
  const slugToFileMap: Record<string, string> = {
    'admin-db-ui-config': 'admin-db-ui-config.json',
    'bug-report-ui-config': 'bug-report-ui-config.json',
    'game-ui-config': 'game-ui-config.json',
    'shared-deck-template': 'shared-deck-template.json',
    'shared-ranks': 'shared-ranks.json',
    'simulation-baselines': 'simulation-baselines.json',
  };
  return slugToFileMap[slug];
}

function calculateChecksum(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function importConfig(config: ConfigSet) {
  const fileName = getFileSlug(config.slug);
  const filePath = path.join(__dirname, '..', 'database', fileName);

  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${fileName} - file not found`);
    return;
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const payload = JSON.parse(fileContent);
  const checksum = calculateChecksum(fileContent);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if config already exists
    const existing = await client.query(
      'SELECT id FROM config_sets WHERE config_type = $1 AND slug = $2',
      [config.config_type, config.slug]
    );

    if (existing.rows.length > 0) {
      console.log(`Skipping ${config.slug} - already exists`);
      await client.query('ROLLBACK');
      return;
    }

    // Insert new config
    await client.query(
      `INSERT INTO config_sets (config_type, slug, title, is_active, version_no, payload, checksum_sha256, created_by)
       VALUES ($1, $2, $3, true, 1, $4, $5, 'migration-script')`,
      [config.config_type, config.slug, config.title, JSON.stringify(payload), checksum]
    );

    await client.query('COMMIT');
    console.log(`✓ Imported ${config.slug}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Failed to import ${config.slug}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('Starting import of missing configs...');
    
    for (const config of CONFIG_FILES) {
      await importConfig(config);
    }

    console.log('\nImport completed successfully');
    
    // Show summary
    const result = await pool.query('SELECT config_type, slug, title FROM config_sets ORDER BY config_type, slug');
    console.log('\nCurrent config_sets:');
    console.table(result.rows);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
