import { createRequire } from 'node:module';
import { createMemoryPostgresPool, createPostgresPool } from './db/postgres';
import { runSqlMigrations } from './db/migrations';
import { createFileLogger } from './file-logger';
import {
  autoStashRuntimeNoise,
  createCommandRunners,
  getGitAuthStatus,
  getGitUpdateStatus,
} from './git-utils';
import { createRateLimiter, createRequireAdminAuth, readJsonBodySafe } from './request-utils';
import { registerAdminRoutes } from './routes/admin';
import { registerAuthRoutes } from './routes/auth';
import { registerBugReportRoutes } from './routes/bug-reports';
import { registerSharedRoutes } from './routes/shared';
import { registerUploadRoutes } from './routes/uploads';
import { registerUserLobbyRoutes } from './routes/user-lobby';
import { createAssetStore } from './services/asset-store';
import { createBoardgamePostgresDb } from './services/boardgame-postgres-db';
import { createBugReportStore } from './services/bug-report-store';
import { createMatchStateStore } from './services/match-state-store';
import { createUserStore } from './services/user-store';
import { createAdminAuditLogger } from './services/admin-audit';
import { createMatchRuntimeSync, type MatchDbBackend } from './services/match-runtime-sync';
import { createCorsMiddleware, createSecurityHeadersMiddleware } from './services/http-security';
import { createCacheControlMiddleware } from './cache-control-middleware';
import { createSharedConfigStore } from './storage/shared-config';
import { getAdminRuntimePolicy } from './runtime-policy';
import {
  adminDbUiConfigPath,
  allowInMemoryUserStore,
  allowedFrontendOrigins,
  corsAllowedHeaders,
  corsAllowedMethods,
  bugReportImagesDir,
  bugReportUiConfigPath,
  bugReportsPath,
  cspConnectSrcExtras,
  cspFontSrc,
  cspImgSrc,
  cspScriptSrc,
  cspStyleSrc,
  databaseUrl,
  dbMigrationsDir,
  dbSchemaPath,
  devRestartTouchPath,
  gameUiConfigPath,
  hasPsqlCli,
  IMAGE_UPLOAD_BODY_LIMIT,
  isAdminAuthEnabled,
  isPortAvailable,
  JSON_BODY_LIMIT,
  LARGE_JSON_BODY_LIMIT,
  logsPath,
  matchDbCutoverMode,
  matchesDbDir,
  nodeEnv,
  passwordResetHealthPath,
  port,
  ranksPath,
  repoDir,
  requestedSharedConfigStorageMode,
  templatePath,
  uploadsDir,
} from './bootstrap-config';
import { initializePasswordResetDeliveryHealth } from './services/password-reset-health';
import { deliverPasswordReset } from './services/user-recovery';
import {
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  getCardCatalog,
  getModules,
  getSharedRanks,
  getSharedDeckTemplateStats,
  importSharedRanksJson,
  importSharedDeckTemplateJson,
  jojGame,
  repairGeneratedRankVisualData,
  resetSharedRanks,
  resetSharedDeckTemplate,
  setSharedRanks,
} from './game/game-adapter';
import type { RouteCtx, RouterLike } from './routes/types';

const require = createRequire(import.meta.url);
const { Server, FlatFile } = require('boardgame.io/server') as {
  FlatFile: new (args: { dir: string; logging?: boolean }) => {
    connect?: () => Promise<void>;
    createMatch?: (matchID: string, opts: { initialState: unknown; metadata: Record<string, unknown> | null }) => Promise<void>;
    setState?: (matchID: string, state: unknown, deltalog?: unknown[]) => Promise<void>;
    setMetadata?: (matchID: string, metadata: unknown) => Promise<void>;
    fetch?: (matchID: string, opts: { state?: boolean; metadata?: boolean; initialState?: boolean; log?: boolean }) => Promise<Record<string, unknown>>;
    wipe?: (matchID: string) => Promise<void>;
    listMatches?: (opts?: { gameName?: string; where?: { isGameover?: boolean; updatedBefore?: number; updatedAfter?: number } }) => Promise<string[]>;
  };
  Server: (args: { games: unknown[]; origins?: string[]; db?: unknown }) => {
    run: (port: number, callback?: () => void) => void;
  };
};

const rateLimitState = new Map<string, { count: number; resetAt: number }>();

const logLine = createFileLogger(logsPath);
const adminRuntimePolicy = getAdminRuntimePolicy(process.env);
if (adminRuntimePolicy.startupError) {
  throw new Error(adminRuntimePolicy.startupError);
}

const flatFileMatchDb = new FlatFile({ dir: matchesDbDir, logging: false }) as MatchDbBackend;
let currentMatchDbBackend: MatchDbBackend = flatFileMatchDb;
let liveMirrorUserStore: ReturnType<typeof createUserStore> | null = null;
let liveMirrorMatchStateStore: ReturnType<typeof createMatchStateStore> | null = null;
const matchRuntimeSync = createMatchRuntimeSync({
  flatFileMatchDb,
  getCurrentBackend: () => currentMatchDbBackend,
  setCurrentBackend: (backend) => { currentMatchDbBackend = backend; },
  getUserStore: () => liveMirrorUserStore,
  getMatchStateStore: () => liveMirrorMatchStateStore,
  logLine,
});

const matchDb = {
  type: () => currentMatchDbBackend.type?.() ?? 1,
  connect: async () => {
    await currentMatchDbBackend.connect?.();
  },
  createMatch: async (matchID: string, opts: { initialState: unknown; metadata: Record<string, unknown> | null }) => {
    await currentMatchDbBackend.createMatch?.(matchID, opts);
    await matchRuntimeSync.persistMatchMirrorById(matchID);
  },
  setState: async (matchID: string, state: unknown, deltalog?: unknown[]) => {
    await currentMatchDbBackend.setState?.(matchID, state, deltalog);
    await matchRuntimeSync.persistMatchMirrorById(matchID);
  },
  setMetadata: async (matchID: string, metadata: unknown) => {
    await currentMatchDbBackend.setMetadata?.(matchID, metadata);
    await matchRuntimeSync.persistMatchMirrorById(matchID);
  },
  fetch: async (matchID: string, opts: { state?: boolean; metadata?: boolean; initialState?: boolean; log?: boolean }) =>
    currentMatchDbBackend.fetch?.(matchID, opts) ?? {},
  wipe: async (matchID: string) => {
    await currentMatchDbBackend.wipe?.(matchID);
    await liveMirrorMatchStateStore?.markMatchDeleted(matchID);
  },
  listMatches: async (opts?: { gameName?: string; where?: { isGameover?: boolean; updatedBefore?: number; updatedAfter?: number } }) => {
    try {
      return await currentMatchDbBackend.listMatches?.(opts) ?? [];
    } catch (error) {
      if (error instanceof TypeError && String(error.message).includes('endsWith')) {
        await logLine('WARN', `matchDb listMatches recovered from invalid key entry: ${error.message}`);
        return [];
      }
      throw error;
    }
  },
};

const server = Server({
  games: [jojGame],
  origins: allowedFrontendOrigins,
  db: matchDb,
});
const router = (server as { router?: RouterLike }).router;
const app = (server as { app?: { middleware?: Array<(ctx: RouteCtx, next: () => Promise<unknown>) => Promise<unknown>> } }).app;
const securityHeadersMiddleware = createSecurityHeadersMiddleware({
  allowedOrigins: allowedFrontendOrigins,
  corsAllowedHeaders,
  corsAllowedMethods,
  connectSrcExtras: cspConnectSrcExtras,
  scriptSrc: cspScriptSrc,
  styleSrc: cspStyleSrc,
  imgSrc: cspImgSrc,
  fontSrc: cspFontSrc,
});
const corsMiddleware = createCorsMiddleware({
  allowedOrigins: allowedFrontendOrigins,
  corsAllowedHeaders,
  corsAllowedMethods,
});
const cacheControlMiddleware = createCacheControlMiddleware();
const publicGamesRouteCompatibilityMiddleware = async (ctx: RouteCtx, next: () => Promise<unknown>) => {
  const method = String(ctx?.method ?? '').toUpperCase();
  const path = typeof ctx?.path === 'string' ? ctx.path.replace(/\/+$/, '') || '/' : '';
  const accept = typeof ctx?.request?.headers?.accept === 'string' ? String(ctx.request.headers.accept) : '';
  const wantsHtml = accept.includes('text/html') || accept.includes('*/*');

  if (method === 'GET' && path === '/games' && wantsHtml) {
    ctx.status = 302;
    if (typeof ctx.redirect === 'function') {
      ctx.redirect('/');
      return;
    }
    if (typeof ctx.set === 'function') {
      ctx.set('Location', '/');
    }
    ctx.body = '';
    return;
  }

  await next();
};
if (app && Array.isArray(app.middleware)) {
  app.middleware.unshift(publicGamesRouteCompatibilityMiddleware);
  app.middleware.unshift(securityHeadersMiddleware);
  app.middleware.unshift(corsMiddleware);
  app.middleware.unshift(cacheControlMiddleware);
} else if (router && typeof router.use === 'function') {
  router.use(publicGamesRouteCompatibilityMiddleware);
  router.use(securityHeadersMiddleware);
  router.use(corsMiddleware);
  router.use(cacheControlMiddleware);
}
const enforceRateLimit = createRateLimiter({ rateLimitState, logLine });
const { runGit, runShellCommand, spawnDetachedShell } = createCommandRunners(repoDir);

void (async () => {
  await flatFileMatchDb.connect?.();
  for (const warning of adminRuntimePolicy.warnings) {
    await logLine('WARN', warning);
  }
  await initializePasswordResetDeliveryHealth({ statePath: passwordResetHealthPath });
  const sharedConfigStorageMode: 'postgres' = requestedSharedConfigStorageMode;
  let userPool = null as ReturnType<typeof createPostgresPool> | null;
  let userStore = null as ReturnType<typeof createUserStore> | null;
  let matchStateStore = null as ReturnType<typeof createMatchStateStore> | null;
  let assetStore = null as ReturnType<typeof createAssetStore> | null;
  let bugReportStore = createBugReportStore({
    storePath: bugReportsPath,
    imagesDir: bugReportImagesDir,
    pool: null,
  });
  let postgresAvailableForApp = false;
  let matchDbCutoverSummary: { mode: 'auto' | 'skip'; migratedMatches: number } = { mode: matchDbCutoverMode, migratedMatches: 0 };
  const backgroundHealth = {
    assetSync: { ok: true, lastRunAt: null as string | null, mode: 'pending' as 'pending' | 'ok' | 'error', details: '' },
    matchMirror: { ok: true, lastRunAt: null as string | null, mode: 'pending' as 'pending' | 'ok' | 'error', details: '' },
  };
  const requireAdminAuth = createRequireAdminAuth({
    isAdminAuthEnabled,
    logLine,
    getUserStore: () => userStore,
  });
  const adminAudit = createAdminAuditLogger({ getPool: () => userPool, logLine });

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

  if (sharedConfigStorageMode === 'postgres') {
    if (!databaseUrl || !postgresAvailableForApp) {
      const errorText = 'shared config postgres mode requires a working PostgreSQL connection; file fallback is disabled';
      await logLine('ERROR', errorText);
      throw new Error(errorText);
    } else if (!hasPsqlCli()) {
      const errorText = 'shared config postgres mode requires psql CLI; file fallback is disabled';
      await logLine('ERROR', errorText);
      throw new Error(errorText);
    }
  }

  const {
    saveTemplate,
    saveRanks,
    loadTemplate,
    loadRanks,
    syncCurrentJsonToPostgres,
  } = createSharedConfigStore({
    templatePath,
    ranksPath,
    exportSharedDeckTemplateJson,
    exportSharedRanksJson,
    getCardCatalog,
    importSharedDeckTemplateJson,
    importSharedRanksJson,
    resetSharedRanks,
    storageMode: sharedConfigStorageMode,
    databaseUrl,
  });

  if (router) {
    registerAuthRoutes({
      router,
      userStore,
      logLine,
      jsonBodyLimit: JSON_BODY_LIMIT,
      enforceRateLimit,
    });
    registerUserLobbyRoutes({
      router,
      userStore,
      logLine,
      jsonBodyLimit: JSON_BODY_LIMIT,
      gameUiConfigPath,
      pool: userPool,
    });
    registerAdminRoutes({
      router,
      requireAdminAuth,
      enforceRateLimit,
      readJsonBodySafe,
      logLine,
      JSON_BODY_LIMIT,
      getGitUpdateStatus,
      getGitAuthStatus,
      autoStashRuntimeNoise,
      runGit,
      runShellCommand,
      spawnDetachedShell,
      devRestartTouchPath,
      dbSchemaPath,
      adminDbUiConfigPath,
      gameUiConfigPath,
      importJsonConfigToDb: syncCurrentJsonToPostgres,
      userStore,
      pool: userPool,
      prepareBackupSnapshot: matchRuntimeSync.syncMatchStateMirror,
      backupRootDir: repoDir,
      backupAssetDirs: [uploadsDir],
      persistMatchSnapshot: async (args) => Boolean(await matchStateStore?.persistMatchSnapshot({
        matchId: args.matchId,
        state: args.state as { G?: Record<string, unknown> | null; ctx?: Record<string, unknown> | null },
        metadata: args.metadata ? { ...args.metadata } : undefined,
        snapshotKind: args.snapshotKind,
      })),
      markMatchDeleted: async (matchId) => {
        await matchStateStore?.markMatchDeleted(matchId);
      },
      deliverPasswordResetFn: deliverPasswordReset,
      getServiceHealth: () => ({
        database: { ok: Boolean(userPool), mode: userPool ? 'connected' : 'unavailable' },
        userModule: { ok: Boolean(userStore) },
        sharedConfig: {
          ok: postgresAvailableForApp,
          mode: sharedConfigStorageMode,
          primarySource: 'postgres',
          fallbackEnabled: false,
        },
        matchDb: {
          ok: true,
          backend: currentMatchDbBackend === flatFileMatchDb ? 'flatfile' : 'postgres',
          cutoverMode: matchDbCutoverSummary.mode,
          migratedMatches: matchDbCutoverSummary.migratedMatches,
        },
        assetSync: backgroundHealth.assetSync,
        matchMirror: backgroundHealth.matchMirror,
        bugReports: { ok: true, storage: userPool ? 'postgres+files' : 'files' },
      }),
      auditAdminAction: adminAudit,
    });
    registerBugReportRoutes({
      router,
      requireAdminAuth,
      enforceRateLimit,
      readJsonBodySafe,
      logLine,
      JSON_BODY_LIMIT,
      IMAGE_UPLOAD_BODY_LIMIT,
      bugReportStore,
      bugReportUiConfigPath,
      uploadsDir,
      userStore,
      pool: userPool,
      assetStore,
      auditAdminAction: adminAudit,
    });
    registerSharedRoutes({
      router,
      requireAdminAuth,
      enforceRateLimit,
      readJsonBodySafe,
      logLine,
      JSON_BODY_LIMIT,
      LARGE_JSON_BODY_LIMIT,
      exportSharedDeckTemplateJson,
      getSharedDeckTemplateStats,
      getSharedRanks,
      setSharedRanks,
      resetSharedRanks,
      importSharedDeckTemplateJson,
      resetSharedDeckTemplate,
      saveRanksToDisk: saveRanks,
      saveTemplateToDisk: saveTemplate,
      auditAdminAction: adminAudit,
    });
    registerUploadRoutes({
      router,
      requireAdminAuth,
      enforceRateLimit,
      readJsonBodySafe,
      logLine,
      JSON_BODY_LIMIT,
      IMAGE_UPLOAD_BODY_LIMIT,
      uploadsDir,
      userStore,
      getModules,
      assetStore,
      auditAdminAction: adminAudit,
    });
  }
  await loadTemplate();
  await loadRanks();
  {
    const repair = repairGeneratedRankVisualData();
    if (repair.ranksChanged) {
      await saveRanks();
      await logLine('INFO', 'shared-ranks repaired with generated rank image bindings');
    }
    if (repair.templateChanged) {
      await saveTemplate();
      await logLine('INFO', 'shared-deck-template repaired with generated rank track sets');
    }
  }
  await logLine(
    userStore ? 'INFO' : 'WARN',
    userStore
      ? 'admin auth enabled (administrator session required)'
      : 'admin auth disabled (user module unavailable)',
  );
  await logLine('INFO', `shared config storage mode=${sharedConfigStorageMode}`);
  const portFree = await isPortAvailable(port);
  if (!portFree) {
    await logLine('ERROR', `server port ${port} is already in use; stop the other process or change PORT`);
    return;
  }
  server.run(port, () => {
    void logLine('INFO', `boardgame.io server running at http://localhost:${port}`);
  });
})();
