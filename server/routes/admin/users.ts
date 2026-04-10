import { getCookieValue } from '../../request-utils';
import { routeError, routeOk } from '../response';
import type { deliverPasswordReset } from '../../services/user-recovery';
import type { AdminRouteSharedDeps, RequireAdminWriteAccess } from './types';
import type { UserStore } from '../../services/user-store';

type AdminUserRoutesDeps = AdminRouteSharedDeps & {
  requireAdminWriteAccess: RequireAdminWriteAccess;
  userStore?: UserStore | null;
  deliverPasswordResetFn: typeof deliverPasswordReset;
};

export const registerAdminUserRoutes = ({
  router,
  requireAdminAuth,
  requireAdminWriteAccess,
  readJsonBodySafe,
  logLine,
  JSON_BODY_LIMIT,
  userStore,
  deliverPasswordResetFn,
}: AdminUserRoutesDeps) => {
  router.post('/api/admin/users/create', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/create'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/users/create',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    try {
      const user = await userStore.createUser({
        username: String(body.username ?? ''),
        email: typeof body.email === 'string' ? body.email : undefined,
        password: String(body.password ?? ''),
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
        preferredLang: body.preferredLang === 'en' ? 'en' : 'uk',
        role: body.role === 'administrator' ? 'administrator' : 'user',
      });
      routeOk(ctx, { user });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.get('/api/admin/users', async (ctx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/users'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const search = typeof ctx?.query?.search === 'string' ? ctx.query.search : '';
    const users = await userStore.listUsersAdmin(search);
    routeOk(ctx, { users });
  });

  router.get('/api/admin/users/detail', async (ctx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/users/detail'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const userId = typeof ctx?.query?.userId === 'string' ? ctx.query.userId.trim() : '';
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    const detail = await userStore.getAdminUserDetail(userId);
    if (!detail) {
      routeError(ctx, 404, 'User not found');
      return;
    }
    routeOk(ctx, { detail });
  });

  router.post('/api/admin/users/status', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/status'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/users/status',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    const status = body.status === 'disabled' ? 'disabled' : 'active';
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    const updated = await userStore.updateUserStatus(userId, status);
    if (!updated) {
      routeError(ctx, 404, 'User not found');
      return;
    }
    routeOk(ctx, { user: updated });
  });

  router.post('/api/admin/users/role', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/role'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/users/role',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    const role = body.role === 'administrator' ? 'administrator' : 'user';
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    const sessionToken = getCookieValue(ctx, 'joj_user_session');
    const actingUser = sessionToken ? await userStore.getUserBySessionToken(sessionToken) : null;
    if (actingUser?.id === userId && actingUser.role === 'administrator' && role !== 'administrator') {
      routeError(ctx, 400, 'You cannot remove the administrator role from your own account.');
      return;
    }
    if (role !== 'administrator') {
      const users = await userStore.listUsersAdmin('', 500);
      const activeAdmins = users.filter((user) => user.role === 'administrator' && user.status === 'active');
      if (activeAdmins.length <= 1 && activeAdmins.some((user) => user.id === userId)) {
        routeError(ctx, 400, 'Cannot remove the last active administrator.');
        return;
      }
    }
    const updated = await userStore.updateUserRole(userId, role);
    if (!updated) {
      routeError(ctx, 404, 'User not found');
      return;
    }
    routeOk(ctx, { user: updated });
  });

  router.post('/api/admin/users/update', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/update'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/users/update',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    try {
      const updated = await userStore.updateUserAdminProfile({
        userId,
        username: String(body.username ?? ''),
        email: typeof body.email === 'string' ? body.email : null,
        displayName: typeof body.displayName === 'string' ? body.displayName : '',
        bio: typeof body.bio === 'string' ? body.bio : '',
        avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl : null,
        preferredLang: body.preferredLang === 'en' ? 'en' : 'uk',
      });
      if (!updated) {
        routeError(ctx, 404, 'User not found');
        return;
      }
      routeOk(ctx, { user: updated });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/admin/users/request-password-reset', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/request-password-reset'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/users/request-password-reset',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const login = String(body.login ?? '').trim();
    if (!login) {
      routeError(ctx, 400, 'Missing login');
      return;
    }
    const result = await userStore.createPasswordResetToken(login);
    if (result) {
      try {
        await deliverPasswordResetFn({
          usernameOrEmail: login,
          token: result.token,
          expiresAt: result.expiresAt,
          logLine,
        });
      } catch (error) {
        routeError(ctx, 500, String(error instanceof Error ? error.message : error));
        return;
      }
    }
    routeOk(ctx, { created: Boolean(result) });
  });

  router.post('/api/admin/users/logout-session', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/logout-session'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/users/logout-session',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const sessionId = String(body.sessionId ?? '').trim();
    if (!sessionId) {
      routeError(ctx, 400, 'Missing sessionId');
      return;
    }
    await userStore.deleteSessionById(sessionId);
    routeOk(ctx);
  });

  router.post('/api/admin/users/logout-all', async (ctx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/logout-all'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({
      ctx,
      routeLabel: '/api/admin/users/logout-all',
      maxBytes: JSON_BODY_LIMIT,
      logLine,
    });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    await userStore.deleteAllSessionsForUser(userId);
    routeOk(ctx);
  });
};
