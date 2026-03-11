import { createRequire } from 'node:module';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryPostgresPool, createPostgresPool } from './db/postgres';
import { runSqlMigrations } from './db/migrations';
import { loadEnvFile } from './env';
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

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const appRootDir = path.resolve(serverDir, '..');

const logsPath = path.resolve(appRootDir, 'logs', 'server.log');
const matchesDbDir = path.resolve(appRootDir, 'database', 'matches');
const envPath = path.resolve(appRootDir, '.env');
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

const JSON_BODY_LIMIT = 2 * 1024 * 1024;
const LARGE_JSON_BODY_LIMIT = 8 * 1024 * 1024;
const IMAGE_UPLOAD_BODY_LIMIT = 16 * 1024 * 1024;
loadEnvFile(envPath);

const adminToken = (process.env.ADMIN_TOKEN ?? '').trim();
const disableAdminAuth = /^(1|true|yes)$/i.test((process.env.DISABLE_ADMIN_AUTH ?? '').trim());
const isAdminAuthEnabled = !disableAdminAuth && adminToken.length > 0;
const allowInsecureAdmin = /^(1|true|yes)$/i.test((process.env.ALLOW_INSECURE_ADMIN ?? '').trim());
const storageModeEnv = (process.env.STORAGE_MODE ?? 'file').trim().toLowerCase();
const requestedSharedConfigStorageMode = (storageModeEnv === 'postgres' || storageModeEnv === 'db') ? 'postgres' : 'file';
const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
const nodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();

const logLine = createFileLogger(logsPath);

if (!isAdminAuthEnabled && nodeEnv === 'production' && !allowInsecureAdmin) {
  throw new Error('Refusing to start with admin auth disabled in production. Set ADMIN_TOKEN or explicitly ALLOW_INSECURE_ADMIN=1.');
}

const matchDb = new FlatFile({ dir: matchesDbDir, logging: false });

const server = Server({
  games: [jojGame],
  origins: [
    process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ],
  db: matchDb,
});
const router = (server as { router?: any }).router;
const app = (server as { app?: { middleware?: Array<(ctx: any, next: () => Promise<unknown>) => Promise<unknown>> } }).app;
const allowedFrontendOrigins = Array.from(new Set([
  process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]));
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
  app.middleware.unshift(corsMiddleware);
} else if (router && typeof router.use === 'function') {
  router.use(corsMiddleware);
}
const templatePath = path.resolve(appRootDir, 'database', 'shared-deck-template.json');
const ranksPath = path.resolve(appRootDir, 'database', 'shared-ranks.json');
const uploadsDir = path.resolve(appRootDir, 'public', 'cards');
const repoDir = appRootDir;
const devRestartTouchPath = path.resolve(appRootDir, 'server', 'restart.touch');
const dbSchemaPath = path.resolve(appRootDir, 'db', 'schema', 'db.sql');
const dbMigrationsDir = path.resolve(appRootDir, 'db', 'migrations');
const adminDbUiConfigPath = path.resolve(appRootDir, 'database', 'admin-db-ui-config.json');

const enforceRateLimit = createRateLimiter({ rateLimitState, logLine });
const { runGit, runShellCommand, spawnDetachedShell } = createCommandRunners(repoDir);

const hasPsqlCli = () => {
  const probe = spawnSync('psql', ['--version'], { stdio: 'ignore', windowsHide: true });
  return !probe.error;
};

const isPortAvailable = (targetPort: number) => new Promise<boolean>((resolve) => {
  const probe = net.createServer();
  probe.once('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') resolve(false);
    else resolve(false);
  });
  probe.once('listening', () => {
    probe.close(() => resolve(true));
  });
  probe.listen(targetPort);
});

const port = Number(process.env.PORT ?? 8000);

void (async () => {
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
      await userStore.ensureDefaultAdministrator();
      await userStore.deleteExpiredSessions();
      postgresAvailableForApp = true;
      await logLine('INFO', 'user auth/profile schema ready; default administrator admin/admin ensured');
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

  if (!userStore && nodeEnv !== 'production') {
    try {
      userPool = await createMemoryPostgresPool();
      userStore = createUserStore(userPool);
      await userStore.ensureSchema();
      await userStore.ensureDefaultAdministrator();
      await userStore.deleteExpiredSessions();
      await logLine('WARN', 'user auth/profile module running on in-memory fallback for local/dev mode');
    } catch (error) {
      userPool = null;
      userStore = null;
      await logLine('WARN', `user auth/profile module disabled (memory fallback failed): ${String(error instanceof Error ? error.message : error)}`);
    }
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
