import { requireUserCsrf } from './services/user-auth';
import type { RequireAdminAuth, RouteCtx } from './routes/types';

export const requireAdminMutationAuth = async (
  ctx: RouteCtx,
  routeLabel: string,
  requireAdminAuth: RequireAdminAuth,
): Promise<boolean> => {
  if (!(await requireAdminAuth(ctx, routeLabel))) return false;
  const explicitAdminToken = typeof ctx?.request?.headers?.['x-admin-token'] === 'string'
    ? String(ctx.request.headers['x-admin-token']).trim()
    : '';
  const authorizationHeader = typeof ctx?.request?.headers?.authorization === 'string'
    ? String(ctx.request.headers.authorization).trim()
    : '';
  if (explicitAdminToken || authorizationHeader) return true;
  return requireUserCsrf(ctx);
};
