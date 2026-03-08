import type { JojGameState, RankDefinition, ResourceKey } from './types';

type RankEngineDeps = {
  getActiveRanks: () => RankDefinition[];
  hasResources: (resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>) => boolean;
  spendResources: (resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>) => void;
  applyResourceDelta: (
    resources: Record<ResourceKey, number>,
    delta: Partial<Record<ResourceKey, number>>,
  ) => void;
  clampNonNegativeResources: (resources: Record<ResourceKey, number>) => void;
  syncPlayerState: (G: JojGameState, playerID: string) => void;
  onRankChanged?: (G: JojGameState, playerID: string, fromRankId: string, toRankId: string) => void;
};

export function rankSeatLimitForPlayerCount(playerCount: number): number {
  if (playerCount <= 2) return 1;
  if (playerCount <= 4) return 2;
  return 3;
}

export const createRankEngine = ({
  getActiveRanks,
  hasResources,
  spendResources,
  applyResourceDelta,
  clampNonNegativeResources,
  syncPlayerState,
  onRankChanged,
}: RankEngineDeps) => {
  const rankSeatLimit = rankSeatLimitForPlayerCount;

  const promoteRank = (G: JojGameState, playerID: string, playerCount: number): boolean => {
    const ranks = getActiveRanks();
    const currentRankId = G.ranks[playerID];
    const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
    const nextRank = ranks[currentRankIdx + 1];
    if (!nextRank) return false;

    const occupied = Object.entries(G.ranks)
      .filter(([pid, rankId]) => pid !== playerID && rankId === nextRank.id)
      .length;
    if (occupied >= rankSeatLimit(playerCount)) return false;

    const playerResources = G.resources[playerID];
    if (!hasResources(playerResources, nextRank.requirement)) return false;
    if (!hasResources(playerResources, nextRank.cost)) return false;
    spendResources(playerResources, nextRank.cost);
    applyResourceDelta(playerResources, nextRank.bonus);
    clampNonNegativeResources(playerResources);
    G.ranks[playerID] = nextRank.id;
    onRankChanged?.(G, playerID, currentRankId, nextRank.id);
    syncPlayerState(G, playerID);
    return true;
  };

  const promoteToSpecificRank = (
    G: JojGameState,
    playerID: string,
    targetRankId: string,
    playerCount: number,
  ): { ok: true; rank: RankDefinition } | { ok: false } => {
    const ranks = getActiveRanks();
    const currentRankId = G.ranks[playerID];
    const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
    const targetRankIdx = ranks.findIndex((r) => r.id === targetRankId);
    if (targetRankIdx <= currentRankIdx) return { ok: false };
    const targetRank = ranks[targetRankIdx];
    if (!targetRank) return { ok: false };

    const occupied = Object.entries(G.ranks)
      .filter(([pid, rankId]) => pid !== playerID && rankId === targetRank.id)
      .length;
    if (occupied >= rankSeatLimit(playerCount)) return { ok: false };

    const playerResources = G.resources[playerID];
    if (!hasResources(playerResources, targetRank.requirement)) return { ok: false };
    if (!hasResources(playerResources, targetRank.cost)) return { ok: false };

    spendResources(playerResources, targetRank.cost);
    applyResourceDelta(playerResources, targetRank.bonus);
    clampNonNegativeResources(playerResources);
    G.ranks[playerID] = targetRank.id;
    onRankChanged?.(G, playerID, currentRankId, targetRank.id);
    syncPlayerState(G, playerID);
    return { ok: true, rank: targetRank };
  };

  const grantSpecificRankIgnoringRequirements = (
    G: JojGameState,
    playerID: string,
    targetRankId: string,
    playerCount: number,
  ): { ok: true; rank: RankDefinition; fromRankId: string; applied: boolean }
    | { ok: false; reason: 'invalid-rank' | 'no-seat' } => {
    const ranks = getActiveRanks();
    const currentRankId = G.ranks[playerID];
    const currentRankIdx = ranks.findIndex((r) => r.id === currentRankId);
    const targetRankIdx = ranks.findIndex((r) => r.id === targetRankId);
    if (targetRankIdx < 0) return { ok: false, reason: 'invalid-rank' };
    const targetRank = ranks[targetRankIdx];
    if (!targetRank) return { ok: false, reason: 'invalid-rank' };

    if (currentRankIdx >= targetRankIdx) {
      return { ok: true, rank: targetRank, fromRankId: currentRankId, applied: false };
    }

    const occupied = Object.entries(G.ranks)
      .filter(([pid, rankId]) => pid !== playerID && rankId === targetRank.id)
      .length;
    if (occupied >= rankSeatLimit(playerCount)) return { ok: false, reason: 'no-seat' };

    const playerResources = G.resources[playerID];
    applyResourceDelta(playerResources, targetRank.bonus);
    clampNonNegativeResources(playerResources);
    G.ranks[playerID] = targetRank.id;
    onRankChanged?.(G, playerID, currentRankId, targetRank.id);
    syncPlayerState(G, playerID);
    return { ok: true, rank: targetRank, fromRankId: currentRankId, applied: true };
  };

  const demoteByOneRankWithSeatCheck = (
    G: JojGameState,
    targetPlayerID: string,
    playerCount: number,
  ): { ok: true; fromRankId: string; toRankId: string } | { ok: false; reason: 'min-rank' | 'no-seat' | 'invalid-rank' } => {
    const ranks = getActiveRanks();
    const currentRankId = G.ranks[targetPlayerID];
    const currentRankIdx = ranks.findIndex((r) => r.id === currentRankId);
    if (currentRankIdx < 0) return { ok: false, reason: 'invalid-rank' };
    if (currentRankIdx === 0) return { ok: false, reason: 'min-rank' };
    const lowerRank = ranks[currentRankIdx - 1];
    if (!lowerRank) return { ok: false, reason: 'invalid-rank' };

    const occupied = Object.entries(G.ranks)
      .filter(([pid, rankId]) => pid !== targetPlayerID && rankId === lowerRank.id)
      .length;
    if (occupied >= rankSeatLimit(playerCount)) return { ok: false, reason: 'no-seat' };

    G.ranks[targetPlayerID] = lowerRank.id;
    onRankChanged?.(G, targetPlayerID, currentRankId, lowerRank.id);
    syncPlayerState(G, targetPlayerID);
    return { ok: true, fromRankId: currentRankId, toRankId: lowerRank.id };
  };

  return {
    rankSeatLimit,
    promoteRank,
    promoteToSpecificRank,
    grantSpecificRankIgnoringRequirements,
    demoteByOneRankWithSeatCheck,
  };
};
