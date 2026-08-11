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
  regenerateRankVisualData,
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
  allowedFrontendOrigins,
  appRootDir,
  bugReportUiConfigPath,
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
  IMAGE_UPLOAD_BODY_LIMIT,
  isAdminAuthEnabled,
  isPortAvailable,
  JSON_BODY_LIMIT,
  LARGE_JSON_BODY_LIMIT,
  logsPath,
  matchDbCutoverMode,
  nodeEnv,
  port,
  repoDir,
  requestedSharedConfigStorageMode,
  uploadsDir,
} from './bootstrap-config';


const rateLimitState = new Map<string, { count: number; resetAt: number }>();

const logLine = createFileLogger(logsPath);
const adminRuntimePolicy = getAdminRuntimePolicy(process.env);
if (adminRuntimePolicy.startupError) {
  throw new Error(adminRuntimePolicy.startupError);
}

const require = createRequire(import.meta.url);
const { Server } = require('boardgame.io/server') as {
  Server: (args: { games: unknown[]; origins?: string[]; db?: unknown }) => {
    run: (port: number, callback?: () => void) => void;
  };
};

const unavailableMatchDbBackend: MatchDbBackend = {
  connect: async () => {},
  createMatch: async () => { throw new Error('Match DB backend is unavailable.'); },
  setState: async () => { throw new Error('Match DB backend is unavailable.'); },
  setMetadata: async () => { throw new Error('Match DB backend is unavailable.'); },
  fetch: async () => ({}),
  wipe: async () => {},
  listMatches: async () => [],
};
let currentMatchDbBackend: MatchDbBackend = unavailableMatchDbBackend;
let liveMirrorUserStore: ReturnType<typeof import('./services/user-store').createUserStore> | null = null;
let liveMirrorMatchStateStore: ReturnType<typeof import('./services/match-state-store').createMatchStateStore> | null = null;
const matchRuntimeSync = createMatchRuntimeSync({
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

void (async () => {
  for (const warning of adminRuntimePolicy.warnings) {
    await logLine('WARN', warning);
  }
  await initializePasswordResetDeliveryHealth();
  const sharedConfigStorageMode = requestedSharedConfigStorageMode;

  // Validate shared config storage mode
  if (sharedConfigStorageMode === 'postgres') {
    if (!databaseUrl) {
      const errorText = 'shared config postgres mode requires a working PostgreSQL connection; file fallback is disabled';
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
    syncJsonToPostgresIncremental,
    syncAdditionalJsonConfigsToPostgres,
    syncAdditionalPostgresConfigsToJson,
  } = createSharedConfigStore({
    exportSharedDeckTemplateJson,
    exportSharedRanksJson,
    getCardCatalog,
    importSharedDeckTemplateJson,
    importSharedRanksJson,
    resetSharedRanks,
    storageMode: sharedConfigStorageMode,
    databaseUrl,
  }, appRootDir);

  // Initialize database and services
  const dbServices = await initializeDatabase(
    {
      databaseUrl,
      nodeEnv,
      dbMigrationsDir,
      uploadsDir,
      matchDbCutoverMode,
      sharedConfigStore: { loadTemplate, loadRanks, syncAdditionalJsonConfigsToPostgres, syncAdditionalPostgresConfigsToJson },
      appRootDir,
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

  await initializePasswordResetDeliveryHealth({ pool: userPool });

  const gitCredentialStore = createGitCredentialStore({ getPool: () => userPool });
  const { runGit, runShellCommand, spawnDetachedShell } = createCommandRunners(repoDir, gitCredentialStore);

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
        sharedConfigStore: {
          loadTemplate,
          loadRanks,
          syncCurrentJsonToPostgres,
          syncJsonToPostgresIncremental,
          saveRanks,
          saveTemplate,
          syncAdditionalPostgresConfigsToJson: () => syncAdditionalPostgresConfigsToJson?.(databaseUrl, appRootDir) ?? Promise.resolve({}),
        },
        gameAdapter: {
          exportSharedDeckTemplateJson,
          getSharedDeckTemplateStats,
          getSharedRanks,
          setSharedRanks,
          regenerateRankVisualData,
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
