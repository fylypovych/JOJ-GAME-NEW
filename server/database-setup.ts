import { createPostgresPool } from './db/postgres';
import path from 'node:path';
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
  dbMigrationsDir: string;
  uploadsDir: string;
  matchDbCutoverMode: 'auto' | 'skip';
  sharedConfigStore?: {
    loadTemplate: () => Promise<void>;
    loadRanks: () => Promise<void>;
    syncAdditionalJsonConfigsToPostgres?: (targetUrl: string) => Promise<Record<string, boolean>>;
  };
  appRootDir?: string;
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
    dbMigrationsDir,
    uploadsDir,
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

  let bugReportStore: ReturnType<typeof createBugReportStore> | null = null;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. File/in-memory fallback is disabled.');
  }

  try {
    userPool = createPostgresPool(databaseUrl);
    await runSqlMigrations(userPool, dbMigrationsDir);
    userStore = createUserStore(userPool);
    await userStore.ensureSchema();
    await userStore.deleteExpiredSessions();
    assetStore = createAssetStore(userPool);
    await assetStore.ensureSchema();
    await assetStore.syncDirectory(uploadsDir, 'card-image', '/public/card-assets');
    await assetStore.syncDirectory(path.resolve(uploadsDir, '..', 'profile-image'), 'avatar-image', '/profile-image');
    await assetStore.syncDirectory(path.resolve(uploadsDir, '..', 'sys.icons'), 'system-icon', '/sys.icons');
    backgroundHealth.assetSync = { ok: true, lastRunAt: new Date().toISOString(), mode: 'ok', details: 'initial sync complete' };
    matchStateStore = createMatchStateStore(userPool);
    await matchStateStore.ensureSchema();
    liveMirrorUserStore = userStore;
    liveMirrorMatchStateStore = matchStateStore;
    const postgresMatchDb = createBoardgamePostgresDb(userPool) as MatchDbBackend & { ensureSchema?: () => Promise<void> };
    await postgresMatchDb.ensureSchema?.();
    const cutoverFlagRaw = await userPool.query<{ value: unknown }>(
      "SELECT value FROM app_settings WHERE key = 'match_db_cutover_completed' LIMIT 1",
    );
    const cutoverAlreadyCompleted = Boolean(cutoverFlagRaw.rows[0]?.value);
    if (cutoverAlreadyCompleted) {
      matchDbCutoverSummary = { mode: 'skip', migratedMatches: 0 };
      await matchRuntimeSync.cutoverToPostgres(postgresMatchDb, 'skip');
      await logLine('INFO', 'match db cutover skipped (already completed before)');
    } else {
      matchDbCutoverSummary = await matchRuntimeSync.cutoverToPostgres(postgresMatchDb, matchDbCutoverMode);
      await userPool.query(
        `INSERT INTO app_settings (key, value, updated_by)
         VALUES ('match_db_cutover_completed', 'true'::jsonb, 'server-match-cutover')
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      );
    }
    bugReportStore = createBugReportStore({
      pool: userPool,
    });
    await bugReportStore.ensureSchema();
    postgresAvailableForApp = true;
    await logLine('INFO', 'user auth/profile schema ready');

    // Load shared config from PostgreSQL
    if (sharedConfigStore) {
      await sharedConfigStore.loadTemplate();
      await logLine('INFO', 'shared deck template loaded from postgres');
      await sharedConfigStore.loadRanks();
      await logLine('INFO', 'shared ranks loaded from postgres');

      // Auto-import additional JSON configs if they exist and not already in DB
      if (sharedConfigStore.syncAdditionalJsonConfigsToPostgres) {
        try {
          const importResults = await sharedConfigStore.syncAdditionalJsonConfigsToPostgres(databaseUrl);
          const importedKeys = Object.entries(importResults)
            .filter(([, success]) => success)
            .map(([key]) => key);
          if (importedKeys.length > 0) {
            await logLine('INFO', `auto-imported JSON configs to postgres: ${importedKeys.join(', ')}`);
          }
        } catch (importError) {
          await logLine('WARN', `auto-import of JSON configs failed (non-critical): ${String(importError instanceof Error ? importError.message : importError)}`);
        }
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
    throw new Error(`PostgreSQL initialization failed: ${String(error instanceof Error ? error.message : error)}`);
  }

  if (!bugReportStore) {
    throw new Error('PostgreSQL initialization failed: bug report store is unavailable.');
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
