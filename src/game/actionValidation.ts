import { getCardPlayBehavior, type CardPlayBehavior } from './cardRules';
import { rankSeatLimitForRank } from './rankEngine';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from './types';
import { actionValidationKeys, type ActionTranslator, defaultTranslator } from './actionValidation.i18n';
import { VVNZ_PLAY_COST, countAvailableResources } from './vvnzCost';

export type ResourceLabels = Record<ResourceKey, string>;
export type ActionAvailability = { allowed: boolean; reason: string | null };

export const getMissingResourceParts = (
  required: Partial<Record<ResourceKey, number>> | undefined,
  current: Record<ResourceKey, number>,
  resourceLabels: ResourceLabels,
): string[] => (Object.entries(required ?? {}) as Array<[ResourceKey, number]>)
  .map(([key, amount]) => {
    const missing = Math.max(0, (amount ?? 0) - (current[key] ?? 0));
    return missing > 0 ? `${resourceLabels[key]} ${missing}` : null;
  })
  .filter((v): v is string => Boolean(v));

export const findRankById = (ranks: RankDefinition[], rankId?: string | null): RankDefinition | undefined =>
  ranks.find((r) => r.id === (rankId ?? ''));

export const findNextRank = (ranks: RankDefinition[], currentRankId?: string | null): RankDefinition | undefined => {
  const idx = ranks.findIndex((r) => r.id === (currentRankId ?? ''));
  return idx >= 0 && idx < ranks.length - 1 ? ranks[idx + 1] : undefined;
};

export const getPromoteBlockedReason = (args: {
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>;
  playerID: string;
  ranks: RankDefinition[];
  resourceLabels: ResourceLabels;
  lang?: 'uk' | 'en';
  translator?: ActionTranslator;
}): string | null => {
  const { G, playerID, ranks, resourceLabels, translator } = args;
  const t = translator ?? defaultTranslator;
  const currentRankId = G.ranks[playerID];
  if (G.promotedThisTurn?.[playerID]) {
    return t(actionValidationKeys.promote.alreadyPromotedThisTurn);
  }
  const currentIdx = ranks.findIndex((r) => r.id === currentRankId);
  const nextRank = currentIdx >= 0 ? ranks[currentIdx + 1] : undefined;
  if (!nextRank) {
    return t(actionValidationKeys.promote.noNextRank);
  }
  const row = G.resources[playerID];
  if (!row) return t(actionValidationKeys.promote.playerResourcesUnavailable);

  const missingReq = getMissingResourceParts(nextRank.requirement, row, resourceLabels);
  if (missingReq.length > 0) {
    return t(actionValidationKeys.promote.missingRequirements, { rankName: nextRank.name, missing: missingReq.join(', ') });
  }
  const missingCost = getMissingResourceParts(nextRank.cost, row, resourceLabels);
  if (missingCost.length > 0) {
    return t(actionValidationKeys.promote.missingCost, { rankName: nextRank.name, missing: missingCost.join(', ') });
  }
  const playerCount = Object.keys(G.players ?? {}).length;
  const seatLimit = rankSeatLimitForRank(playerCount, nextRank.id, ranks);
  const occupied = Object.entries(G.ranks ?? {})
    .filter(([pid, rid]) => pid !== playerID && rid === nextRank.id)
    .length;
  if (occupied >= seatLimit) {
    return t(actionValidationKeys.promote.noFreeSeat, { rankName: nextRank.name, seatLimit });
  }
  return null;
};

export const getPromoteActionState = (args: {
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>;
  playerID: string;
  ranks: RankDefinition[];
  resourceLabels: ResourceLabels;
  translator?: ActionTranslator;
}): ActionAvailability & { nextRank?: RankDefinition } => {
  const nextRank = findNextRank(args.ranks, args.G.ranks[args.playerID]);
  const reason = getPromoteBlockedReason(args);
  return {
    allowed: !reason,
    reason,
    nextRank,
  };
};

export const getVvnzPlayBlockedReason = (args: {
  card: Pick<CardDefinition, 'category' | 'grantRank'>;
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>;
  playerID: string;
  ranks: RankDefinition[];
  resourceLabels: ResourceLabels;
  lang?: 'uk' | 'en';
  translator?: ActionTranslator;
}): string | null => {
  const { card, G, playerID, ranks, translator } = args;
  const t = translator ?? defaultTranslator;
  if (card.category !== 'VVNZ') return null;
  if (G.promotedThisTurn?.[playerID]) {
    return t(actionValidationKeys.vvnz.alreadyPromotedThisTurn);
  }
  if (!card.grantRank) {
    return t(actionValidationKeys.vvnz.noGrantRank);
  }
  const row = G.resources[playerID];
  if (!row) return t(actionValidationKeys.vvnz.resourcesNotLoaded);
  const currentIdx = ranks.findIndex((r) => r.id === (G.ranks[playerID] ?? ''));
  const targetRank = ranks.find((r) => r.id === card.grantRank);
  const targetIdx = ranks.findIndex((r) => r.id === card.grantRank);
  if (!targetRank || targetIdx < 0) {
    return t(actionValidationKeys.vvnz.unknownTargetRank, { rankId: card.grantRank });
  }
  if (targetIdx <= currentIdx) {
    return t(actionValidationKeys.vvnz.rankNotLower, { rankName: targetRank.name });
  }
  const availableUnits = countAvailableResources(row);
  if (availableUnits < VVNZ_PLAY_COST) {
    return t(actionValidationKeys.vvnz.missingCost, {
      rankName: targetRank.name,
      missing: `${t(actionValidationKeys.vvnz.anyResourcesLabel)} ${VVNZ_PLAY_COST - availableUnits}`,
    });
  }
  const playerCount = Object.keys(G.players ?? {}).length;
  const seatLimit = rankSeatLimitForRank(playerCount, targetRank.id, ranks);
  const occupied = Object.entries(G.ranks ?? {})
    .filter(([pid, rid]) => pid !== playerID && rid === targetRank.id)
    .length;
  if (occupied >= seatLimit) {
    return t(actionValidationKeys.vvnz.noFreeSeat, { rankName: targetRank.name, seatLimit });
  }
  return null;
};

export const getHandCardActionState = (args: {
  card: CardDefinition;
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>;
  playerID: string;
  ranks: RankDefinition[];
  resourceLabels: ResourceLabels;
  canPlayHandCard?: boolean;
  lang?: 'uk' | 'en';
  translator?: ActionTranslator;
}): ActionAvailability & { behavior: CardPlayBehavior } => {
  const { card, G, playerID, ranks, resourceLabels, canPlayHandCard = true, translator } = args;
  const t = translator ?? defaultTranslator;
  const behavior = getCardPlayBehavior(card);
  if (!canPlayHandCard) {
    return {
      allowed: false,
      reason: t(actionValidationKeys.handCard.cannotPlayNow),
      behavior,
    };
  }
  if (behavior === 'vvnz') {
    const reason = getVvnzPlayBlockedReason({ card, G, playerID, ranks, resourceLabels, translator });
    return { allowed: !reason, reason, behavior };
  }
  return { allowed: true, reason: null, behavior };
};
