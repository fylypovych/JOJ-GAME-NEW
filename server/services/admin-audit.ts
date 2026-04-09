import type { Pool } from 'pg';
import { getClientIp } from '../request-utils';
import type { RouteCtx } from '../routes/types';
import type { LogLine } from '../routes/types';

type AuditInput = {
  action: string;
  ctx: RouteCtx;
  success: boolean;
  actor?: string;
  matchId?: string | null;
  details?: Record<string, unknown>;
};

export const createAdminAuditLogger = (args: {
  pool?: Pool | null;
  getPool?: () => Pool | null | undefined;
  logLine: LogLine;
}) => {
  const { pool, getPool, logLine } = args;

  return async ({ action, ctx, success, actor, matchId, details }: AuditInput) => {
    const sourceIp = getClientIp(ctx);
    const payload = {
      action,
      actor: actor ?? null,
      sourceIp,
      matchId: matchId ?? null,
      success,
      details: details ?? {},
    };
    const resolvedPool = getPool?.() ?? pool;
    if (resolvedPool) {
      try {
        await resolvedPool.query(
          `INSERT INTO admin_audit_log (action, actor, source_ip, match_id, success, details)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [action, actor ?? null, sourceIp, matchId ?? null, success, JSON.stringify(details ?? {})],
        );
      } catch {
        // fall back to file log below
      }
    }
    await logLine(success ? 'INFO' : 'WARN', `admin-audit ${JSON.stringify(payload)}`);
  };
};
