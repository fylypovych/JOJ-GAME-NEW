import { createMemoryPostgresPool, createPostgresPool } from './db/postgres';
import { runSqlMigrations } from './db/migrations';
import { createUserStore } from './services/user-store';
import { createAssetStore } from './services/asset-store';
import { createMatchStateStore } from './services/match-state-store';
import { createBugReportStore } from './services/bug-report-store';
import {
  databaseUrl,
  uploadsDir,
  bugReportsPath,
  bugReportImagesDir,
  nodeEnv,
  allowInMemoryUserStore,
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

  if (databaseUrl) {
    try {
      userPool = createPostgresPool(databaseUrl);
      await runSqlMigrations(userPool, './db/migrations');
      userStore = createUserStore(userPool);
      await userStore.ensureSchema();
      await userStore.deleteExpiredSessions();
      assetStore = createAssetStore(userPool);
      await assetStore.ensureSchema();
      await assetStore.syncDirectory(uploadsDir);
      matchStateStore = createMatchStateStore(userPool);
      await matchStateStore.ensureSchema();
      postgresAvailableForApp = true;
      await logLine('INFO', 'user auth/profile schema ready');
    } catch (error) {
      userPool = null;
      userStore = null;
      await logLine('WARN', `user auth/profile postgres unavailable: ${String(error instanceof Error ? error.message : error)}`);
    }
  } else {
    await logLine('WARN', 'user auth/profile postgres is not configured (DATABASE_URL is empty)');
  }

  if (!userStore && nodeEnv !== 'production' && allowInMemoryUserStore) {
    try {
      userPool = await createMemoryPostgresPool();
      userStore = createUserStore(userPool);
      await userStore.ensureSchema();
      await userStore.deleteExpiredSessions();
      assetStore = createAssetStore(userPool);
      await assetStore.ensureSchema();
      await assetStore.syncDirectory(uploadsDir);
      matchStateStore = createMatchStateStore(userPool);
      await matchStateStore.ensureSchema();
      postgresAvailableForApp = true;
      await logLine('WARN', 'user auth/profile module running on in-memory fallback for local/dev mode');
    } catch (error) {
      userPool = null;
      userStore = null;
      await logLine('WARN', `user auth/profile module disabled (memory fallback failed): ${String(error instanceof Error ? error.message : error)}`);
    }
  } else if (!userStore && nodeEnv !== 'production') {
    await logLine('WARN', 'user auth/profile memory fallback is disabled (set ALLOW_IN_MEMORY_USER_STORE=1 to enable it locally)');
  }

  const bugReportStore = createBugReportStore({
    storePath: bugReportsPath,
    imagesDir: bugReportImagesDir,
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
