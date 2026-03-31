import { createRequire } from 'node:module';
import { createMemoryPostgresPool, createPostgresPool } from './db/postgres';
import { runSqlMigrations } from './db/migrations';
import { createFileLogger } from './file-logger';
import {
  autoStashRuntimeNoise,
  clearGithubHttpsCredentials,
  createCommandRunners,
  getGitAuthStatus,
  getGitUpdateStatus,
  saveGithubHttpsCredentials,
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
import { createSharedConfigStore } from './storage/shared-config';
import { getAdminRuntimePolicy } from './runtime-policy';
import {
  adminDbUiConfigPath,
  adminToken,
  allowInMemoryUserStore,
  allowedFrontendOrigins,
  bugReportImagesDir,
  bugReportUiConfigPath,
  bugReportsPath,
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
  getSharedRanks,
  getSharedDeckTemplateStats,
  importSharedRanksJson,
  importSharedDeckTemplateJson,
  jojGame,
  resetSharedRanks,
  resetSharedDeckTemplate,
  setSharedRanks,
} from '../src/game/jojGame';

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

type MatchDbBackend = {
  type?: () => number;
  connect?: () => Promise<void>;
  createMatch?: (matchID: string, opts: { initialState: unknown; metadata: Record<string, unknown> | null }) => Promise<void>;
  setState?: (matchID: string, state: unknown, deltalog?: unknown[]) => Promise<void>;
  setMetadata?: (matchID: string, metadata: unknown) => Promise<void>;
  fetch?: (matchID: string, opts: { state?: boolean; metadata?: boolean; initialState?: boolean; log?: boolean }) => Promise<Record<string, unknown>>;
  wipe?: (matchID: string) => Promise<void>;
  listMatches?: (opts?: { gameName?: string; where?: { isGameover?: boolean; updatedBefore?: number; updatedAfter?: number } }) => Promise<string[]>;
};

const flatFileMatchDb = new FlatFile({ dir: matchesDbDir, logging: false }) as MatchDbBackend;
let currentMatchDbBackend: MatchDbBackend = flatFileMatchDb;
let liveMirrorUserStore: ReturnType<typeof createUserStore> | null = null;
let liveMirrorMatchStateStore: ReturnType<typeof createMatchStateStore> | null = null;

const persistMatchMirrorById = async (matchId: string) => {
  if (!liveMirrorMatchStateStore || !liveMirrorUserStore || typeof currentMatchDbBackend.fetch !== 'function') return;
  const fetched = await currentMatchDbBackend.fetch(matchId, { state: true, metadata: true });
  const state = (fetched?.state as Record<string, unknown> | null | undefined) ?? null;
  const metadata = (fetched?.metadata as Record<string, unknown> | null | undefined) ?? undefined;
  if (state) {
    await liveMirrorMatchStateStore.persistMatchSnapshot({
      matchId,
      state,
      metadata,
      snapshotKind: ((state as { ctx?: { gameover?: unknown } }).ctx?.gameover ? 'final' : 'autosave'),
    });
  }
  await liveMirrorUserStore.persistMatchResultIfFinished(matchId, state as never);
};

const matchDb = {
  type: () => currentMatchDbBackend.type?.() ?? 1,
  connect: async () => {
    await currentMatchDbBackend.connect?.();
  },
  createMatch: async (matchID: string, opts: { initialState: unknown; metadata: Record<string, unknown> | null }) => {
    await currentMatchDbBackend.createMatch?.(matchID, opts);
    await persistMatchMirrorById(matchID);
  },
  setState: async (matchID: string, state: unknown, deltalog?: unknown[]) => {
    await currentMatchDbBackend.setState?.(matchID, state, deltalog);
    await persistMatchMirrorById(matchID);
  },
  setMetadata: async (matchID: string, metadata: unknown) => {
    await currentMatchDbBackend.setMetadata?.(matchID, metadata);
    await persistMatchMirrorById(matchID);
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
const router = (server as { router?: any }).router;
const app = (server as { app?: { middleware?: Array<(ctx: any, next: () => Promise<unknown>) => Promise<unknown>> } }).app;
const securityHeadersMiddleware = async (ctx: any, next: () => Promise<unknown>) => {
  if (typeof ctx?.set === 'function') {
    ctx.set('X-Frame-Options', 'DENY');
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    ctx.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    ctx.set('Cross-Origin-Opener-Policy', 'same-origin');
    ctx.set('Cross-Origin-Resource-Policy', 'same-origin');
    ctx.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  await next();
};
const corsMiddleware = async (ctx: any, next: () => Promise<unknown>) => {
    const origin = typeof ctx?.request?.headers?.origin === 'string' ? String(ctx.request.headers.origin) : '';
    if (origin && allowedFrontendOrigins.includes(origin)) {
      if (typeof ctx.set === 'function') {
        ctx.set('Access-Control-Allow-Origin', origin);
        ctx.set('Access-Control-Allow-Credentials', 'true');
        ctx.set('Vary', 'Origin');
      }
      if (String(ctx.method || '').toUpperCase() === 'OPTIONS') {
        if (typeof ctx.set === 'function') {
          ctx.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS');
          ctx.set('Access-Control-Allow-Headers', 'content-type,x-csrf-token,x-admin-token,authorization');
        }
        ctx.status = 204;
        return;
      }
    }
    await next();
  };
if (app && Array.isArray(app.middleware)) {
  app.middleware.unshift(securityHeadersMiddleware);
  app.middleware.unshift(corsMiddleware);
} else if (router && typeof router.use === 'function') {
  router.use(securityHeadersMiddleware);
  router.use(corsMiddleware);
}
const enforceRateLimit = createRateLimiter({ rateLimitState, logLine });
const { runGit, runShellCommand, spawnDetachedShell } = createCommandRunners(repoDir);

type MatchFetchForMirror = {
  state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

void (async () => {
  await flatFileMatchDb.connect?.();
  for (const warning of adminRuntimePolicy.warnings) {
    await logLine('WARN', warning);
  }
  await initializePasswordResetDeliveryHealth({ statePath: passwordResetHealthPath });
  let sharedConfigStorageMode: 'file' | 'postgres' = requestedSharedConfigStorageMode;
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
  const requireAdminAuth = createRequireAdminAuth({
    isAdminAuthEnabled,
    adminToken,
    logLine,
    getUserStore: () => userStore,
  });
  const syncMatchStateMirror = async () => {
    if (!matchStateStore) return;
    const matchIds = (await matchDb.listMatches()).filter((matchId): matchId is string => typeof matchId === 'string' && matchId.length > 0);
    for (const matchId of matchIds) {
      const fetched = await matchDb.fetch(matchId, {
        state: true,
        metadata: true,
      }) as MatchFetchForMirror | null;
      if (fetched?.state) {
        await matchStateStore.persistMatchSnapshot({
          matchId,
          state: fetched.state,
          metadata: fetched.metadata ?? undefined,
          snapshotKind: ((fetched.state as { ctx?: { gameover?: unknown } }).ctx?.gameover ? 'final' : 'autosave'),
        });
      }
      if (userStore) {
        await userStore.persistMatchResultIfFinished(matchId, (fetched?.state ?? null) as never);
      }
    }
  };
  const migrateFlatFileMatchesToPostgres = async (postgresMatchDb: MatchDbBackend) => {
    const matchIds = await flatFileMatchDb.listMatches?.() ?? [];
    for (const matchId of matchIds) {
      const fetched = await flatFileMatchDb.fetch?.(matchId, {
        state: true,
        metadata: true,
        initialState: true,
        log: true,
      });
      const initialState = fetched?.initialState;
      const metadata = (fetched?.metadata as Record<string, unknown> | null | undefined) ?? null;
      if (!initialState || !metadata) continue;
      await postgresMatchDb.createMatch?.(matchId, { initialState, metadata });
      if (typeof fetched?.state !== 'undefined') {
        await postgresMatchDb.setState?.(matchId, fetched.state, Array.isArray(fetched.log) ? fetched.log : []);
      }
      await postgresMatchDb.setMetadata?.(matchId, metadata);
    }
  };

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
      matchStateStore = createMatchStateStore(userPool);
      await matchStateStore.ensureSchema();
      liveMirrorUserStore = userStore;
      liveMirrorMatchStateStore = matchStateStore;
      const postgresMatchDb = createBoardgamePostgresDb(userPool) as MatchDbBackend & { ensureSchema?: () => Promise<void> };
      await postgresMatchDb.ensureSchema?.();
      await migrateFlatFileMatchesToPostgres(postgresMatchDb);
      currentMatchDbBackend = postgresMatchDb;
      bugReportStore = createBugReportStore({
        storePath: bugReportsPath,
        imagesDir: bugReportImagesDir,
        pool: userPool,
      });
      await bugReportStore.ensureSchema();
      postgresAvailableForApp = true;
      await logLine('INFO', 'user auth/profile schema ready');
      await syncMatchStateMirror();
      setInterval(async () => {
        try {
          await syncMatchStateMirror();
        } catch (error) {
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
      matchStateStore = createMatchStateStore(userPool);
      await matchStateStore.ensureSchema();
      liveMirrorUserStore = userStore;
      liveMirrorMatchStateStore = matchStateStore;
      const postgresMatchDb = createBoardgamePostgresDb(userPool) as MatchDbBackend & { ensureSchema?: () => Promise<void> };
      await postgresMatchDb.ensureSchema?.();
      await migrateFlatFileMatchesToPostgres(postgresMatchDb);
      currentMatchDbBackend = postgresMatchDb;
      bugReportStore = createBugReportStore({
        storePath: bugReportsPath,
        imagesDir: bugReportImagesDir,
        pool: userPool,
      });
      await bugReportStore.ensureSchema();
      await syncMatchStateMirror();
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
      sharedConfigStorageMode = 'file';
      await logLine('WARN', 'shared config postgres mode disabled: postgres is unavailable, falling back to file storage');
    } else if (!hasPsqlCli()) {
      sharedConfigStorageMode = 'file';
      await logLine('WARN', 'shared config postgres mode disabled: psql CLI is not installed, falling back to file storage');
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
      saveGithubHttpsCredentials,
      clearGithubHttpsCredentials,
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
      prepareBackupSnapshot: syncMatchStateMirror,
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
      assetStore,
    });
  }
  await loadTemplate();
  await loadRanks();
  await logLine(
    userStore ? 'INFO' : 'WARN',
    userStore
      ? 'admin auth enabled (administrator session + personal admin token)'
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
