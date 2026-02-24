export type RouteCtx = any;

export type RouterLike = {
  get: (path: string, handler: (ctx: RouteCtx) => unknown) => void;
  post: (path: string, handler: (ctx: RouteCtx) => unknown) => void;
};

export type RequireAdminAuth = (ctx: RouteCtx, routeLabel: string) => Promise<boolean>;
export type EnforceRateLimit = (
  ctx: RouteCtx,
  key: string,
  limit: number,
  windowMs: number,
) => Promise<boolean>;

export type ReadJsonBodySafe = (args: {
  ctx: RouteCtx;
  routeLabel: string;
  maxBytes: number;
  logLine: (level: string, message: string) => Promise<void>;
}) => Promise<any>;

export type LogLine = (level: string, message: string) => Promise<void>;
