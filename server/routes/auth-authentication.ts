import { getClientIp, getCookieValue, readJsonBodySafe, setCookieHeader } from '../request-utils';
import type { LogLine, RouteCtx, RouterLike } from './types';
import type { UserStore } from '../services/user-store';
import {
  USER_SESSION_COOKIE,
  clearUserCsrfCookie,
  clearUserSessionCookie,
  getCurrentUserFromRequest,
  issueUserCsrfToken,
  requireUserCsrf,
} from '../services/user-auth';
import { routeError, routeOk } from './response';

export interface AuthRegistrationConfig {
  jsonBodyLimit: number;
}

export const registerAuthAuthenticationRoutes = (
  router: RouterLike,
  userStore: UserStore | null,
  logLine: LogLine,
  enforceRateLimit: (ctx: RouteCtx, bucket: string, limit: number, windowMs: number) => Promise<boolean>,
  config: AuthRegistrationConfig,
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

  router.get('/api/auth/me', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    const user = await getCurrentUserFromRequest(ctx, store);
    if (!user) {
      routeOk(ctx, { user: null, csrfToken: issueUserCsrfToken(ctx) });
      return;
    }
    routeOk(ctx, { user, csrfToken: issueUserCsrfToken(ctx) });
  });

  router.post('/api/auth/register', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-register', 10, 15 * 60_000))) return;
    const store = getStore();
    await store.deleteExpiredSessions();
    if (!requireUserCsrf(ctx)) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/register', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    try {
      const user = await store.createUser({
        username: String(body.username ?? ''),
        email: typeof body.email === 'string' ? body.email : undefined,
        password: String(body.password ?? ''),
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
        preferredLang: body.preferredLang === 'en' ? 'en' : 'uk',
        role: 'user',
      });
      const session = await store.createSession({
        userId: user.id,
        sourceIp: getClientIp(ctx),
        userAgent: typeof ctx?.request?.headers?.['user-agent'] === 'string' ? ctx.request.headers['user-agent'] : undefined,
      });
      setCookieHeader(ctx, USER_SESSION_COOKIE, session.token, { maxAgeSec: 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'Lax' });
      routeOk(ctx, { user, csrfToken: issueUserCsrfToken(ctx) });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/auth/login', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'auth-login', 20, 15 * 60_000))) return;
    const store = getStore();
    await store.deleteExpiredSessions();
    if (!requireUserCsrf(ctx)) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/auth/login', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const user = await store.authenticateUser(String(body.login ?? ''), String(body.password ?? ''));
    if (!user) {
      routeError(ctx, 401, 'Invalid credentials.');
      return;
    }
    const session = await store.createSession({
      userId: user.id,
      sourceIp: getClientIp(ctx),
      userAgent: typeof ctx?.request?.headers?.['user-agent'] === 'string' ? ctx.request.headers['user-agent'] : undefined,
    });
    setCookieHeader(ctx, USER_SESSION_COOKIE, session.token, { maxAgeSec: 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'Lax' });
    routeOk(ctx, { user, csrfToken: issueUserCsrfToken(ctx) });
  });

  router.post('/api/auth/logout', async (ctx: RouteCtx) => {
    if (!requireUserStore(ctx)) return;
    const store = getStore();
    if (!requireUserCsrf(ctx)) return;
    const token = getCookieValue(ctx, USER_SESSION_COOKIE);
    if (token) {
      await store.deleteSession(token);
    }
    clearUserSessionCookie(ctx);
    clearUserCsrfCookie(ctx);
    routeOk(ctx);
  });
};
