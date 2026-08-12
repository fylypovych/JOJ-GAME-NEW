import type { RouteCtx } from './routes/types';

export const createCacheControlMiddleware = () => {
  return async (ctx: RouteCtx, next: () => Promise<unknown>) => {
    await next();

    // Add Cache-Control headers for static assets
    const path = typeof ctx.path === 'string' ? ctx.path : '';
    
    // Cache card images for 1 year (immutable assets)
    if (path.startsWith('/cards/') || path.startsWith('/card-assets/')) {
      if (typeof ctx.set === 'function') {
        ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
    
    // Cache UI theme images for 1 year
    if (path.startsWith('/ui-theme-')) {
      if (typeof ctx.set === 'function') {
        ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
    
    // Cache resource icons for 1 year
    if (path.startsWith('/resource-icons/')) {
      if (typeof ctx.set === 'function') {
        ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }

    // Cache uploaded avatars for 1 year
    if (path.startsWith('/profile-image/') || path.startsWith('/api/profile/avatar/')) {
      if (typeof ctx.set === 'function') {
        ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
    
    // Cache admin icons for 1 year
    if (path.startsWith('/admin-icons/')) {
      if (typeof ctx.set === 'function') {
        ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
    
    // Cache other public assets for 1 day
    if (path.startsWith('/public/')) {
      if (typeof ctx.set === 'function') {
        ctx.set('Cache-Control', 'public, max-age=86400');
      }
    }
  };
};
