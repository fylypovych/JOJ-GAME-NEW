import { createRequire } from 'node:module';
import { createMemoryPostgresPool, createPostgresPool } from './db/postgres';
import { runSqlMigrations } from './db/migrations';
import { createFileLogger } from './file-logger';
import { autoStashRuntimeNoise, createCommandRunners, getGitUpdateStatus } from './git-utils';
import { createRateLimiter, createRequireAdminAuth, readJsonBodySafe } from './request-utils';
import { registerAdminRoutes } from './routes/admin';
import { registerAuthRoutes } from './routes/auth';
import { registerSharedRoutes } from './routes/shared';
import { registerUploadRoutes } from './routes/uploads';
import { registerUserLobbyRoutes } from './routes/user-lobby';
import { createUserStore } from './services/user-store';
import { createSharedConfigStore } from './storage/shared-config';
import { getAdminRuntimePolicy } from './runtime-policy';
import {
  adminDbUiConfigPath,
  adminToken,
  allowInMemoryUserStore,
  allowedFrontendOrigins,
  databaseUrl,
  dbMigrationsDir,
  dbSchemaPath,
  devRestartTouchPath,
  hasPsqlCli,
  IMAGE_UPLOAD_BODY_LIMIT,
  isAdminAuthEnabled,
  isPortAvailable,
  JSON_BODY_LIMIT,
  LARGE_JSON_BODY_LIMIT,
  logsPath,
  matchesDbDir,
  nodeEnv,
  port,
  ranksPath,
  repoDir,
  requestedSharedConfigStorageMode,
  templatePath,
  uploadsDir,
} from './bootstrap-config';
import {
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
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
  FlatFile: new (args: { dir: string; logging?: boolean }) => unknown;
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

const matchDb = new FlatFile({ dir: matchesDbDir, logging: false });
const rawMatchDb = matchDb as {
  games?: { keys?: () => Promise<unknown[]> };
  listMatches?: (...args: unknown[]) => Promise<unknown>;
};
if (rawMatchDb.games && typeof rawMatchDb.games.keys === 'function') {
  const originalKeys = rawMatchDb.games.keys.bind(rawMatchDb.games);
  rawMatchDb.games.keys = async () => {
    const keys = await originalKeys();
    return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string' && key.length > 0) : [];
  };
}
if (typeof rawMatchDb.listMatches === 'function') {
  const originalListMatches = rawMatchDb.listMatches.bind(rawMatchDb);
  rawMatchDb.listMatches = async (...args: unknown[]) => {
    try {
      return await originalListMatches(...args);
    } catch (error) {
      if (error instanceof TypeError && String(error.message).includes('endsWith')) {
        await logLine('WARN', `matchDb listMatches recovered from invalid key entry: ${error.message}`);
        return [];
      }
      throw error;
    }
  };
}

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

void (async () => {
  for (const warning of adminRuntimePolicy.warnings) {
    await logLine('WARN', warning);
  }
  let sharedConfigStorageMode: 'file' | 'postgres' = requestedSharedConfigStorageMode;
  let userPool = null as ReturnType<typeof createPostgresPool> | null;
  let userStore = null as ReturnType<typeof createUserStore> | null;
  let postgresAvailableForApp = false;
  const requireAdminAuth = createRequireAdminAuth({
    isAdminAuthEnabled,
    adminToken,
    logLine,
    getUserStore: () => userStore,
  });

  if (databaseUrl) {
    try {
      userPool = createPostgresPool(databaseUrl);
      await runSqlMigrations(userPool, dbMigrationsDir);
      userStore = createUserStore(userPool);
      await userStore.ensureSchema();
      await userStore.deleteExpiredSessions();
      postgresAvailableForApp = true;
      await logLine('INFO', 'user auth/profile schema ready');
      setInterval(async () => {
        if (!userStore) return;
        try {
          const pendingMatchIds = await userStore.listPendingPersistMatchIds();
          for (const matchId of pendingMatchIds) {
            const fetched = await (matchDb as { fetch?: (matchID: string, opts: { state?: boolean; metadata?: boolean }) => Promise<{ state?: unknown } | null> }).fetch?.(matchId, {
              state: true,
              metadata: true,
            });
            await userStore.persistMatchResultIfFinished(matchId, (fetched?.state ?? null) as never);
          }
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
    });
    registerAdminRoutes({
      router,
      requireAdminAuth,
      enforceRateLimit,
      readJsonBodySafe,
      logLine,
      JSON_BODY_LIMIT,
      getGitUpdateStatus,
      autoStashRuntimeNoise,
      runGit,
      runShellCommand,
      spawnDetachedShell,
      isAdminAuthEnabled,
      devRestartTouchPath,
      dbSchemaPath,
      adminDbUiConfigPath,
      importJsonConfigToDb: syncCurrentJsonToPostgres,
      userStore,
      
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
    });
  }
  await loadTemplate();
  await loadRanks();
  await logLine(
    isAdminAuthEnabled ? 'INFO' : 'WARN',
    isAdminAuthEnabled ? 'admin auth enabled (ADMIN_TOKEN set)' : 'admin auth disabled (ADMIN_TOKEN is empty)',
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
