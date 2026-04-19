import type { LogLine, RouterLike } from './routes/types';
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
  getGitUpdateStatus,
} from './git-utils';
import { createAdminAuditLogger } from './services/admin-audit';
import { deliverPasswordReset } from './services/user-recovery';
import {
  gameUiConfigPath,
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
  userStore: ReturnType<typeof import('./services/user-store').createUserStore> | null;
  pool: ReturnType<typeof import('./db/postgres').createPostgresPool> | null;
  logLine: LogLine;
  enforceRateLimit: ReturnType<typeof createRateLimiter>;
  assetStore: ReturnType<typeof import('./services/asset-store').createAssetStore> | null;
  bugReportStore: ReturnType<typeof import('./services/bug-report-store').createBugReportStore>;
  isAdminAuthEnabled: boolean;
  getGitUpdateStatus: typeof getGitUpdateStatus;
  getGitAuthStatus: () => Promise<import('./routes/admin/types').GitAuthStatus>;
  saveGitAuthCredentials: (args: { username: string; token: string }) => Promise<import('./routes/admin/types').GitAuthStatus>;
  clearGitAuthCredentials: () => Promise<import('./routes/admin/types').GitAuthStatus>;
  autoStashRuntimeNoise: typeof autoStashRuntimeNoise;
  runGit: ReturnType<typeof createCommandRunners>['runGit'];
  runShellCommand: ReturnType<typeof createCommandRunners>['runShellCommand'];
  spawnDetachedShell: ReturnType<typeof createCommandRunners>['spawnDetachedShell'];
  importJsonConfigToDb: () => Promise<void>;
  syncJsonToPostgresIncremental: () => Promise<void>;
  prepareBackupSnapshot: () => Promise<void>;
  backupRootDir: string;
  backupAssetDirs: string[];
  persistMatchSnapshot: (args: { matchId: string; state: { G?: unknown; ctx?: Record<string, unknown> | null } & Record<string, unknown>; metadata?: { updatedAt?: number; gameover?: unknown } & Record<string, unknown>; snapshotKind?: 'initial' | 'autosave' | 'manual' | 'admin_stop' | 'admin_reset' | 'final'; }) => boolean | Promise<boolean>;
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
    assetStore,
    bugReportStore,
    isAdminAuthEnabled,
    getGitUpdateStatus,
    getGitAuthStatus,
    saveGitAuthCredentials,
    clearGitAuthCredentials,
    autoStashRuntimeNoise,
    runGit,
    runShellCommand,
    spawnDetachedShell,
    importJsonConfigToDb,
    syncJsonToPostgresIncremental,
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
    saveGitAuthCredentials,
    clearGitAuthCredentials,
    autoStashRuntimeNoise,
    runGit,
    runShellCommand,
    spawnDetachedShell,
    devRestartTouchPath,
    dbSchemaPath,
    adminDbUiConfigPath,
    gameUiConfigPath,
    importJsonConfigToDb,
    syncJsonToPostgresIncremental,
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
    setSharedRanks: () => false,
    resetSharedRanks: async () => {},
    importSharedDeckTemplateJson: () => ({ ok: true }),
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
    getModules: () => [],
    assetStore,
    auditAdminAction: adminAudit,
  });
};
