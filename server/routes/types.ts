import type { LogLine as FileLogLine } from '../file-logger';

export type RouteCtx = {
  query?: Record<string, unknown>;
  request?: { body?: unknown; headers?: Record<string, unknown> };
  headers?: Record<string, unknown>;
  app?: { context?: { db?: unknown } };
  db?: unknown;
  status?: number;
  body?: unknown;
};

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
}) => Promise<Record<string, unknown> | null>;

export type LogLine = FileLogLine;
