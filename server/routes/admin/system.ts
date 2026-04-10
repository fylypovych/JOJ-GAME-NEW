import { buildPublicHealthPayload, getReadinessFromServices } from '../../services/service-health';
import { loadLobbyGameUiConfig, saveLobbyGameUiConfig } from '../../services/game-ui-config';
import { routeError, routeOk } from '../response';
import type { AdminAudit, AdminRouteSharedDeps, RequireAdminWriteAccess } from './types';
import type { PublicPasswordResetDeliveryHealth } from '../../services/password-reset-health';
import type { Pool } from 'pg';
import type { UserStore } from '../../services/user-store';
import type { ServiceHealthSnapshot } from '../../services/service-health';

type AdminSystemRoutesDeps = AdminRouteSharedDeps & {
  requireAdminWriteAccess: RequireAdminWriteAccess;
  getServiceHealth?: () => ServiceHealthSnapshot;
  userStore?: UserStore | null;
  getPublicPasswordResetDeliveryHealth: () => PublicPasswordResetDeliveryHealth;
  getPasswordResetDeliveryHealth: () => unknown;
  gameUiConfigPath: string;
  pool?: Pool | null;
  audit: AdminAudit;
};

export const registerAdminSystemRoutes = ({
  router,
  requireAdminAuth,
  requireAdminWriteAccess,
  enforceRateLimit,
  readJsonBodySafe,
  logLine,
  JSON_BODY_LIMIT,
  getServiceHealth,
  userStore,
  getPublicPasswordResetDeliveryHealth,
  getPasswordResetDeliveryHealth,
  gameUiConfigPath,
  pool,
  audit,
}: AdminSystemRoutesDeps) => {
  router.get('/api/health', (ctx) => {
    const services = getServiceHealth?.() ?? {};
    routeOk(ctx, buildPublicHealthPayload({
      adminAuthEnabled: Boolean(userStore),
      passwordResetDelivery: getPublicPasswordResetDeliveryHealth(),
      services,
    }));
  });

  router.get('/api/ready', (ctx) => {
    const services = getServiceHealth?.() ?? {};
    const ready = getReadinessFromServices(services);
    if (!ready) {
      routeError(ctx, 503, 'Service readiness check failed.', { services });
      return;
    }
    routeOk(ctx, { services });
  });

  router.get('/api/game/ui-config', async (ctx) => {
    if (!(await enforceRateLimit(ctx, 'public-game-ui-config-get', 60, 60_000))) return;
    const config = await loadLobbyGameUiConfig(gameUiConfigPath, pool);
    routeOk(ctx, config);
  });

  router.get('/api/admin/health/password-reset', async (ctx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/health/password-reset'))) return;
    routeOk(ctx, { passwordResetDelivery: getPasswordResetDeliveryHealth() });
  });

  router.get('/api/admin/verify', async (ctx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/verify'))) return;
    routeOk(ctx, { adminAuthEnabled: Boolean(userStore) });
  });

  router.get('/api/admin/game/ui-config', async (ctx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/game/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-game-ui-config-get', 30, 60_000))) return;
    const config = await loadLobbyGameUiConfig(gameUiConfigPath, pool);
    routeOk(ctx, config);
  });

  router.post('/api/admin/game/ui-config', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/game/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-game-ui-config-post', 20, 60_000))) return;
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/game/ui-config',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    try {
      const config = await saveLobbyGameUiConfig(gameUiConfigPath, body, pool);
      await audit('admin.game-ui-config.save', ctx, true, { updatedAt: config.updatedAt });
      routeOk(ctx, { ...config, message: 'Game UI config saved' });
    } catch (error) {
      await audit('admin.game-ui-config.save', ctx, false, {
        error: String(error instanceof Error ? error.message : error),
      });
      routeError(ctx, 500, String(error instanceof Error ? error.message : error));
    }
  });
};
