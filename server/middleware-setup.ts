import type { RouteCtx, RouterLike } from './routes/types';
import { createCorsMiddleware, createSecurityHeadersMiddleware } from './services/http-security';
import { createCacheControlMiddleware } from './cache-control-middleware';

export interface MiddlewareConfig {
  allowedFrontendOrigins: string[];
  corsAllowedHeaders: string[];
  corsAllowedMethods: string[];
  cspConnectSrcExtras: string[];
  cspScriptSrc: string[];
  cspStyleSrc: string[];
  cspImgSrc: string[];
  cspFontSrc: string[];
}

export const setupMiddleware = (
  app: { middleware?: Array<(ctx: RouteCtx, next: () => Promise<unknown>) => Promise<unknown>> } | null,
  router: RouterLike | null,
  config: MiddlewareConfig,
) => {
  const {
    allowedFrontendOrigins,
    corsAllowedHeaders,
    corsAllowedMethods,
    cspConnectSrcExtras,
    cspScriptSrc,
    cspStyleSrc,
    cspImgSrc,
    cspFontSrc,
  } = config;

  const securityHeadersMiddleware = createSecurityHeadersMiddleware({
    allowedOrigins: allowedFrontendOrigins,
    corsAllowedHeaders,
    corsAllowedMethods,
    connectSrcExtras: cspConnectSrcExtras,
    scriptSrc: cspScriptSrc,
    styleSrc: cspStyleSrc,
    imgSrc: cspImgSrc,
    fontSrc: cspFontSrc,
  });

  const corsMiddleware = createCorsMiddleware({
    allowedOrigins: allowedFrontendOrigins,
    corsAllowedHeaders,
    corsAllowedMethods,
  });

  const cacheControlMiddleware = createCacheControlMiddleware();

  const publicGamesRouteCompatibilityMiddleware = async (ctx: RouteCtx, next: () => Promise<unknown>) => {
    const method = String(ctx?.method ?? '').toUpperCase();
    const path = typeof ctx?.path === 'string' ? ctx.path.replace(/\/+$/, '') || '/' : '';
    const accept = typeof ctx?.request?.headers?.accept === 'string' ? String(ctx.request.headers.accept) : '';
    const wantsHtml = accept.includes('text/html') || accept.includes('*/*');

    if (method === 'GET' && path === '/games' && wantsHtml) {
      ctx.status = 302;
      if (typeof ctx.redirect === 'function') {
        ctx.redirect('/');
        return;
      }
      if (typeof ctx.set === 'function') {
        ctx.set('Location', '/');
      }
      ctx.body = '';
      return;
    }

    await next();
  };

  if (app && Array.isArray(app.middleware)) {
    app.middleware.unshift(publicGamesRouteCompatibilityMiddleware);
    app.middleware.unshift(securityHeadersMiddleware);
    app.middleware.unshift(corsMiddleware);
    app.middleware.unshift(cacheControlMiddleware);
  } else if (router && typeof router.use === 'function') {
    router.use(publicGamesRouteCompatibilityMiddleware);
    router.use(securityHeadersMiddleware);
    router.use(corsMiddleware);
    router.use(cacheControlMiddleware);
  }
};
