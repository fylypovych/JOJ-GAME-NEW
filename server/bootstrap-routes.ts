import type { LogLine, RouteCtx, RouterLike } from './routes/types';
import { createRequireAdminAuth, createRateLimiter, readJsonBodySafe } from './request-utils';
import { registerAuthRoutes } from './routes/auth';
import { registerUserLobbyRoutes } from './routes/user-lobby';
import { registerAdminRoutes } from './routes/admin';
import { registerBugReportRoutes } from './routes/bug-reports';
import { registerSharedRoutes } from './routes/shared';
import { registerUploadRoutes } from './routes/uploads';
import {
  autoStashRuntimeNoise,
  createCommandRunners,
  getGitAuthStatus,
  getGitUpdateStatus,
} from './git-utils';
import { createAdminAuditLogger } from './services/admin-audit';
import { deliverPasswordReset } from './services/user-recovery';
import {
  gameUiConfigPath,
  repoDir,
  devRestartTouchPath,
  dbSchemaPath,
  adminDbUiConfigPath,
  JSON_BODY_LIMIT,
  LARGE_JSON_BODY_LIMIT,
  IMAGE_UPLOAD_BODY_LIMIT,
  uploadsDir,
  bugReportUiConfigPath,
} from './bootstrap-config';

export type RouteBootstrapDeps = {
  router: RouterLike;
  userStore: ReturnType<import('./services/user-store').createUserStore> | null;
  pool: ReturnType<import('./db/postgres').createPostgresPool> | null;
  logLine: LogLine;
  enforceRateLimit: ReturnType<typeof createRateLimiter>;
  matchStateStore: ReturnType<import('./services/match-state-store').createMatchStateStore> | null;
  assetStore: ReturnType<import('./services/asset-store').createAssetStore> | null;
  bugReportStore: ReturnType<import('./services/bug-report-store').createBugReportStore>;
  isAdminAuthEnabled: boolean;
  getGitUpdateStatus: typeof getGitUpdateStatus;
  getGitAuthStatus: typeof getGitAuthStatus;
  autoStashRuntimeNoise: typeof autoStashRuntimeNoise;
  runGit: ReturnType<typeof createCommandRunners>['runGit'];
  runShellCommand: ReturnType<typeof createCommandRunners>['runShellCommand'];
  spawnDetachedShell: ReturnType<typeof createCommandRunners>['spawnDetachedShell'];
  importJsonConfigToDb: () => Promise<void>;
  prepareBackupSnapshot: () => Promise<void>;
  backupRootDir: string;
  backupAssetDirs: string[];
  persistMatchSnapshot: (args: { matchId: string; state: unknown; metadata: unknown; snapshotKind: string }) => Promise<boolean>;
  markMatchDeleted: (matchId: string) => Promise<void>;
  deliverPasswordResetFn: typeof deliverPasswordReset;
};

export const bootstrapRoutes = async (deps: RouteBootstrapDeps) => {
  const {
    router,
    userStore,
    pool,
    logLine,
    enforceRateLimit,
    matchStateStore,
    assetStore,
    bugReportStore,
    isAdminAuthEnabled,
    getGitUpdateStatus,
    getGitAuthStatus,
    autoStashRuntimeNoise,
    runGit,
    runShellCommand,
    spawnDetachedShell,
    importJsonConfigToDb,
    prepareBackupSnapshot,
    backupRootDir,
    backupAssetDirs,
    persistMatchSnapshot,
    markMatchDeleted,
    deliverPasswordResetFn,
  } = deps;

  const requireAdminAuth = createRequireAdminAuth({
    isAdminAuthEnabled,
    logLine,
    getUserStore: () => userStore,
  });

  const adminAudit = createAdminAuditLogger({ getPool: () => pool, logLine });

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
    pool,
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
    importJsonConfigToDb,
    userStore,
    pool,
    prepareBackupSnapshot,
    backupRootDir,
    backupAssetDirs,
    persistMatchSnapshot,
    markMatchDeleted,
    deliverPasswordResetFn,
    getServiceHealth: () => ({
      database: { ok: Boolean(pool), mode: pool ? 'connected' : 'unavailable' },
      userModule: { ok: Boolean(userStore) },
      sharedConfig: {
        ok: true,
        mode: 'postgres',
        primarySource: 'postgres',
        fallbackEnabled: false,
      },
      matchDb: { ok: true, backend: 'postgres', cutoverMode: 'auto', migratedMatches: 0 },
      assetSync: { ok: true, lastRunAt: null, mode: 'ok', details: '' },
      matchMirror: { ok: true, lastRunAt: null, mode: 'ok', details: '' },
      bugReports: { ok: true, storage: pool ? 'postgres+files' : 'files' },
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
    pool,
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
    exportSharedDeckTemplateJson: () => '',
    getSharedDeckTemplateStats: () => ({ totalCards: 0 }),
    getSharedRanks: () => ({ ranks: [] }),
    setSharedRanks: async () => {},
    resetSharedRanks: async () => {},
    importSharedDeckTemplateJson: async () => ({ ok: true }),
    resetSharedDeckTemplate: async () => {},
    saveRanksToDisk: async () => {},
    saveTemplateToDisk: async () => {},
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
    assetStore,
    auditAdminAction: adminAudit,
  });
};
