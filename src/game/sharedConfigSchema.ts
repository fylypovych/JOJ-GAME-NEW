import { cloneRank } from './cloneUtils';
import { normalizeSharedRanks } from './sharedConfigRanks';
import type { RankDefinition } from './types';

export const SHARED_TEMPLATE_SCHEMA_KIND = 'joj-shared-deck-template';
export const SHARED_TEMPLATE_SCHEMA_VERSION = 3;
export const SHARED_RANKS_SCHEMA_KIND = 'joj-shared-ranks';
export const SHARED_RANKS_SCHEMA_VERSION = 1;

export type SharedRanksDocument = {
  kind: typeof SHARED_RANKS_SCHEMA_KIND;
  version: typeof SHARED_RANKS_SCHEMA_VERSION;
  ranks: RankDefinition[];
};

export const serializeSharedRanksDocument = (ranks: RankDefinition[]): SharedRanksDocument => ({
  kind: SHARED_RANKS_SCHEMA_KIND,
  version: SHARED_RANKS_SCHEMA_VERSION,
  ranks: normalizeSharedRanks(ranks).map(cloneRank),
});

export const parseImportedRanksPayload = (value: unknown): RankDefinition[] | null => {
  if (Array.isArray(value)) return value as RankDefinition[];
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== SHARED_RANKS_SCHEMA_KIND) return null;
  if (raw.version !== SHARED_RANKS_SCHEMA_VERSION) return null;
  return Array.isArray(raw.ranks) ? (raw.ranks as RankDefinition[]) : null;
};

export const unwrapImportedTemplateDocument = (
  value: unknown,
): { ok: true; raw: Record<string, unknown>; version: number } | { ok: false; error: string } => {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Template must be an object' };
  const raw = value as Record<string, unknown>;
  if (raw.kind === SHARED_TEMPLATE_SCHEMA_KIND) {
    if (typeof raw.version !== 'number') return { ok: false, error: 'Template version is missing' };
    if (raw.version > SHARED_TEMPLATE_SCHEMA_VERSION) {
      return { ok: false, error: `Unsupported template version: ${String(raw.version)}` };
    }
    return { ok: true, raw, version: raw.version };
  }
  return { ok: true, raw, version: 0 };
};
