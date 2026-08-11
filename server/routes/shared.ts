import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike, RouteCtx } from './types';
import { requireAdminMutationAuth } from '../admin-auth';
import type { RankDefinition } from '../../src/game/types';
import { loadAppSettingJson } from '../services/app-settings-store';

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
  setSharedRanks: (value: RankDefinition[]) => boolean;
  regenerateRankVisualData: () => { ranksChanged: boolean; templateChanged: boolean };
  resetSharedRanks: () => void;
  importSharedDeckTemplateJson: (json: string) => { ok: true } | { ok: false; error: string };
  resetSharedDeckTemplate: () => void;
  saveRanksToDisk: () => Promise<void>;
  saveTemplateToDisk: () => Promise<void>;
  pool?: import('pg').Pool | null;
  auditAdminAction?: (input: {
    action: string;
    ctx: RouteCtx;
    success: boolean;
    details?: Record<string, unknown>;
  }) => Promise<void>;
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
  regenerateRankVisualData,
  resetSharedRanks,
  importSharedDeckTemplateJson,
  resetSharedDeckTemplate,
  saveRanksToDisk,
  saveTemplateToDisk,
  pool,
  auditAdminAction,
}: SharedRoutesDeps) => {
  void resetSharedRanks;
  void resetSharedDeckTemplate;
  const requireAdminWriteAccess = (ctx: RouteCtx, routeLabel: string) =>
    requireAdminMutationAuth(ctx, routeLabel, requireAdminAuth);

  const loadSharedConfigFromDb = async (): Promise<boolean> => {
    if (!pool) return false;
    const [templateValue, ranksValue] = await Promise.all([
      loadAppSettingJson<unknown>(pool, 'shared_deck_template'),
      loadAppSettingJson<unknown>(pool, 'shared_ranks'),
    ]);
    if (!templateValue || !ranksValue) return false;
    const templateResult = importSharedDeckTemplateJson(JSON.stringify(templateValue));
    if (!templateResult.ok) return false;
    const ranks = Array.isArray(ranksValue)
      ? ranksValue
      : ((ranksValue as { ranks?: unknown } | null)?.ranks);
    if (!Array.isArray(ranks)) return false;
    if (!setSharedRanks(ranks as RankDefinition[])) return false;
    return true;
  };

  router.get('/api/shared-deck-template', async (ctx: RouteCtx) => {
    const loaded = await loadSharedConfigFromDb();
    if (!loaded) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'Shared config is not available from PostgreSQL.' };
      return;
    }
    ctx.body = {
      json: exportSharedDeckTemplateJson(),
      stats: getSharedDeckTemplateStats(),
    };
  });

  router.get('/api/shared-ranks', async (ctx: RouteCtx) => {
    const loaded = await loadSharedConfigFromDb();
    if (!loaded) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'Shared ranks are not available from PostgreSQL.' };
      return;
    }
    ctx.body = { ranks: getSharedRanks() };
  });

  router.post('/api/shared-ranks', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/shared-ranks'))) return;
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
      await auditAdminAction?.({ action: 'shared.ranks.update', ctx, success: false, details: { reason: 'invalid-ranks-schema' } });
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid ranks schema' };
      return;
    }
    regenerateRankVisualData();
    await saveRanksToDisk();
    await saveTemplateToDisk();
    await logLine('INFO', `shared-ranks updated (${ranks.length} rows)`);
    await auditAdminAction?.({ action: 'shared.ranks.update', ctx, success: true, details: { count: ranks.length } });
    ctx.body = { ok: true, ranks: getSharedRanks() };
  });

  router.post('/api/shared-ranks/reset', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/shared-ranks/reset'))) return;
    if (!(await enforceRateLimit(ctx, 'shared-ranks-reset', 10, 60_000))) return;
    const loaded = await loadSharedConfigFromDb();
    if (!loaded) {
      await auditAdminAction?.({ action: 'shared.ranks.reset', ctx, success: false, details: { reason: 'db-load-failed' } });
      ctx.status = 503;
      ctx.body = { ok: false, error: 'Shared ranks are not available from PostgreSQL.' };
      return;
    }
    await logLine('INFO', 'shared-ranks reloaded from postgres');
    await auditAdminAction?.({ action: 'shared.ranks.reset', ctx, success: true, details: { source: 'postgres' } });
    ctx.body = { ok: true, ranks: getSharedRanks() };
  });

  router.post('/api/shared-deck-template/import', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/shared-deck-template/import'))) return;
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
      await auditAdminAction?.({ action: 'shared.template.import', ctx, success: false, details: { error: result.error } });
      ctx.status = 400;
      ctx.body = result;
      return;
    }
    await saveTemplateToDisk();
    await logLine('INFO', 'shared-deck-template imported');
    await auditAdminAction?.({ action: 'shared.template.import', ctx, success: true });
    ctx.body = { ok: true, stats: getSharedDeckTemplateStats() };
  });

  router.post('/api/shared-deck-template/reset', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/shared-deck-template/reset'))) return;
    if (!(await enforceRateLimit(ctx, 'template-reset', 10, 60_000))) return;
    const loaded = await loadSharedConfigFromDb();
    if (!loaded) {
      await auditAdminAction?.({ action: 'shared.template.reset', ctx, success: false, details: { reason: 'db-load-failed' } });
      ctx.status = 503;
      ctx.body = { ok: false, error: 'Shared config is not available from PostgreSQL.' };
      return;
    }
    await logLine('INFO', 'shared-deck-template reloaded from postgres');
    await auditAdminAction?.({ action: 'shared.template.reset', ctx, success: true, details: { source: 'postgres' } });
    ctx.body = {
      ok: true,
      json: exportSharedDeckTemplateJson(),
      stats: getSharedDeckTemplateStats(),
    };
  });
};
