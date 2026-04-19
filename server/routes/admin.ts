import { requireAdminMutationAuth } from '../admin-auth';
import { registerAdminDbToolRoutes } from '../services/admin-db-tools';
import { registerAdminGitRoutes } from '../services/admin-git-ops';
import {
  getPasswordResetDeliveryHealth,
  getPublicPasswordResetDeliveryHealth,
} from '../services/password-reset-health';
import { deliverPasswordReset } from '../services/user-recovery';
import { registerAdminAwardsRoutes } from './admin/awards';
import { registerAdminMatchRoutes } from './admin/matches';
import { registerAdminSystemRoutes } from './admin/system';
import type { AdminRoutesDeps } from './admin/types';
import { registerAdminUserRoutes } from './admin/users';

export type { AdminRoutesDeps } from './admin/types';

export const registerAdminRoutes = ({
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
  loadSharedConfigFromDb,
  userStore,
  pool,
  prepareBackupSnapshot,
  backupRootDir,
  backupAssetDirs,
  persistMatchSnapshot,
  markMatchDeleted,
  getPasswordResetDeliveryHealth: getPasswordResetDeliveryHealthFn = getPasswordResetDeliveryHealth,
  getPublicPasswordResetDeliveryHealth: getPublicPasswordResetDeliveryHealthFn = getPublicPasswordResetDeliveryHealth,
  deliverPasswordResetFn = deliverPasswordReset,
  getServiceHealth,
  auditAdminAction,
}: AdminRoutesDeps) => {
  const requireAdminWriteAccess = (ctx: Parameters<typeof requireAdminAuth>[0], routeLabel: string) =>
    requireAdminMutationAuth(ctx, routeLabel, requireAdminAuth);
  const audit = async (
    action: string,
    ctx: Parameters<typeof requireAdminAuth>[0],
    success: boolean,
    details?: Record<string, unknown>,
    matchId?: string | null,
  ) => {
    await auditAdminAction?.({ action, ctx, success, details, matchId });
  };

  registerAdminSystemRoutes({
    router,
    requireAdminAuth,
    requireAdminWriteAccess,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT,
    getServiceHealth,
    userStore,
    getPublicPasswordResetDeliveryHealth: getPublicPasswordResetDeliveryHealthFn,
    getPasswordResetDeliveryHealth: getPasswordResetDeliveryHealthFn,
    gameUiConfigPath,
    pool,
    audit,
  });

  registerAdminAwardsRoutes({
    router,
    requireAdminAuth,
    requireAdminWriteAccess,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT,
    userStore,
  });

  registerAdminUserRoutes({
    router,
    requireAdminAuth,
    requireAdminWriteAccess,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT,
    userStore,
    deliverPasswordResetFn,
  });

  registerAdminDbToolRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT,
    dbSchemaPath,
    adminDbUiConfigPath,
    migrationsPath: './db/migrations',
    importJsonConfigToDb,
    syncJsonToPostgresIncremental,
    loadSharedConfigFromDb,
    pool,
    prepareBackupSnapshot,
    backupRootDir,
    backupAssetDirs,
  });

  registerAdminMatchRoutes({
    router,
    requireAdminAuth,
    requireAdminWriteAccess,
    enforceRateLimit,
    logLine,
    persistMatchSnapshot,
    markMatchDeleted,
    pool,
  });

  registerAdminGitRoutes({
    router,
    requireAdminAuth,
    requireAdminWriteAccess,
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
  });
};
