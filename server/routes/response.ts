import type { RouteCtx } from './types';

export const routeOk = <T extends Record<string, unknown>>(ctx: RouteCtx, payload: T = {} as T) => {
  ctx.body = { ok: true, ...payload };
};

export const routeError = (
  ctx: RouteCtx,
  status: number,
  error: string,
  details?: Record<string, unknown>,
) => {
  ctx.status = status;
  ctx.body = {
    ok: false,
    error,
    ...(details ?? {}),
  };
};

