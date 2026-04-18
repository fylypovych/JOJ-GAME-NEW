import { createMemoryPostgresPool, createPostgresPool } from './db/postgres';
import { runSqlMigrations } from './db/migrations';
import { createAssetStore } from './services/asset-store';
import { createBoardgamePostgresDb } from './services/boardgame-postgres-db';
import { createBugReportStore } from './services/bug-report-store';
import { createMatchStateStore } from './services/match-state-store';
import { createUserStore } from './services/user-store';
import type { MatchDbBackend } from './services/match-runtime-sync';
import type { LogLine } from './file-logger';

export interface DatabaseConfig {
  databaseUrl: string;
  nodeEnv: string;
  allowInMemoryUserStore: boolean;
  dbMigrationsDir: string;
  uploadsDir: string;
  bugReportsPath: string;
  bugReportImagesDir: string;
  matchDbCutoverMode: 'auto' | 'skip';
  sharedConfigStore?: {
    loadTemplate: () => Promise<void>;
    loadRanks: () => Promise<void>;
  };
}

export interface DatabaseServices {
  userPool: ReturnType<typeof createPostgresPool> | null;
  userStore: ReturnType<typeof createUserStore> | null;
  matchStateStore: ReturnType<typeof createMatchStateStore> | null;
  assetStore: ReturnType<typeof createAssetStore> | null;
  bugReportStore: ReturnType<typeof createBugReportStore>;
  postgresAvailableForApp: boolean;
  matchDbCutoverSummary: { mode: 'auto' | 'skip'; migratedMatches: number };
  liveMirrorUserStore: ReturnType<typeof createUserStore> | null;
  liveMirrorMatchStateStore: ReturnType<typeof createMatchStateStore> | null;
  backgroundHealth: {
    assetSync: { ok: boolean; lastRunAt: string | null; mode: 'pending' | 'ok' | 'error'; details: string };
    matchMirror: { ok: boolean; lastRunAt: string | null; mode: 'pending' | 'ok' | 'error'; details: string };
  };
}

export interface DatabaseSetupDeps {
  logLine: LogLine;
  matchRuntimeSync: {
    cutoverToPostgres: (backend: MatchDbBackend, mode: 'auto' | 'skip') => Promise<{ mode: 'auto' | 'skip'; migratedMatches: number }>;
    syncMatchStateMirror: () => Promise<void>;
    persistMatchMirrorById: (matchId: string) => Promise<void>;
  };
}

export const initializeDatabase = async (
  config: DatabaseConfig,
  deps: DatabaseSetupDeps,
): Promise<DatabaseServices> => {
  const {
    databaseUrl,
    nodeEnv,
    allowInMemoryUserStore,
    dbMigrationsDir,
    uploadsDir,
    bugReportsPath,
    bugReportImagesDir,
    matchDbCutoverMode,
    sharedConfigStore,
  } = config;

  const { logLine, matchRuntimeSync } = deps;

  let userPool = null as ReturnType<typeof createPostgresPool> | null;
  let userStore = null as ReturnType<typeof createUserStore> | null;
  let matchStateStore = null as ReturnType<typeof createMatchStateStore> | null;
  let assetStore = null as ReturnType<typeof createAssetStore> | null;
  let postgresAvailableForApp = false;
  let matchDbCutoverSummary: { mode: 'auto' | 'skip'; migratedMatches: number } = { mode: matchDbCutoverMode, migratedMatches: 0 };
  let liveMirrorUserStore: ReturnType<typeof createUserStore> | null = null;
  let liveMirrorMatchStateStore: ReturnType<typeof createMatchStateStore> | null = null;

  const backgroundHealth = {
    assetSync: { ok: true, lastRunAt: null as string | null, mode: 'pending' as 'pending' | 'ok' | 'error', details: '' },
    matchMirror: { ok: true, lastRunAt: null as string | null, mode: 'pending' as 'pending' | 'ok' | 'error', details: '' },
  };

  let bugReportStore = createBugReportStore({
    storePath: bugReportsPath,
    imagesDir: bugReportImagesDir,
    pool: null,
  });

  if (databaseUrl) {
    try {
      userPool = createPostgresPool(databaseUrl);
      await runSqlMigrations(userPool, dbMigrationsDir);
      userStore = createUserStore(userPool);
      await userStore.ensureSchema();
      await userStore.deleteExpiredSessions();
      assetStore = createAssetStore(userPool);
      await assetStore.ensureSchema();
      await assetStore.syncDirectory(uploadsDir);
      backgroundHealth.assetSync = { ok: true, lastRunAt: new Date().toISOString(), mode: 'ok', details: 'initial sync complete' };
      matchStateStore = createMatchStateStore(userPool);
      await matchStateStore.ensureSchema();
      liveMirrorUserStore = userStore;
      liveMirrorMatchStateStore = matchStateStore;
      const postgresMatchDb = createBoardgamePostgresDb(userPool) as MatchDbBackend & { ensureSchema?: () => Promise<void> };
      await postgresMatchDb.ensureSchema?.();
      matchDbCutoverSummary = await matchRuntimeSync.cutoverToPostgres(postgresMatchDb, matchDbCutoverMode);
      bugReportStore = createBugReportStore({
        storePath: bugReportsPath,
        imagesDir: bugReportImagesDir,
        pool: userPool,
      });
      await bugReportStore.ensureSchema();
      postgresAvailableForApp = true;
      await logLine('INFO', 'user auth/profile schema ready');
      
      // Load shared config from PostgreSQL
      if (sharedConfigStore) {
        try {
          await sharedConfigStore.loadTemplate();
          await logLine('INFO', 'shared deck template loaded from postgres');
        } catch (error) {
          await logLine('WARN', `failed to load shared deck template from postgres: ${String(error instanceof Error ? error.message : error)}`);
        }
        try {
          await sharedConfigStore.loadRanks();
          await logLine('INFO', 'shared ranks loaded from postgres');
        } catch (error) {
          await logLine('WARN', `failed to load shared ranks from postgres: ${String(error instanceof Error ? error.message : error)}`);
        }
      }
      
      await matchRuntimeSync.syncMatchStateMirror();
      backgroundHealth.matchMirror = { ok: true, lastRunAt: new Date().toISOString(), mode: 'ok', details: 'initial sync complete' };
      setInterval(async () => {
        try {
          await matchRuntimeSync.syncMatchStateMirror();
          backgroundHealth.matchMirror = { ok: true, lastRunAt: new Date().toISOString(), mode: 'ok', details: 'scheduled sync complete' };
        } catch (error) {
          backgroundHealth.matchMirror = {
            ok: false,
            lastRunAt: new Date().toISOString(),
            mode: 'error',
            details: String(error instanceof Error ? error.message : error),
          };
          await logLine('WARN', `user match persistence sweep failed: ${String(error instanceof Error ? error.message : error)}`);
        }
      }, 60_000).unref?.();
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
      backgroundHealth.assetSync = { ok: true, lastRunAt: new Date().toISOString(), mode: 'ok', details: 'memory fallback sync complete' };
      matchStateStore = createMatchStateStore(userPool);
      await matchStateStore.ensureSchema();
      liveMirrorUserStore = userStore;
      liveMirrorMatchStateStore = matchStateStore;
      const postgresMatchDb = createBoardgamePostgresDb(userPool) as MatchDbBackend & { ensureSchema?: () => Promise<void> };
      await postgresMatchDb.ensureSchema?.();
      matchDbCutoverSummary = await matchRuntimeSync.cutoverToPostgres(postgresMatchDb, matchDbCutoverMode);
      bugReportStore = createBugReportStore({
        storePath: bugReportsPath,
        imagesDir: bugReportImagesDir,
        pool: userPool,
      });
      await bugReportStore.ensureSchema();
      await matchRuntimeSync.syncMatchStateMirror();
      backgroundHealth.matchMirror = { ok: true, lastRunAt: new Date().toISOString(), mode: 'ok', details: 'memory fallback sync complete' };
      await logLine('WARN', 'user auth/profile module running on in-memory fallback for local/dev mode');
    } catch (error) {
      userPool = null;
      userStore = null;
      await logLine('WARN', `user auth/profile module disabled (memory fallback failed): ${String(error instanceof Error ? error.message : error)}`);
    }
  } else if (!userStore && nodeEnv !== 'production') {
    await logLine('WARN', 'user auth/profile memory fallback is disabled (set ALLOW_IN_MEMORY_USER_STORE=1 to enable it locally)');
  }

  return {
    userPool,
    userStore,
    matchStateStore,
    assetStore,
    bugReportStore,
    postgresAvailableForApp,
    matchDbCutoverSummary,
    liveMirrorUserStore,
    liveMirrorMatchStateStore,
    backgroundHealth,
  };
};
