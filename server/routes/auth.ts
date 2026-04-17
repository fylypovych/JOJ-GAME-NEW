import type { LogLine, RouteCtx, RouterLike } from './types';
import type { UserStore, PublicUser } from '../services/user-store';
import { routeError, routeOk } from './response';
import { registerAuthAuthenticationRoutes } from './auth-authentication';
import { registerAuthPasswordRoutes } from './auth-password';
import { registerAuthProfileRoutes } from './auth-profile';
import { deliverPasswordReset } from '../services/user-recovery';

export const registerAuthRoutes = (args: {
  router: RouterLike;
  userStore: UserStore | null;
  logLine: LogLine;
  jsonBodyLimit: number;
  enforceRateLimit: (ctx: RouteCtx, bucket: string, limit: number, windowMs: number) => Promise<boolean>;
  deliverPasswordResetFn?: typeof deliverPasswordReset;
}) => {
  const {
    router,
    userStore,
    logLine,
    jsonBodyLimit,
    enforceRateLimit,
  } = args;

  const requireUserStore = (ctx: RouteCtx): boolean => {
    if (userStore) return true;
    routeError(ctx, 503, 'User module is unavailable. Configure DATABASE_URL first.');
    return false;
  };

  const getStore = () => {
    if (!userStore) throw new Error('User module is unavailable.');
    return userStore;
  };

  // Register authentication routes
  registerAuthAuthenticationRoutes(router, userStore, logLine, enforceRateLimit, { jsonBodyLimit });

  // Register password routes
  registerAuthPasswordRoutes(router, userStore, logLine, enforceRateLimit, { jsonBodyLimit }, args.deliverPasswordResetFn);

  // Register profile routes
  registerAuthProfileRoutes(router, userStore, logLine, enforceRateLimit, { jsonBodyLimit });

  // Public user routes
  router.get('/api/users/profile', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    const username = typeof ctx?.query?.username === 'string' ? ctx.query.username.trim() : '';
    if (!username) {
      routeError(ctx, 400, 'Missing username.');
      return;
    }
    const profile = await store.getPublicProfileByUsername(username);
    if (!profile) {
      routeError(ctx, 404, 'User not found.');
      return;
    }
    routeOk(ctx, profile);
  });

  router.get('/api/users', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    const limit = typeof ctx?.query?.limit === 'string' ? Math.min(200, Math.max(1, parseInt(ctx.query.limit, 10) || 50)) : 50;
    const offset = typeof ctx?.query?.offset === 'string' ? Math.max(0, parseInt(ctx.query.offset, 10) || 0) : 0;
    const search = typeof ctx?.query?.search === 'string' ? ctx.query.search.trim() : '';

    try {
      const users = await ((store as UserStore & { listPublicUsers?: (search: string, limit: number, offset: number) => Promise<PublicUser[]> }).listPublicUsers?.(search, limit, offset) ?? []);
      routeOk(ctx, { users, limit, offset });
    } catch (error) {
      routeError(ctx, 500, String(error instanceof Error ? error.message : error));
    }
  });
};
