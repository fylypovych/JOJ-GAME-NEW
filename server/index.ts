import { createRequire } from 'node:module';
import { createFileLogger } from './file-logger';
import {
  autoStashRuntimeNoise,
  createCommandRunners,
  createGitCredentialStore,
  getGitAuthStatus,
  getGitUpdateStatus,
} from './git-utils';
import { createRateLimiter, createRequireAdminAuth, readJsonBodySafe } from './request-utils';
import { createAdminAuditLogger } from './services/admin-audit';
import { createMatchRuntimeSync, type MatchDbBackend } from './services/match-runtime-sync';
import { createSharedConfigStore } from './storage/shared-config';
import { getAdminRuntimePolicy } from './runtime-policy';
import { initializePasswordResetDeliveryHealth } from './services/password-reset-health';
import {
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  getCardCatalog,
  getModules,
  getSharedDeckTemplateStats,
  getSharedRanks,
  importSharedRanksJson,
  importSharedDeckTemplateJson,
  jojGame,
  repairGeneratedRankVisualData,
  resetSharedRanks,
  resetSharedDeckTemplate,
  setSharedRanks,
} from './game/game-adapter';
import type { RouteCtx, RouterLike } from './routes/types';
import { setupMiddleware } from './middleware-setup';
import { initializeDatabase } from './database-setup';
import { registerAllRoutes } from './route-registration';
import { startServer } from './server-startup';
import {
  adminDbUiConfigPath,
  allowInMemoryUserStore,
  allowedFrontendOrigins,
  bugReportImagesDir,
  bugReportUiConfigPath,
  bugReportsPath,
  cspConnectSrcExtras,
  cspFontSrc,
  cspImgSrc,
  cspScriptSrc,
  cspStyleSrc,
  corsAllowedHeaders,
  corsAllowedMethods,
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
let liveMirrorUserStore: ReturnType<typeof import('./services/user-store').createUserStore> | null = null;
let liveMirrorMatchStateStore: ReturnType<typeof import('./services/match-state-store').createMatchStateStore> | null = null;
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

// Setup middleware
setupMiddleware(app ?? null, router ?? null, {
  allowedFrontendOrigins,
  corsAllowedHeaders,
  corsAllowedMethods,
  cspConnectSrcExtras,
  cspScriptSrc,
  cspStyleSrc,
  cspImgSrc,
  cspFontSrc,
});

const enforceRateLimit = createRateLimiter({ rateLimitState, logLine });
const gitCredentialStore = createGitCredentialStore(repoDir);
const { runGit, runShellCommand, spawnDetachedShell } = createCommandRunners(repoDir, gitCredentialStore);

void (async () => {
  await flatFileMatchDb.connect?.();
  for (const warning of adminRuntimePolicy.warnings) {
    await logLine('WARN', warning);
  }
  await initializePasswordResetDeliveryHealth({ statePath: passwordResetHealthPath });
  const sharedConfigStorageMode: 'postgres' = requestedSharedConfigStorageMode;

  // Validate shared config storage mode
  if (sharedConfigStorageMode === 'postgres') {
    if (!databaseUrl) {
      const errorText = 'shared config postgres mode requires a working PostgreSQL connection; file fallback is disabled';
      await logLine('ERROR', errorText);
      throw new Error(errorText);
    } else if (!hasPsqlCli()) {
      const errorText = 'shared config postgres mode requires psql CLI; file fallback is disabled';
      await logLine('ERROR', errorText);
      throw new Error(errorText);
    }
  }

  // Create shared config store
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

  // Initialize database and services
  const dbServices = await initializeDatabase(
    {
      databaseUrl,
      nodeEnv,
      allowInMemoryUserStore,
      dbMigrationsDir,
      uploadsDir,
      bugReportsPath,
      bugReportImagesDir,
      matchDbCutoverMode,
      sharedConfigStore: { loadTemplate, loadRanks },
    },
    {
      logLine,
      matchRuntimeSync,
    },
  );

  const {
    userPool,
    userStore,
    matchStateStore,
    assetStore,
    bugReportStore,
    postgresAvailableForApp,
    matchDbCutoverSummary,
    liveMirrorUserStore: newLiveMirrorUserStore,
    liveMirrorMatchStateStore: newLiveMirrorMatchStateStore,
    backgroundHealth,
  } = dbServices;

  liveMirrorUserStore = newLiveMirrorUserStore;
  liveMirrorMatchStateStore = newLiveMirrorMatchStateStore;

  const requireAdminAuth = createRequireAdminAuth({
    isAdminAuthEnabled,
    logLine,
    getUserStore: () => userStore,
  });
  const adminAudit = createAdminAuditLogger({ getPool: () => userPool, logLine });

  // Register all routes
  if (router) {
    registerAllRoutes(
      router,
      {
        jsonBodyLimit: JSON_BODY_LIMIT,
        largeJsonBodyLimit: LARGE_JSON_BODY_LIMIT,
        imageUploadBodyLimit: IMAGE_UPLOAD_BODY_LIMIT,
        gameUiConfigPath,
        adminDbUiConfigPath,
        bugReportUiConfigPath,
        dbSchemaPath,
        devRestartTouchPath,
        backupRootDir: repoDir,
        backupAssetDirs: [uploadsDir],
      },
      {
        userStore,
        pool: userPool,
        assetStore,
        matchStateStore,
        bugReportStore,
        currentMatchDbBackend,
        flatFileMatchDb,
        matchDbCutoverSummary,
        postgresAvailableForApp,
        backgroundHealth,
      },
      {
        logLine,
        enforceRateLimit,
        requireAdminAuth,
        readJsonBodySafe,
        runGit,
        runShellCommand,
        spawnDetachedShell,
        gitCredentialStore,
        getGitUpdateStatus,
        getGitAuthStatus,
        autoStashRuntimeNoise,
        matchRuntimeSync,
        adminAudit,
        sharedConfigStore: { syncCurrentJsonToPostgres, saveRanks, saveTemplate },
        gameAdapter: {
          exportSharedDeckTemplateJson,
          getSharedDeckTemplateStats,
          getSharedRanks,
          setSharedRanks,
          resetSharedRanks,
          importSharedDeckTemplateJson,
          resetSharedDeckTemplate,
          getModules,
        },
      },
    );
  }

  // Start server
  await startServer(
    { port },
    {
      logLine,
      isPortAvailable,
      server,
      sharedConfigStore: { loadTemplate, loadRanks, saveTemplate, saveRanks },
      gameAdapter: { repairGeneratedRankVisualData },
      userStore,
    },
  );
})();
