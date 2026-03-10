import { cloneRank } from './cloneUtils';
import { normalizeImagePath } from './imagePaths';
import { resourceKeys } from './resourceMeta';
import type { RankDefinition, ResourceKey } from './types';

export const isValidRank = (rank: unknown): rank is RankDefinition => {
  if (!rank || typeof rank !== 'object') return false;
  const raw = rank as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return false;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return false;
  if (!raw.requirement || typeof raw.requirement !== 'object') return false;
  if (raw.effect !== undefined && (!raw.effect || typeof raw.effect !== 'object')) return false;
  if (raw.cost !== undefined && (!raw.cost || typeof raw.cost !== 'object')) return false;
  if (raw.bonus !== undefined && (!raw.bonus || typeof raw.bonus !== 'object')) return false;
  if (raw.image !== undefined && typeof raw.image !== 'string') return false;
  if (raw.imageVariants !== undefined) {
    if (!Array.isArray(raw.imageVariants)) return false;
    if (raw.imageVariants.some((value) => typeof value !== 'string')) return false;
  }
  if (raw.victory !== undefined && typeof raw.victory !== 'boolean') return false;
  if (raw.flavor !== undefined && typeof raw.flavor !== 'string') return false;
  const req = raw.requirement as Record<string, unknown>;
  const costSource = (raw.cost as Record<string, unknown> | undefined) ?? {};
  const effectSource = (raw.effect as Record<string, unknown> | undefined) ?? {};
  const bonusSource = ((raw.bonus as Record<string, unknown> | undefined) ?? effectSource) as Record<string, unknown>;
  for (const key of Object.keys(req)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof req[key] !== 'number') return false;
  }
  for (const key of Object.keys(costSource)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof costSource[key] !== 'number') return false;
  }
  for (const key of Object.keys(bonusSource)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof bonusSource[key] !== 'number') return false;
  }
  return true;
};

export const normalizeSharedRanks = (next: RankDefinition[]): RankDefinition[] => next.map((rank) => {
  const rawRank = rank as RankDefinition & { effect?: Partial<Record<ResourceKey, number>> };
  const costSource = rawRank.cost ? { ...rawRank.cost } : {};
  const bonusSource = rawRank.bonus ? { ...rawRank.bonus } : { ...(rawRank.effect ?? {}) };
  const cost: Partial<Record<ResourceKey, number>> = {};
  resourceKeys.forEach((key) => {
    const rawValue = costSource[key] ?? 0;
    if (rawValue !== 0) cost[key] = Math.abs(rawValue);
  });
  const bonus: Partial<Record<ResourceKey, number>> = {};
  resourceKeys.forEach((key) => {
    const rawValue = bonusSource[key] ?? 0;
    if (rawValue !== 0) bonus[key] = rawValue;
  });
  return cloneRank({
    ...rank,
    id: rank.id.trim(),
    name: rank.name.trim(),
    cost,
    bonus,
    image: normalizeImagePath(typeof rawRank.image === 'string' ? rawRank.image : undefined),
    imageVariants: Array.isArray(rawRank.imageVariants)
      ? rawRank.imageVariants
        .map((path) => normalizeImagePath(typeof path === 'string' ? path : undefined))
        .filter((path): path is string => Boolean(path))
      : undefined,
    victory: rawRank.victory === true ? true : undefined,
    flavor: typeof rawRank.flavor === 'string' ? rawRank.flavor : undefined,
  });
});

export const resolveRandomRankImageFromRanks = (ranks: RankDefinition[], rankId: string): string | undefined => {
  const rank = ranks.find((row) => row.id === rankId);
  if (!rank) return undefined;
  const variants = (rank.imageVariants ?? [])
    .map((path) => normalizeImagePath(path))
    .filter((path): path is string => Boolean(path));
  if (variants.length > 0) {
    const index = Math.floor(Math.random() * variants.length);
    return variants[index];
  }
  return normalizeImagePath(rank.image);
};
