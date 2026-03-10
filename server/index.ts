import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env';
import { createFileLogger } from './file-logger';
import { autoStashRuntimeNoise, createCommandRunners, getGitUpdateStatus } from './git-utils';
import { createRateLimiter, createRequireAdminAuth, readJsonBodySafe } from './request-utils';
import { registerAdminRoutes } from './routes/admin';
import { registerSharedRoutes } from './routes/shared';
import { registerUploadRoutes } from './routes/uploads';
import { createSharedConfigStore } from './storage/shared-config';
import {
  exportSharedDeckTemplateJson,
  getSharedRanks,
  getSharedDeckTemplateStats,
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
const sharedConfigStorageMode = (storageModeEnv === 'postgres' || storageModeEnv === 'db') ? 'postgres' : 'file';
const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
const nodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();

const logLine = createFileLogger(logsPath);

if (!isAdminAuthEnabled && nodeEnv === 'production' && !allowInsecureAdmin) {
  throw new Error('Refusing to start with admin auth disabled in production. Set ADMIN_TOKEN or explicitly ALLOW_INSECURE_ADMIN=1.');
}

const server = Server({
  games: [jojGame],
  origins: [process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'],
  db: new FlatFile({ dir: matchesDbDir, logging: false }),
});
const router = (server as { router?: any }).router;
const templatePath = path.resolve(appRootDir, 'database', 'shared-deck-template.json');
const ranksPath = path.resolve(appRootDir, 'database', 'shared-ranks.json');
const uploadsDir = path.resolve(appRootDir, 'public', 'cards');
const repoDir = appRootDir;
const devRestartTouchPath = path.resolve(appRootDir, 'server', 'restart.touch');
const dbSchemaPath = path.resolve(appRootDir, 'db', 'schema', 'db.sql');
const adminDbUiConfigPath = path.resolve(appRootDir, 'database', 'admin-db-ui-config.json');

const requireAdminAuth = createRequireAdminAuth({ isAdminAuthEnabled, adminToken, logLine });
const enforceRateLimit = createRateLimiter({ rateLimitState, logLine });
const { runGit, runShellCommand, spawnDetachedShell } = createCommandRunners(repoDir);
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
  importSharedDeckTemplateJson,
  getSharedRanks,
  setSharedRanks,
  resetSharedRanks,
  storageMode: sharedConfigStorageMode,
  databaseUrl,
});

if (router) {
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

const port = Number(process.env.PORT ?? 8000);

void (async () => {
  await loadTemplate();
  await loadRanks();
  await logLine(
    isAdminAuthEnabled ? 'INFO' : 'WARN',
    isAdminAuthEnabled ? 'admin auth enabled (ADMIN_TOKEN set)' : 'admin auth disabled (ADMIN_TOKEN is empty)',
  );
  await logLine('INFO', `shared config storage mode=${sharedConfigStorageMode}`);
  server.run(port, () => {
    void logLine('INFO', `boardgame.io server running at http://localhost:${port}`);
  });
})();
