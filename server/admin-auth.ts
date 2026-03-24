import { getAdminTokenFromRequest } from './request-utils';
import { requireUserCsrf } from './services/user-auth';
import type { RequireAdminAuth, RouteCtx } from './routes/types';

export const requireAdminMutationAuth = async (
  ctx: RouteCtx,
  routeLabel: string,
  requireAdminAuth: RequireAdminAuth,
): Promise<boolean> => {
  if (!(await requireAdminAuth(ctx, routeLabel))) return false;
  if (getAdminTokenFromRequest(ctx)) return true;
  return requireUserCsrf(ctx);
};
