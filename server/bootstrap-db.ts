import { createPostgresPool } from './db/postgres';
import path from 'node:path';
import { runSqlMigrations } from './db/migrations';
import { createUserStore } from './services/user-store';
import { createAssetStore } from './services/asset-store';
import { createMatchStateStore } from './services/match-state-store';
import { createBugReportStore } from './services/bug-report-store';
import { ensurePostgresStorageModeSettings } from './services/storage-mode-settings';
import {
  databaseUrl,
  uploadsDir,
} from './bootstrap-config';
import type { LogLine } from './routes/types';

export type DbBootstrapResult = {
  userPool: ReturnType<typeof createPostgresPool> | null;
  userStore: ReturnType<typeof createUserStore> | null;
  matchStateStore: ReturnType<typeof createMatchStateStore> | null;
  assetStore: ReturnType<typeof createAssetStore> | null;
  bugReportStore: ReturnType<typeof createBugReportStore>;
  postgresAvailableForApp: boolean;
};

export const bootstrapDatabase = async (logLine: LogLine): Promise<DbBootstrapResult> => {
  let userPool = null as ReturnType<typeof createPostgresPool> | null;
  let userStore = null as ReturnType<typeof createUserStore> | null;
  let matchStateStore = null as ReturnType<typeof createMatchStateStore> | null;
  let assetStore = null as ReturnType<typeof createAssetStore> | null;
  let postgresAvailableForApp = false;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. In-memory fallback is disabled.');
  }

  try {
    userPool = createPostgresPool(databaseUrl);
    await runSqlMigrations(userPool, './db/migrations');
    await ensurePostgresStorageModeSettings(userPool, 'server-postgres-init');
    userStore = createUserStore(userPool);
    await userStore.ensureSchema();
    await userStore.deleteExpiredSessions();
    assetStore = createAssetStore(userPool);
    await assetStore.ensureSchema();
    await assetStore.syncDirectory(uploadsDir, 'card-image', '/public/card-assets');
    await assetStore.syncDirectory(path.resolve(uploadsDir, '..', 'profile-image'), 'avatar-image', '/profile-image');
    await assetStore.syncDirectory(path.resolve(uploadsDir, '..', 'sys.icons'), 'system-icon', '/sys.icons');
    matchStateStore = createMatchStateStore(userPool);
    await matchStateStore.ensureSchema();
    postgresAvailableForApp = true;
    await logLine('INFO', 'user auth/profile schema ready');
  } catch (error) {
    userPool = null;
    userStore = null;
    await logLine('WARN', `user auth/profile postgres unavailable: ${String(error instanceof Error ? error.message : error)}`);
  }

  if (!userPool) {
    throw new Error('PostgreSQL pool is required for bug report store.');
  }

  const bugReportStore = createBugReportStore({
    pool: userPool,
  });
  await bugReportStore.ensureSchema();

  return {
    userPool,
    userStore,
    matchStateStore,
    assetStore,
    bugReportStore,
    postgresAvailableForApp,
  };
};
