import { getCardPlayBehavior, type CardPlayBehavior } from './cardRules';
import { rankSeatLimitForRank } from './rankEngine';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from './types';

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
}): string | null => {
  const { G, playerID, ranks, resourceLabels, lang = 'uk' } = args;
  const currentRankId = G.ranks[playerID];
  if (G.promotedThisTurn?.[playerID]) {
    return lang === 'uk'
      ? 'Ви вже підвищувалися цього ходу.'
      : 'You have already promoted this turn.';
  }
  const currentIdx = ranks.findIndex((r) => r.id === currentRankId);
  const nextRank = currentIdx >= 0 ? ranks[currentIdx + 1] : undefined;
  if (!nextRank) {
    return lang === 'uk' ? 'Немає наступного звання для підвищення.' : 'No next rank to promote to.';
  }
  const row = G.resources[playerID];
  if (!row) return lang === 'uk' ? 'Ресурси гравця недоступні.' : 'Player resources are unavailable.';

  const missingReq = getMissingResourceParts(nextRank.requirement, row, resourceLabels);
  if (missingReq.length > 0) {
    return lang === 'uk'
      ? `До звання «${nextRank.name}» бракує: ${missingReq.join(', ')}`
      : `Missing for rank "${nextRank.name}": ${missingReq.join(', ')}`;
  }
  const missingCost = getMissingResourceParts(nextRank.cost, row, resourceLabels);
  if (missingCost.length > 0) {
    return lang === 'uk'
      ? `Для підвищення до «${nextRank.name}» бракує вартості: ${missingCost.join(', ')}`
      : `Missing promotion cost for "${nextRank.name}": ${missingCost.join(', ')}`;
  }
  const playerCount = Object.keys(G.players ?? {}).length;
  const seatLimit = rankSeatLimitForRank(playerCount, nextRank.id, ranks);
  const occupied = Object.entries(G.ranks ?? {})
    .filter(([pid, rid]) => pid !== playerID && rid === nextRank.id)
    .length;
  if (occupied >= seatLimit) {
    return lang === 'uk'
      ? `Немає вільного місця на званні «${nextRank.name}» (ліміт: ${seatLimit})`
      : `No free seat for rank "${nextRank.name}" (limit: ${seatLimit})`;
  }
  return null;
};

export const getPromoteActionState = (args: {
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>;
  playerID: string;
  ranks: RankDefinition[];
  resourceLabels: ResourceLabels;
  lang?: 'uk' | 'en';
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
}): string | null => {
  const { card, G, playerID, ranks, resourceLabels, lang = 'uk' } = args;
  if (card.category !== 'VVNZ') return null;
  if (G.promotedThisTurn?.[playerID]) {
    return lang === 'uk'
      ? 'Цього ходу ви вже отримували підвищення.'
      : 'You have already received a promotion this turn.';
  }
  if (!card.grantRank) {
    return lang === 'uk'
      ? 'Для цієї ВВНЗ-карти не задано цільове звання (grantRank).'
      : 'This VVNZ card has no target rank (grantRank).';
  }
  const row = G.resources[playerID];
  if (!row) return lang === 'uk' ? 'Стан ресурсів ще не завантажено.' : 'Resources are not loaded yet.';
  const currentIdx = ranks.findIndex((r) => r.id === (G.ranks[playerID] ?? ''));
  const targetRank = ranks.find((r) => r.id === card.grantRank);
  const targetIdx = ranks.findIndex((r) => r.id === card.grantRank);
  if (!targetRank || targetIdx < 0) {
    return lang === 'uk' ? `Невідоме цільове звання: ${card.grantRank}` : `Unknown target rank: ${card.grantRank}`;
  }
  if (targetIdx <= currentIdx) {
    return lang === 'uk'
      ? `Карта дає звання «${targetRank.name}», але ваше поточне звання вже не нижче.`
      : `Card grants "${targetRank.name}", but your current rank is already not lower.`;
  }
  const missingReq = getMissingResourceParts(targetRank.requirement, row, resourceLabels);
  if (missingReq.length > 0) {
    return lang === 'uk'
      ? `Не вистачає вимог для «${targetRank.name}»: ${missingReq.join(', ')}`
      : `Missing requirements for "${targetRank.name}": ${missingReq.join(', ')}`;
  }
  const missingCost = getMissingResourceParts(targetRank.cost, row, resourceLabels);
  if (missingCost.length > 0) {
    return lang === 'uk'
      ? `Не вистачає вартості підвищення до «${targetRank.name}»: ${missingCost.join(', ')}`
      : `Missing promotion cost for "${targetRank.name}": ${missingCost.join(', ')}`;
  }
  const playerCount = Object.keys(G.players ?? {}).length;
  const seatLimit = rankSeatLimitForRank(playerCount, targetRank.id, ranks);
  const occupied = Object.entries(G.ranks ?? {})
    .filter(([pid, rid]) => pid !== playerID && rid === targetRank.id)
    .length;
  if (occupied >= seatLimit) {
    return lang === 'uk'
      ? `Немає вільного місця на званні «${targetRank.name}» (ліміт ${seatLimit}).`
      : `No free seat for rank "${targetRank.name}" (limit ${seatLimit}).`;
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
}): ActionAvailability & { behavior: CardPlayBehavior } => {
  const { card, G, playerID, ranks, resourceLabels, canPlayHandCard = true, lang = 'uk' } = args;
  const behavior = getCardPlayBehavior(card);
  if (!canPlayHandCard) {
    return {
      allowed: false,
      reason: lang === 'uk' ? 'Цю карту зараз не можна розіграти.' : 'This card cannot be played right now.',
      behavior,
    };
  }
  if (behavior === 'vvnz') {
    const reason = getVvnzPlayBlockedReason({ card, G, playerID, ranks, resourceLabels, lang });
    return { allowed: !reason, reason, behavior };
  }
  return { allowed: true, reason: null, behavior };
};
