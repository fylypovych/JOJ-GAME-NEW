import { createPostgresPool, closePostgresPool } from '../server/db/postgres';
import { ensurePostgresStorageModeSettings } from '../server/services/storage-mode-settings';

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

if (!databaseUrl.trim()) {
  console.error('[fix-storage-mode-postgres] DATABASE_URL is required');
  process.exit(1);
}

const main = async () => {
  const pool = createPostgresPool(databaseUrl);
  try {
    await ensurePostgresStorageModeSettings(pool, 'fix-storage-mode-postgres-script');
    console.log('[fix-storage-mode-postgres] updated app_settings: storage_mode, storage_backend_capabilities');
  } finally {
    await closePostgresPool();
  }
};

main().catch((error) => {
  console.error('[fix-storage-mode-postgres] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

