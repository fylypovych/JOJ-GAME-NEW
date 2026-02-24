import type { LogLine as FileLogLine } from '../file-logger';

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
  logLine: FileLogLine;
}) => Promise<any>;

export type LogLine = FileLogLine;
