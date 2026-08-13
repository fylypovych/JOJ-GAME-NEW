import type { LogLine as FileLogLine } from '../file-logger';

export type RouteHeaders = Record<string, unknown>;
export type RouteResponseHeaders = Record<string, string | string[]>;
export type RouteSetHeader = (name: string, value: string | string[]) => void;

export type RouteCtx = {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  path?: string;
  method?: string;
  ip?: string;
  req?: { socket?: { remoteAddress?: string | null }; on?: (...args: unknown[]) => void; destroy?: () => void };
  request?: { body?: unknown; headers?: RouteHeaders; ip?: string };
  response?: { headers?: RouteResponseHeaders };
  headers?: RouteHeaders;
  app?: { context?: { db?: unknown; lobbyApi?: unknown } };
  db?: unknown;
  status?: number;
  body?: unknown;
  set?: RouteSetHeader;
  append?: RouteSetHeader;
  redirect?: (location: string) => void;
};

export type RouterLike = {
  get: (path: string, handler: (ctx: RouteCtx) => unknown) => void;
  post: (path: string, handler: (ctx: RouteCtx) => unknown) => void;
  use?: (handler: (ctx: RouteCtx, next: () => Promise<unknown>) => Promise<unknown>) => void;
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
