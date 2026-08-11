import { registerAuthRoutes } from './routes/auth';
import { registerAdminRoutes } from './routes/admin';
import { registerBugReportRoutes } from './routes/bug-reports';
import { registerSharedRoutes } from './routes/shared';
import { registerUploadRoutes } from './routes/uploads';
import { registerUserLobbyRoutes } from './routes/user-lobby';
import { deliverPasswordReset } from './services/user-recovery';
import type { LogLine } from './file-logger';
import type { RouterLike } from './routes/types';
import type { UserStore } from './services/user-store';
import type { MatchDbBackend } from './services/match-runtime-sync';
import type { createAdminAuditLogger } from './services/admin-audit';
import type { PostgresConnDraft } from './db/psql';
import { buildPostgresUrlFromDraft } from './db/psql';
import {
  uploadsDir,
} from './bootstrap-config';
import type {
  autoStashRuntimeNoise,
  createCommandRunners,
  createGitCredentialStore,
  getGitAuthStatus,
  getGitUpdateStatus,
} from './git-utils';
import {
  exportSharedDeckTemplateJson,
  getSharedDeckTemplateStats,
  getSharedRanks,
  setSharedRanks,
  regenerateRankVisualData,
  resetSharedRanks,
  importSharedDeckTemplateJson,
  resetSharedDeckTemplate,
} from './game/game-adapter';

export interface RouteRegistrationConfig {
  jsonBodyLimit: number;
  largeJsonBodyLimit: number;
  imageUploadBodyLimit: number;
  gameUiConfigPath: string;
  adminDbUiConfigPath: string;
  bugReportUiConfigPath: string;
  dbSchemaPath: string;
  devRestartTouchPath: string;
  backupRootDir: string;
  backupAssetDirs: string[];
}

export interface RouteRegistrationServices {
  userStore: UserStore | null;
  pool: ReturnType<typeof import('./db/postgres').createPostgresPool> | null;
  assetStore: ReturnType<typeof import('./services/asset-store').createAssetStore> | null;
  matchStateStore: ReturnType<typeof import('./services/match-state-store').createMatchStateStore> | null;
  bugReportStore: ReturnType<typeof import('./services/bug-report-store').createBugReportStore>;
  currentMatchDbBackend: MatchDbBackend;
  matchDbCutoverSummary: { mode: 'auto' | 'skip'; migratedMatches: number };
  postgresAvailableForApp: boolean;
  backgroundHealth: {
    assetSync: { ok: boolean; lastRunAt: string | null; mode: 'pending' | 'ok' | 'error'; details: string };
    matchMirror: { ok: boolean; lastRunAt: string | null; mode: 'pending' | 'ok' | 'error'; details: string };
  };
}

export interface RouteRegistrationDeps {
  logLine: LogLine;
  enforceRateLimit: (ctx: import('./routes/types').RouteCtx, bucket: string, limit: number, windowMs: number) => Promise<boolean>;
  requireAdminAuth: ReturnType<typeof import('./request-utils').createRequireAdminAuth>;
  readJsonBodySafe: typeof import('./request-utils').readJsonBodySafe;
  runGit: ReturnType<typeof createCommandRunners>['runGit'];
  runShellCommand: ReturnType<typeof createCommandRunners>['runShellCommand'];
  spawnDetachedShell: ReturnType<typeof createCommandRunners>['spawnDetachedShell'];
  gitCredentialStore: ReturnType<typeof createGitCredentialStore>;
  getGitUpdateStatus: typeof getGitUpdateStatus;
  getGitAuthStatus: typeof getGitAuthStatus;
  autoStashRuntimeNoise: typeof autoStashRuntimeNoise;
  matchRuntimeSync: {
    syncMatchStateMirror: () => Promise<void>;
    persistMatchMirrorById: (matchId: string) => Promise<void>;
  };
  adminAudit: ReturnType<typeof createAdminAuditLogger>;
  sharedConfigStore: {
    loadTemplate: (draft?: PostgresConnDraft) => Promise<void>;
    loadRanks: (draft?: PostgresConnDraft) => Promise<void>;
    syncCurrentJsonToPostgres: (draft?: PostgresConnDraft) => Promise<void>;
    syncJsonToPostgresIncremental: (draft?: PostgresConnDraft) => Promise<void>;
    saveRanks: () => Promise<void>;
    saveTemplate: () => Promise<void>;
    syncAdditionalPostgresConfigsToJson?: (targetUrl?: string) => Promise<Record<string, boolean>>;
  };
  gameAdapter: {
    getModules: () => unknown[];
    exportSharedDeckTemplateJson: unknown;
    getSharedDeckTemplateStats: unknown;
    getSharedRanks: unknown;
    setSharedRanks: unknown;
    regenerateRankVisualData: unknown;
    resetSharedRanks: unknown;
    importSharedDeckTemplateJson: unknown;
    resetSharedDeckTemplate: unknown;
  };
}

export const registerAllRoutes = (
  router: RouterLike,
  config: RouteRegistrationConfig,
  services: RouteRegistrationServices,
  deps: RouteRegistrationDeps,
) => {
  const {
    jsonBodyLimit,
    largeJsonBodyLimit,
    imageUploadBodyLimit,
    gameUiConfigPath,
    adminDbUiConfigPath,
    bugReportUiConfigPath,
    dbSchemaPath,
    devRestartTouchPath,
    backupRootDir,
    backupAssetDirs,
  } = config;

  const {
    userStore,
    pool,
    assetStore,
    matchStateStore,
    bugReportStore,
    matchDbCutoverSummary,
    backgroundHealth,
  } = services;

  const {
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
    sharedConfigStore,
    gameAdapter,
  } = deps;

  registerAuthRoutes({
    router,
    userStore,
    logLine,
    jsonBodyLimit,
    enforceRateLimit,
  });

  registerUserLobbyRoutes({
    router,
    userStore,
    logLine,
    jsonBodyLimit,
    gameUiConfigPath,
    pool,
  });

  registerAdminRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: jsonBodyLimit,
    getGitUpdateStatus,
    getGitAuthStatus: () => getGitAuthStatus(runGit, gitCredentialStore),
    saveGitAuthCredentials: async ({ username, token }) => {
      await gitCredentialStore.save({ username, token });
      return getGitAuthStatus(runGit, gitCredentialStore);
    },
    clearGitAuthCredentials: async () => {
      await gitCredentialStore.clear();
      return getGitAuthStatus(runGit, gitCredentialStore);
    },
    autoStashRuntimeNoise,
    runGit,
    runShellCommand,
    spawnDetachedShell,
    devRestartTouchPath,
    dbSchemaPath,
    adminDbUiConfigPath,
    gameUiConfigPath,
    importJsonConfigToDb: sharedConfigStore.syncCurrentJsonToPostgres,
    syncJsonToPostgresIncremental: sharedConfigStore.syncJsonToPostgresIncremental,
    loadSharedConfigFromDb: async (draft?: PostgresConnDraft) => {
      await sharedConfigStore.loadTemplate(draft);
      await sharedConfigStore.loadRanks(draft);
      if (draft) {
        await sharedConfigStore.syncAdditionalPostgresConfigsToJson?.(buildPostgresUrlFromDraft(draft));
      } else {
        await sharedConfigStore.syncAdditionalPostgresConfigsToJson?.();
      }
    },
    userStore,
    pool,
    prepareBackupSnapshot: matchRuntimeSync.syncMatchStateMirror,
    backupRootDir,
    backupAssetDirs,
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
      database: { ok: Boolean(pool), mode: pool ? 'connected' : 'unavailable' },
      userModule: { ok: Boolean(userStore) },
      sharedConfig: {
        ok: services.postgresAvailableForApp,
        mode: 'postgres',
        primarySource: 'postgres',
        fallbackEnabled: false,
      },
      matchDb: {
        ok: true,
        backend: 'postgres',
        cutoverMode: matchDbCutoverSummary.mode,
        migratedMatches: matchDbCutoverSummary.migratedMatches,
      },
      assetSync: backgroundHealth.assetSync,
      matchMirror: backgroundHealth.matchMirror,
      bugReports: { ok: Boolean(pool), storage: 'postgres' },
    }),
    auditAdminAction: adminAudit,
  });

  registerBugReportRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: jsonBodyLimit,
    IMAGE_UPLOAD_BODY_LIMIT: imageUploadBodyLimit,
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
    JSON_BODY_LIMIT: jsonBodyLimit,
    LARGE_JSON_BODY_LIMIT: largeJsonBodyLimit,
    exportSharedDeckTemplateJson: gameAdapter.exportSharedDeckTemplateJson as typeof exportSharedDeckTemplateJson,
    getSharedDeckTemplateStats: gameAdapter.getSharedDeckTemplateStats as typeof getSharedDeckTemplateStats,
    getSharedRanks: gameAdapter.getSharedRanks as typeof getSharedRanks,
    setSharedRanks: gameAdapter.setSharedRanks as typeof setSharedRanks,
    regenerateRankVisualData: gameAdapter.regenerateRankVisualData as typeof regenerateRankVisualData,
    resetSharedRanks: gameAdapter.resetSharedRanks as typeof resetSharedRanks,
    importSharedDeckTemplateJson: gameAdapter.importSharedDeckTemplateJson as typeof importSharedDeckTemplateJson,
    resetSharedDeckTemplate: gameAdapter.resetSharedDeckTemplate as typeof resetSharedDeckTemplate,
    saveRanksToDisk: sharedConfigStore.saveRanks,
    saveTemplateToDisk: sharedConfigStore.saveTemplate,
    pool,
    auditAdminAction: adminAudit,
  });

  registerUploadRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT: jsonBodyLimit,
    IMAGE_UPLOAD_BODY_LIMIT: imageUploadBodyLimit,
    uploadsDir,
    userStore,
    getModules: gameAdapter.getModules,
    assetStore,
    auditAdminAction: adminAudit,
  });
};
