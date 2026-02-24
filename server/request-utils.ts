import type { LogLine } from './file-logger';

export class BodyTooLargeError extends Error {
  readonly code = 'BODY_TOO_LARGE';
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds limit (${maxBytes} bytes)`);
    this.name = 'BodyTooLargeError';
  }
}

export const getClientIp = (ctx: any): string => {
  const forwarded = ctx?.request?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return String(ctx?.ip ?? ctx?.request?.ip ?? 'unknown');
};

export const getAdminTokenFromRequest = (ctx: any): string => {
  const authHeader = ctx?.request?.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const xToken = ctx?.request?.headers?.['x-admin-token'];
  return typeof xToken === 'string' ? xToken.trim() : '';
};

export const createRequireAdminAuth = ({
  isAdminAuthEnabled,
  adminToken,
  logLine,
}: {
  isAdminAuthEnabled: boolean;
  adminToken: string;
  logLine: LogLine;
}) => async (ctx: any, routeLabel: string): Promise<boolean> => {
  if (!isAdminAuthEnabled) return true;
  const token = getAdminTokenFromRequest(ctx);
  if (token === adminToken) return true;
  ctx.status = 401;
  ctx.body = { ok: false, error: 'Unauthorized' };
  await logLine('WARN', `unauthorized route=${routeLabel} ip=${getClientIp(ctx)}`);
  return false;
};

export const createRateLimiter = ({
  rateLimitState,
  logLine,
}: {
  rateLimitState: Map<string, { count: number; resetAt: number }>;
  logLine: LogLine;
}) => async (ctx: any, bucket: string, limit: number, windowMs: number): Promise<boolean> => {
  const now = Date.now();
  const key = `${bucket}:${getClientIp(ctx)}`;
  const current = rateLimitState.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitState.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  current.count += 1;
  if (current.count <= limit) return true;

  const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  if (typeof ctx?.set === 'function') ctx.set('Retry-After', String(retryAfterSec));
  ctx.status = 429;
  ctx.body = { ok: false, error: 'Too many requests', retryAfterSec };
  await logLine('WARN', `rate-limit hit bucket=${bucket} ip=${getClientIp(ctx)}`);
  return false;
};

export const readJsonBody = async (ctx: any, maxBytes: number): Promise<Record<string, unknown>> => {
  const existingBody = ctx?.request?.body;
  if (existingBody && typeof existingBody === 'object') {
    return existingBody as Record<string, unknown>;
  }

  const req = ctx?.req;
  if (!req || typeof req.on !== 'function') return {};

  const raw = await new Promise<string>((resolve, reject) => {
    let data = '';
    let size = 0;
    let done = false;
    const fail = (error: Error) => {
      if (done) return;
      done = true;
      reject(error);
    };
    const succeed = (value: string) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on('data', (chunk: Buffer | string) => {
      const chunkText = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      size += Buffer.byteLength(chunkText, 'utf8');
      if (size > maxBytes) {
        fail(new BodyTooLargeError(maxBytes));
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      data += chunkText;
    });
    req.on('end', () => succeed(data));
    req.on('error', (error: Error) => fail(error));
  });

  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export const readJsonBodySafe = async ({
  ctx,
  routeLabel,
  maxBytes,
  logLine,
}: {
  ctx: any;
  routeLabel: string;
  maxBytes: number;
  logLine: LogLine;
}): Promise<Record<string, unknown> | null> => {
  try {
    return await readJsonBody(ctx, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      ctx.status = 413;
      ctx.body = { ok: false, error: `Payload too large. Limit: ${error.maxBytes} bytes` };
      await logLine('WARN', `payload-too-large route=${routeLabel} ip=${getClientIp(ctx)} limit=${error.maxBytes}`);
      return null;
    }
    ctx.status = 400;
    ctx.body = { ok: false, error: 'Invalid request body' };
    await logLine('WARN', `invalid-body route=${routeLabel} ip=${getClientIp(ctx)} error=${String(error)}`);
    return null;
  }
};

