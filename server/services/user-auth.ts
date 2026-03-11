import { randomBytes } from 'node:crypto';
import { getCookieValue, setCookieHeader } from '../request-utils';
import type { RouteCtx } from '../routes/types';
import type { UserStore } from './user-store';

export const USER_SESSION_COOKIE = 'joj_user_session';
export const USER_CSRF_COOKIE = 'joj_user_csrf';

export const getCurrentUserFromRequest = async (
  ctx: RouteCtx,
  userStore: UserStore,
) => {
  const token = getCookieValue(ctx, USER_SESSION_COOKIE);
  if (!token) return null;
  return userStore.getUserBySessionToken(token);
};

export const requireUserAuth = async (
  ctx: RouteCtx,
  userStore: UserStore,
) => {
  const user = await getCurrentUserFromRequest(ctx, userStore);
  if (user) return user;
  ctx.status = 401;
  ctx.body = { ok: false, error: 'Unauthorized' };
  return null;
};

export const requireAdministrator = async (
  ctx: RouteCtx,
  userStore: UserStore,
) => {
  const user = await getCurrentUserFromRequest(ctx, userStore);
  if (user?.role === 'administrator') return user;
  ctx.status = 401;
  ctx.body = { ok: false, error: 'Unauthorized' };
  return null;
};

export const clearUserSessionCookie = (ctx: RouteCtx) => {
  setCookieHeader(ctx, USER_SESSION_COOKIE, '', { maxAgeSec: 0, httpOnly: true, sameSite: 'Lax' });
};

export const issueUserCsrfToken = (ctx: RouteCtx) => {
  const token = randomBytes(24).toString('hex');
  setCookieHeader(ctx, USER_CSRF_COOKIE, token, { maxAgeSec: 60 * 60 * 24 * 30, httpOnly: false, sameSite: 'Lax' });
  return token;
};

export const clearUserCsrfCookie = (ctx: RouteCtx) => {
  setCookieHeader(ctx, USER_CSRF_COOKIE, '', { maxAgeSec: 0, httpOnly: false, sameSite: 'Lax' });
};

export const requireUserCsrf = (ctx: RouteCtx) => {
  const cookieToken = getCookieValue(ctx, USER_CSRF_COOKIE);
  const headerToken = typeof ctx?.request?.headers?.['x-csrf-token'] === 'string'
    ? String(ctx.request.headers['x-csrf-token']).trim()
    : '';
  const origin = typeof ctx?.request?.headers?.origin === 'string' ? String(ctx.request.headers.origin) : '';
  const host = typeof ctx?.request?.headers?.host === 'string' ? String(ctx.request.headers.host) : '';
  let sameOrigin = !origin || !host;
  if (!sameOrigin) {
    try {
      const originUrl = new URL(origin);
      const frontendOrigins = Array.from(new Set([
        (process.env.FRONTEND_ORIGIN ?? '').trim(),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:4173',
        'http://127.0.0.1:4173',
      ].filter(Boolean)));
      const frontendUrls = frontendOrigins.map((value) => new URL(value));
      const requestHostName = host.split(':')[0]?.trim().toLowerCase();
      const originHostName = originUrl.hostname.trim().toLowerCase();
      sameOrigin =
        originHostName === requestHostName ||
        frontendUrls.some((frontendUrl) => originUrl.origin === frontendUrl.origin);
    } catch {
      sameOrigin = false;
    }
  }
  if (cookieToken && headerToken && cookieToken === headerToken && sameOrigin) return true;
  ctx.status = 403;
  ctx.body = { ok: false, error: 'CSRF validation failed.' };
  return false;
};
