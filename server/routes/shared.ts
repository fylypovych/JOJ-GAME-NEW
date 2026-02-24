import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike } from './types';

type SharedRoutesDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  LARGE_JSON_BODY_LIMIT: number;
  exportSharedDeckTemplateJson: () => string;
  getSharedDeckTemplateStats: () => unknown;
  getSharedRanks: () => unknown;
  setSharedRanks: (value: any) => boolean;
  resetSharedRanks: () => void;
  importSharedDeckTemplateJson: (json: string) => { ok: true } | { ok: false; error: string };
  resetSharedDeckTemplate: () => void;
  saveRanksToDisk: () => Promise<void>;
  saveTemplateToDisk: () => Promise<void>;
};

export const registerSharedRoutes = ({
  router,
  requireAdminAuth,
  enforceRateLimit,
  readJsonBodySafe,
  logLine,
  JSON_BODY_LIMIT,
  LARGE_JSON_BODY_LIMIT,
  exportSharedDeckTemplateJson,
  getSharedDeckTemplateStats,
  getSharedRanks,
  setSharedRanks,
  resetSharedRanks,
  importSharedDeckTemplateJson,
  resetSharedDeckTemplate,
  saveRanksToDisk,
  saveTemplateToDisk,
}: SharedRoutesDeps) => {
  router.get('/api/shared-deck-template', (ctx: any) => {
    ctx.body = {
      json: exportSharedDeckTemplateJson(),
      stats: getSharedDeckTemplateStats(),
    };
  });

  router.get('/api/shared-ranks', (ctx: any) => {
    ctx.body = { ranks: getSharedRanks() };
  });

  router.post('/api/shared-ranks', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/shared-ranks'))) return;
    if (!(await enforceRateLimit(ctx, 'shared-ranks-write', 20, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/shared-ranks', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const ranks = body.ranks;
    if (!Array.isArray(ranks)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing ranks array' };
      return;
    }
    const ok = setSharedRanks(ranks);
    if (!ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid ranks schema' };
      return;
    }
    await saveRanksToDisk();
    await logLine('INFO', `shared-ranks updated (${ranks.length} rows)`);
    ctx.body = { ok: true, ranks: getSharedRanks() };
  });

  router.post('/api/shared-ranks/reset', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/shared-ranks/reset'))) return;
    if (!(await enforceRateLimit(ctx, 'shared-ranks-reset', 10, 60_000))) return;
    resetSharedRanks();
    await saveRanksToDisk();
    await logLine('INFO', 'shared-ranks reset to default');
    ctx.body = { ok: true, ranks: getSharedRanks() };
  });

  router.post('/api/shared-deck-template/import', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/shared-deck-template/import'))) return;
    if (!(await enforceRateLimit(ctx, 'template-import', 10, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/shared-deck-template/import', maxBytes: LARGE_JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const json = body.json;
    if (typeof json !== 'string') {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing json string' };
      return;
    }
    const result = importSharedDeckTemplateJson(json);
    if (!result.ok) {
      ctx.status = 400;
      ctx.body = result;
      return;
    }
    await saveTemplateToDisk();
    await logLine('INFO', 'shared-deck-template imported');
    ctx.body = { ok: true, stats: getSharedDeckTemplateStats() };
  });

  router.post('/api/shared-deck-template/reset', async (ctx: any) => {
    if (!(await requireAdminAuth(ctx, '/api/shared-deck-template/reset'))) return;
    if (!(await enforceRateLimit(ctx, 'template-reset', 10, 60_000))) return;
    resetSharedDeckTemplate();
    await saveTemplateToDisk();
    await logLine('INFO', 'shared-deck-template reset to default');
    ctx.body = { ok: true, stats: getSharedDeckTemplateStats() };
  });
};
