import { getClientIp, readJsonBodySafe, setCookieHeader } from '../request-utils';
import type { LogLine, RouteCtx, RouterLike } from './types';
import type { UserStore } from '../services/user-store';
import {
  USER_SESSION_COOKIE,
  clearUserSessionCookie,
  issueUserCsrfToken,
  requireUserCsrf,
  requireUserAuth,
} from '../services/user-auth';
import { deliverPasswordReset } from '../services/user-recovery';
import { markPasswordResetDeliveryDegraded, markPasswordResetDeliveryHealthy } from '../services/password-reset-health';
import { routeError, routeOk } from './response';

export interface AuthPasswordConfig {
  jsonBodyLimit: number;
}

export const registerAuthPasswordRoutes = (
  router: RouterLike,
  userStore: UserStore | null,
  logLine: LogLine,
  enforceRateLimit: (ctx: RouteCtx, bucket: string, limit: number, windowMs: number) => Promise<boolean>,
  config: AuthPasswordConfig,
  deliverPasswordResetFn?: typeof deliverPasswordReset,
) => {
  const { jsonBodyLimit } = config;

  const requireUserStore = (ctx: RouteCtx): boolean => {
    if (userStore) return true;
    routeError(ctx, 503, 'User module is unavailable. Configure DATABASE_URL first.');
    return false;
  };

  const getStore = () => {
    if (!userStore) throw new Error('User module is unavailable.');
    return userStore;
  };

  router.post('/api/auth/change-password', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-change-password', 10, 15 * 60_000))) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const user = await requireUserAuth(ctx, store);
    if (!user) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/change-password', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    try {
      await store.changePassword({
        userId: user.id,
        currentPassword: String(body.currentPassword ?? ''),
        nextPassword: String(body.nextPassword ?? ''),
      });
      await store.deleteAllSessionsForUser(user.id);
      const session = await store.createSession({
        userId: user.id,
        sourceIp: getClientIp(ctx),
        userAgent: typeof ctx?.request?.headers?.['user-agent'] === 'string' ? ctx.request.headers['user-agent'] : undefined,
      });
      setCookieHeader(ctx, USER_SESSION_COOKIE, session.token, { maxAgeSec: 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'Lax' });
      routeOk(ctx, { csrfToken: issueUserCsrfToken(ctx) });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/auth/request-password-reset', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-request-password-reset', 8, 15 * 60_000))) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/request-password-reset', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const result = await store.createPasswordResetToken(String(body.login ?? ''));
    if (result) {
      try {
        const delivery = await (deliverPasswordResetFn ?? deliverPasswordReset)({
          usernameOrEmail: String(body.login ?? ''),
          token: result.token,
          expiresAt: result.expiresAt,
          logLine,
        });
        if (delivery.mode === 'log') {
          markPasswordResetDeliveryDegraded({ mode: 'log' });
          await logLine(
            'ERROR',
            'password-reset-delivery-degraded mode=log',
          );
        } else {
          markPasswordResetDeliveryHealthy();
        }
      } catch (error) {
        markPasswordResetDeliveryDegraded({
          mode: 'error',
          error: String(error instanceof Error ? error.message : error),
        });
        await logLine(
          'ERROR',
          `password-reset-delivery-degraded mode=error reason=${String(error instanceof Error ? error.message : error)}`,
        );
      }
    }
    routeOk(ctx, { csrfToken: issueUserCsrfToken(ctx) });
  });

  router.post('/api/auth/reset-password', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-reset-password', 10, 15 * 60_000))) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/reset-password', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    try {
      await store.resetPasswordWithToken({
        token: String(body.token ?? ''),
        nextPassword: String(body.nextPassword ?? ''),
      });
      clearUserSessionCookie(ctx);
      routeOk(ctx, { csrfToken: issueUserCsrfToken(ctx) });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });
};
