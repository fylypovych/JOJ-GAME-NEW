import type { Ctx } from 'boardgame.io';
import {
  buildDecisionMessageText,
  buildPlayedLyapMessageText,
  buildPlayedScandalMessageText,
  buildPromotionMessageText,
  buildLyapAutoMessageText,
  buildScandalAutoMessageText,
  buildSupportMessageText,
  legendaryTexts,
} from './systemMessages';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from './types';
import { rankSeatLimitForRank } from './rankEngine';
import type { LegendaryDeckMode } from './sharedConfig';

export const normalizeGameModeByLegendaryMode = (
  requestedMode: 'standard' | 'standard_plus' | 'simplified',
  legendaryDeckMode: LegendaryDeckMode,
): 'standard' | 'standard_plus' | 'simplified' => {
  if (legendaryDeckMode !== 'merged') return requestedMode;
  return 'simplified';
};

export const createGameRuntimeHelpers = (args: {
  resourceKeys: readonly ResourceKey[];
  resourceLabelsUk: Record<ResourceKey, string>;
  getActiveRanks: () => RankDefinition[];
  getTopRankId: () => string;
  resolveRandomRankImage: (rankId: string) => string | undefined;
  nextSystemMessageSeq: (G: JojGameState) => number;
  appendChat: (G: JojGameState, entry: { type: 'player' | 'system'; text: string; playerID?: string }) => void;
  getPlayerLabel: (G: JojGameState, playerID: string) => string;
  clampNonNegativeResources: (resources: Record<ResourceKey, number>) => void;
  syncPlayerState: (G: JojGameState, playerID: string) => void;
  hasResources: (resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>) => boolean;
  planReplacementResources: (
    resources: Record<ResourceKey, number>,
    effects: CardDefinition['effects'],
  ) => ResourceKey[] | null;
}) => {
  const {
    resourceKeys,
    resourceLabelsUk,
    getActiveRanks,
    getTopRankId,
    resolveRandomRankImage,
    nextSystemMessageSeq,
    appendChat,
    getPlayerLabel,
    clampNonNegativeResources,
    syncPlayerState,
    planReplacementResources,
  } = args;

  const applyRankImageForPlayer = (G: JojGameState, playerID: string) => {
    if (!G.rankImageByPlayer) G.rankImageByPlayer = {};
    const rankId = G.ranks[playerID];
    const image = resolveRandomRankImage(rankId);
    if (image) G.rankImageByPlayer[playerID] = image;
    else delete G.rankImageByPlayer[playerID];
  };

  const isProtectedFromLyapScandal = (G: JojGameState, ctx: Ctx | { turn?: number }, playerID: string): boolean => {
    const currentTurn = Number(ctx?.turn ?? 0);
    const untilTurn = Number(G.lyapScandalShieldUntilTurn?.[playerID] ?? 0);
    return untilTurn > 0 && currentTurn < untilTurn;
  };

  const computeShieldUntilNextOwnTurn = (
    ctx: { currentPlayer: string; playOrder?: string[]; turn?: number },
    playerID: string,
  ): number => {
    const playOrder = ctx.playOrder ?? [];
    const currentTurn = Number(ctx.turn ?? 0);
    if (playOrder.length === 0) return currentTurn + 1;
    const currentIndex = playOrder.indexOf(ctx.currentPlayer);
    const targetIndex = playOrder.indexOf(playerID);
    if (currentIndex < 0 || targetIndex < 0) return currentTurn + playOrder.length;
    if (targetIndex === currentIndex) return currentTurn + playOrder.length;
    if (targetIndex > currentIndex) return currentTurn + (targetIndex - currentIndex);
    return currentTurn + (playOrder.length - currentIndex + targetIndex);
  };

  const triggerSukhpayZsuOnScandal = (
    G: JojGameState,
    ctx: Ctx | { turn?: number },
    _scandalSourcePlayerID: string,
  ) => {
    const currentTurn = Number(ctx?.turn ?? 0);
    Object.keys(G.players ?? {}).forEach((pid) => {
      const pending = G.sukhpayZsuPendingBonus?.[pid] ?? false;
      const activationTurn = Number(G.sukhpayZsuWatchUntilTurn?.[pid] ?? -1);
      if (!pending) return;
      if (activationTurn !== currentTurn) return;
      G.resources[pid].discipline = (G.resources[pid].discipline ?? 0) + 1;
      clampNonNegativeResources(G.resources[pid]);
      G.sukhpayZsuPendingBonus[pid] = false;
      syncPlayerState(G, pid);
      const seq = nextSystemMessageSeq(G);
      appendChat(G, {
        type: 'system',
        text: `🥫 [${seq}] ${legendaryTexts.sukhpayTriggered(getPlayerLabel(G, pid))}`,
      });
    });
  };

  const effectSummaryToText = (summary: { resources: Partial<Record<ResourceKey, number>>; rank: number }) => {
    const parts: string[] = [];
    resourceKeys.forEach((key) => {
      const value = summary.resources[key] ?? 0;
      if (value !== 0) parts.push(`${resourceLabelsUk[key]} ${value > 0 ? `+${value}` : value}`);
    });
    if (summary.rank !== 0) parts.push(`Звання ${summary.rank > 0 ? `+${summary.rank}` : summary.rank}`);
    return parts.length > 0 ? parts.join(', ') : 'без змін';
  };

  const categoryLabelUk = (category: CardDefinition['category']) => {
    switch (category) {
      case 'LYAP':
        return 'ЛЯП';
      case 'SCANDAL':
        return 'СКАНДАЛ';
      case 'SUPPORT':
        return 'ПІДТРИМКА';
      case 'COMMAND':
        return 'РІШЕННЯ';
      case 'VVNZ':
        return 'ВВНЗ';
      case 'LEGENDARY':
        return 'ЛЕГЕНДАРНА';
      default:
        return category;
    }
  };

  const rankNameById = (rankId: string): string =>
    getActiveRanks().find((row) => row.id === rankId)?.name ?? rankId;

  const resourceDeltaToText = (delta: Partial<Record<ResourceKey, number>>) => {
    const parts = resourceKeys
      .map((key) => {
        const value = delta[key] ?? 0;
        if (value === 0) return null;
        return `${resourceLabelsUk[key]} ${value > 0 ? `+${value}` : value}`;
      })
      .filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(', ') : 'без змін';
  };

  const costToDelta = (cost: Partial<Record<ResourceKey, number>>): Partial<Record<ResourceKey, number>> => {
    const delta: Partial<Record<ResourceKey, number>> = {};
    resourceKeys.forEach((key) => {
      const value = cost[key] ?? 0;
      if (value > 0) delta[key] = -value;
    });
    return delta;
  };

  const cardFlavorSnippet = (card: CardDefinition) => {
    const raw = card.flavor?.trim();
    if (!raw) return 'без офіційного коментаря';
    return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
  };

  const buildLyapSystemMessage = (
    seq: number,
    playerLabel: string,
    card: CardDefinition,
    summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
  ) => buildLyapAutoMessageText({
    seq,
    playerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    effectText: effectSummaryToText(summary),
  });

  const buildScandalSystemMessage = (
    seq: number,
    playerLabel: string,
    card: CardDefinition,
    targetSummaries: string[],
  ) => buildScandalAutoMessageText({
    seq,
    playerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    targetsText: targetSummaries.join(' | '),
  });

  const buildSupportSystemMessage = (
    seq: number,
    playerLabel: string,
    card: CardDefinition,
    summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
  ) => buildSupportMessageText({
    seq,
    playerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    effectText: effectSummaryToText(summary),
  });

  const buildPlayedLyapSystemMessage = (
    seq: number,
    sourcePlayerLabel: string,
    targetPlayerLabel: string,
    card: CardDefinition,
    summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
  ) => buildPlayedLyapMessageText({
    seq,
    sourcePlayerLabel,
    targetPlayerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    effectText: effectSummaryToText(summary),
  });

  const buildPlayedScandalSystemMessage = (
    seq: number,
    sourcePlayerLabel: string,
    card: CardDefinition,
    targetSummaries: string[],
  ) => buildPlayedScandalMessageText({
    seq,
    sourcePlayerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    targetsText: targetSummaries.join(' | '),
  });

  const buildPlayedDecisionSystemMessage = (
    seq: number,
    sourcePlayerLabel: string,
    card: CardDefinition,
    targetSummaries: string[],
  ) => buildDecisionMessageText({
    seq,
    sourcePlayerLabel,
    cardTitle: card.title,
    flavor: cardFlavorSnippet(card),
    targetsText: targetSummaries.join(' | '),
  });

  const buildPromotionSystemMessage = (
    seq: number,
    playerLabel: string,
    fromRankId: string,
    toRankId: string,
    cost: Partial<Record<ResourceKey, number>>,
    bonus: Partial<Record<ResourceKey, number>>,
    summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
  ) => buildPromotionMessageText({
    seq,
    playerLabel,
    fromRankName: rankNameById(fromRankId),
    toRankName: rankNameById(toRankId),
    costText: resourceDeltaToText(costToDelta(cost)),
    bonusText: resourceDeltaToText(bonus),
    totalText: effectSummaryToText(summary),
  });

  const buildVvnzRankSystemMessage = (
    seq: number,
    playerLabel: string,
    card: CardDefinition,
    fromRankId: string,
    toRankId: string,
    cost: Partial<Record<ResourceKey, number>>,
    bonus: Partial<Record<ResourceKey, number>>,
    summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
  ) => {
    const intros = [
      'оформив освітній стрибок без черги в деканат',
      'пройшов ВВНЗ-коридором до нового погона',
      'увімкнув режим "навчання завершено, дайте звання"',
      'закрив сесію так, що навіть штаб аплодує',
    ];
    const intro = intros[seq % intros.length] ?? intros[0];
    return `🎓 [${seq}] ${playerLabel} ${intro}: «${card.title}» (ВВНЗ). ${rankNameById(fromRankId)} → ${rankNameById(toRankId)}. "${cardFlavorSnippet(card)}". Вартість: ${resourceDeltaToText(costToDelta(cost))}. Бонус звання: ${resourceDeltaToText(bonus)}. Підсумок: ${effectSummaryToText(summary)}.`;
  };

  const getRankThenResourceLeader = (G: JojGameState): string | undefined => {
    const rankIndexById = new Map(getActiveRanks().map((rank, index) => [rank.id, index]));
    return Object.keys(G.players ?? {})
      .sort((a, b) => {
        const rankA = rankIndexById.get(G.ranks[a]) ?? -1;
        const rankB = rankIndexById.get(G.ranks[b]) ?? -1;
        if (rankA !== rankB) return rankB - rankA;
        const reputationA = G.resources[a]?.reputation ?? 0;
        const reputationB = G.resources[b]?.reputation ?? 0;
        if (reputationA !== reputationB) return reputationB - reputationA;
        return (G.resources[b]?.time ?? 0) - (G.resources[a]?.time ?? 0);
      })
      .at(0);
  };

  const getWinner = (G: JojGameState): string | undefined => {
    const activeRanks = getActiveRanks();
    const victoryRankIds = new Set(activeRanks.filter((rank) => rank.victory).map((rank) => rank.id));
    if (victoryRankIds.size > 0) {
      const byVictoryFlag = Object.entries(G.ranks).find(([, rankId]) => victoryRankIds.has(rankId))?.[0];
      if (byVictoryFlag) return byVictoryFlag;
    } else {
      const topRankPlayer = Object.entries(G.ranks).find(([, rankId]) => rankId === getTopRankId())?.[0];
      if (topRankPlayer) return topRankPlayer;
    }
    if (G.deck.length === 0) {
      const hasCardsInHands = Object.values(G.hands).some((hand) => hand.length > 0);
      if (hasCardsInHands) return undefined;
      return getRankThenResourceLeader(G);
    }
    return undefined;
  };

  const snapshotResourceTotals = (G: JojGameState): Record<string, Record<ResourceKey, number>> => {
    const snapshot: Record<string, Record<ResourceKey, number>> = {};
    Object.keys(G.resources ?? {}).forEach((pid) => {
      snapshot[pid] = { ...G.resources[pid] };
    });
    return snapshot;
  };

  const recordResourceFlowStats = (
    G: JojGameState,
    before: Record<string, Record<ResourceKey, number>>,
  ) => {
    Object.keys(G.resources ?? {}).forEach((pid) => {
      const prev = before[pid];
      const next = G.resources[pid];
      if (!prev || !next) return;
      resourceKeys.forEach((key) => {
        const delta = (next[key] ?? 0) - (prev[key] ?? 0);
        if (delta > 0) {
          G.gameStats.resourcesGainedTotal += delta;
          G.gameStats.resourcesGainedByType[key] = (G.gameStats.resourcesGainedByType[key] ?? 0) + delta;
          if (G.playerGameStats[pid]) G.playerGameStats[pid].resourcesGainedTotal += delta;
        } else if (delta < 0) {
          const abs = Math.abs(delta);
          G.gameStats.resourcesLostTotal += abs;
          G.gameStats.resourcesLostByType[key] = (G.gameStats.resourcesLostByType[key] ?? 0) + abs;
          if (G.playerGameStats[pid]) G.playerGameStats[pid].resourcesLostTotal += abs;
        }
      });
    });
  };

  const resetNoPlayablePassStreak = (G: JojGameState) => {
    G.noPlayablePassStreak = 0;
  };

  const canGrantSpecificRankIgnoringRequirementsWithoutMutation = (
    G: JojGameState,
    playerID: string,
    targetRankId: string,
  ): boolean => {
    const ranks = getActiveRanks();
    const playerCount = Object.keys(G.players ?? {}).length || 2;
    const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === G.ranks[playerID]));
    const targetRankIdx = ranks.findIndex((r) => r.id === targetRankId);
    if (targetRankIdx < 0 || targetRankIdx <= currentRankIdx) return false;
    const targetRank = ranks[targetRankIdx];
    if (!targetRank) return false;
    const occupied = Object.entries(G.ranks).filter(([pid, rankId]) => pid !== playerID && rankId === targetRank.id).length;
    return occupied < rankSeatLimitForRank(playerCount, targetRank.id, ranks);
  };

  const canDemoteAnyOpponentWithoutMutation = (G: JojGameState, sourcePlayerID: string): boolean => {
    const ranks = getActiveRanks();
    const playerCount = Object.keys(G.players ?? {}).length || 2;
    return Object.keys(G.players ?? {}).some((targetPlayerID) => {
      if (targetPlayerID === sourcePlayerID) return false;
      const currentRankIdx = ranks.findIndex((r) => r.id === G.ranks[targetPlayerID]);
      if (currentRankIdx <= 0) return false;
      const lowerRank = ranks[currentRankIdx - 1];
      if (!lowerRank) return false;
      const occupied = Object.entries(G.ranks).filter(([pid, rankId]) => pid !== targetPlayerID && rankId === lowerRank.id).length;
      return occupied < rankSeatLimitForRank(playerCount, lowerRank.id, ranks);
    });
  };

  const canPlayLegendaryCardByInventory = (G: JojGameState, playerID: string, card: CardDefinition): boolean => {
    if (card.id === 'legendary-10') return canDemoteAnyOpponentWithoutMutation(G, playerID);
    return true;
  };

  const canPlayRegularHandCardByInventory = (G: JojGameState, playerID: string, card: CardDefinition): boolean => {
    if (card.category === 'VVNZ') {
      if (!card.grantRank) return true;
      return canGrantSpecificRankIgnoringRequirementsWithoutMutation(G, playerID, card.grantRank);
    }
    if (card.category === 'LYAP' || card.category === 'SCANDAL') return Object.keys(G.players ?? {}).some((pid) => pid !== playerID);
    return planReplacementResources(G.resources[playerID], card.effects) !== null;
  };

  const hasPlayableCardsByInventory = (G: JojGameState, playerID: string): boolean => {
    const legendaryHand = G.legendaryHands[playerID] ?? [];
    for (const card of legendaryHand) {
      if (canPlayLegendaryCardByInventory(G, playerID, card)) return true;
    }
    const hand = G.hands[playerID] ?? [];
    for (const card of hand) {
      if (canPlayRegularHandCardByInventory(G, playerID, card)) return true;
    }
    return false;
  };

  const shouldCountNoPlayablePass = (G: JojGameState, playerID: string): boolean =>
    (G.deck?.length ?? 0) === 0 && !hasPlayableCardsByInventory(G, playerID);

  const allPlayersOutOfPlayableCardsByInventory = (G: JojGameState): boolean =>
    Object.keys(G.players ?? {}).every((pid) => !hasPlayableCardsByInventory(G, pid));

  return {
    applyRankImageForPlayer,
    isProtectedFromLyapScandal,
    computeShieldUntilNextOwnTurn,
    triggerSukhpayZsuOnScandal,
    effectSummaryToText,
    categoryLabelUk,
    rankNameById,
    resourceDeltaToText,
    cardFlavorSnippet,
    buildLyapSystemMessage,
    buildScandalSystemMessage,
    buildSupportSystemMessage,
    buildPlayedLyapSystemMessage,
    buildPlayedScandalSystemMessage,
    buildPlayedDecisionSystemMessage,
    buildPromotionSystemMessage,
    buildVvnzRankSystemMessage,
    getWinner,
    getRankThenResourceLeader,
    snapshotResourceTotals,
    recordResourceFlowStats,
    resetNoPlayablePassStreak,
    hasPlayableCardsByInventory,
    shouldCountNoPlayablePass,
    allPlayersOutOfPlayableCardsByInventory,
  };
};
