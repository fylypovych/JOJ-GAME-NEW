import type { RouteCtx } from '../routes/types';

type SecurityPolicyConfig = {
  allowedOrigins: string[];
  corsAllowedHeaders: string[];
  corsAllowedMethods: string[];
  connectSrcExtras?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
};

const withOriginWebSocketVariants = (origin: string) => {
  try {
    const parsed = new URL(origin);
    const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return [`${wsProto}//${parsed.host}`, origin];
  } catch {
    return [origin];
  }
};

export const createSecurityHeadersMiddleware = (config: SecurityPolicyConfig) => {
  const connectSrc = Array.from(new Set([
    "'self'",
    ...config.allowedOrigins.flatMap(withOriginWebSocketVariants),
    ...(config.connectSrcExtras ?? []),
  ])).join(' ');
  const scriptSrc = (config.scriptSrc ?? ["'self'", "'unsafe-inline'"]).join(' ');
  const styleSrc = (config.styleSrc ?? ["'self'", "'unsafe-inline'"]).join(' ');
  const imgSrc = (config.imgSrc ?? ["'self'", 'data:', 'blob:']).join(' ');
  const fontSrc = (config.fontSrc ?? ["'self'"]).join(' ');
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `img-src ${imgSrc}`,
    `font-src ${fontSrc}`,
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return async (ctx: RouteCtx, next: () => Promise<unknown>) => {
    if (typeof ctx?.set === 'function') {
      ctx.set('X-Frame-Options', 'DENY');
      ctx.set('X-Content-Type-Options', 'nosniff');
      ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      ctx.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      ctx.set('Cross-Origin-Opener-Policy', 'same-origin');
      ctx.set('Cross-Origin-Resource-Policy', 'same-origin');
      ctx.set('Content-Security-Policy', csp);
    }
    await next();
  };
};

export const createCorsMiddleware = (config: SecurityPolicyConfig) => {
  const allowedOrigins = new Set(config.allowedOrigins);
  const allowMethods = config.corsAllowedMethods.join(',');
  const allowHeaders = config.corsAllowedHeaders.join(',');
  return async (ctx: RouteCtx, next: () => Promise<unknown>) => {
    const origin = typeof ctx?.request?.headers?.origin === 'string' ? String(ctx.request.headers.origin) : '';
    if (origin && allowedOrigins.has(origin)) {
      if (typeof ctx.set === 'function') {
        ctx.set('Access-Control-Allow-Origin', origin);
        ctx.set('Access-Control-Allow-Credentials', 'true');
        ctx.set('Vary', 'Origin');
      }
      if (String(ctx.method || '').toUpperCase() === 'OPTIONS') {
        if (typeof ctx.set === 'function') {
          ctx.set('Access-Control-Allow-Methods', allowMethods);
          ctx.set('Access-Control-Allow-Headers', allowHeaders);
        }
        ctx.status = 204;
        return;
      }
    }
    await next();
  };
};

