import { routeError, routeOk } from '../response';
import type { AdminRouteSharedDeps, RequireAdminWriteAccess } from './types';
import type { UserStore } from '../../services/user-store';

type AdminAwardsRoutesDeps = AdminRouteSharedDeps & {
  requireAdminWriteAccess: RequireAdminWriteAccess;
  userStore?: UserStore | null;
};

export const registerAdminAwardsRoutes = ({
  router,
  requireAdminAuth,
  requireAdminWriteAccess,
  readJsonBodySafe,
  logLine,
  JSON_BODY_LIMIT,
  userStore,
}: AdminAwardsRoutesDeps) => {
  router.get('/api/admin/analytics', async (ctx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/analytics'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    routeOk(ctx, { analytics: await userStore.getAdminAnalytics() });
  });

  router.get('/api/admin/awards', async (ctx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/awards'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    routeOk(ctx, { awards: await userStore.listAwardDefinitions() });
  });

  router.post('/api/admin/awards/save', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/awards/save'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/awards/save',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    try {
      const awards = await userStore.saveAwardDefinition({
        id: typeof body.id === 'string' ? body.id : undefined,
        key: String(body.key ?? ''),
        title: String(body.title ?? ''),
        description: String(body.description ?? ''),
        category: body.category as never,
        metric: body.metric as never,
        threshold: Number(body.threshold ?? 0),
        badgeLabel: String(body.badgeLabel ?? ''),
        badgeVariant: body.badgeVariant as never,
        iconPath: typeof body.iconPath === 'string' ? body.iconPath : null,
        active: body.active !== false,
        sortOrder: Number(body.sortOrder ?? 0),
      });
      routeOk(ctx, { awards });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/admin/awards/delete', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/awards/delete'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/awards/delete',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const awardId = String(body.awardId ?? '').trim();
    if (!awardId) {
      routeError(ctx, 400, 'Missing awardId');
      return;
    }
    const awards = await userStore.deleteAwardDefinition(awardId);
    routeOk(ctx, { awards });
  });
};
