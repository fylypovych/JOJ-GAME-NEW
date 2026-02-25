import type { Ctx, Game } from 'boardgame.io';
import {
  buildDecisionMessageText,
  buildLegendaryPlayedMessageText,
  buildLyapAutoMessageText,
  buildPlayedLyapMessageText,
  buildPlayedScandalMessageText,
  buildPromotionMessageText,
  buildScandalAutoMessageText,
  buildSupportMessageText,
  legendaryTexts,
} from './systemMessages';
import { appendChat as appendChatBase, getPlayerLabel, nextSystemMessageSeq } from './chatUtils';
import { cloneCard } from './cloneUtils';
import { createEffectsEngine } from './effectsEngine';
import { createJojMoves, enumerateAiMoves } from './moves';
import { resourceKeys, resourceLabelsUk } from './resourceMeta';
import { createRankEngine } from './rankEngine';
import { canPlayHandCardAtStage } from './turnRules';
import { runGameSimulationsWithDeps, type SimulationOptions, type SimulationReport } from './simulation';
import { getActiveRanks, getSharedDeckTemplate, getTopRankId, shuffle } from './sharedConfig';
import type { CardDefinition, JojGameState, ResourceKey } from './types';
export {
  addCardToSharedDeckTemplate,
  addCustomCardToSharedDeckTemplate,
  exportSharedDeckTemplateJson,
  getCardCatalog,
  getSharedDeckTemplate,
  getSharedDeckTemplateStats,
  getSharedRanks,
  importSharedDeckTemplateJson,
  resetSharedDeckTemplate,
  resetSharedRanks,
  removeCardAtFromSharedDeckTemplate,
  setSharedDeckBackImage,
  setSharedRanks,
  shuffleSharedDeckTemplate,
  updateCardAtInSharedDeckTemplate,
} from './sharedConfig';
export type { DeckTarget, SharedRanks } from './sharedConfig';

const INVALID_MOVE = 'INVALID_MOVE' as const;
const STARTING_HAND_SIZE = 5;
const STARTING_LEGENDARY_HAND_SIZE = 5;
const HAND_LIMIT = 8;
const DRAW_STAGE = 'draw';
const PLAY_STAGE = 'play';
const END_STAGE = 'end';
const IDLE_STAGE = 'idle';
const CHAT_LIMIT = 200;


const appendChat = (
  G: JojGameState,
  entry: { type: 'player' | 'system'; text: string; playerID?: string },
) => appendChatBase(G, entry, CHAT_LIMIT);
const {
  hasResources,
  spendResources,
  applyResourceDelta,
  clampNonNegativeResources,
  planReplacementResources,
  getReplacementUnitsForCard,
  applyCardEffects,
  applyCardEffectsSoft,
  cancelLastLyapOrScandalForPlayer,
  cancelLastScandalForPlayer,
  summarizeAppliedDiff,
} = createEffectsEngine({
  resourceKeys,
  getActiveRanks,
});
export { getReplacementUnitsForCard };

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
  scandalSourcePlayerID: string,
) => {
  const currentTurn = Number(ctx?.turn ?? 0);
  Object.keys(G.players ?? {}).forEach((pid) => {
    if (pid === scandalSourcePlayerID) return;
    const pending = G.sukhpayZsuPendingBonus?.[pid] ?? false;
    const untilTurn = Number(G.sukhpayZsuWatchUntilTurn?.[pid] ?? 0);
    if (!pending) return;
    if (!(untilTurn > 0 && currentTurn < untilTurn)) return;
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
    if (value !== 0) {
      parts.push(`${resourceLabelsUk[key]} ${value > 0 ? `+${value}` : value}`);
    }
  });
  if (summary.rank !== 0) {
    parts.push(`Звання ${summary.rank > 0 ? `+${summary.rank}` : summary.rank}`);
  }
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
    case 'DECISION':
      return 'РІШЕННЯ';
    case 'NEUTRAL':
      return 'НЕЙТРАЛЬНА';
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
) => {
  return buildLyapAutoMessageText({
    seq,
    playerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    effectText: effectSummaryToText(summary),
  });
};

const buildScandalSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  return buildScandalAutoMessageText({
    seq,
    playerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    targetsText: targetSummaries.join(' | '),
  });
};

const buildSupportSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  return buildSupportMessageText({
    seq,
    playerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    effectText: effectSummaryToText(summary),
  });
};

const buildPlayedLyapSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  targetPlayerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  return buildPlayedLyapMessageText({
    seq,
    sourcePlayerLabel,
    targetPlayerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    effectText: effectSummaryToText(summary),
  });
};

const buildPlayedScandalSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  return buildPlayedScandalMessageText({
    seq,
    sourcePlayerLabel,
    cardTitle: card.title,
    categoryLabel: categoryLabelUk(card.category),
    flavor: cardFlavorSnippet(card),
    targetsText: targetSummaries.join(' | '),
  });
};

const buildPlayedDecisionSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  return buildDecisionMessageText({
    seq,
    sourcePlayerLabel,
    cardTitle: card.title,
    flavor: cardFlavorSnippet(card),
    targetsText: targetSummaries.join(' | '),
  });
};

const buildPromotionSystemMessage = (
  seq: number,
  playerLabel: string,
  fromRankId: string,
  toRankId: string,
  cost: Partial<Record<ResourceKey, number>>,
  bonus: Partial<Record<ResourceKey, number>>,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const costText = resourceDeltaToText(costToDelta(cost));
  const bonusText = resourceDeltaToText(bonus);
  const totalText = effectSummaryToText(summary);
  return buildPromotionMessageText({
    seq,
    playerLabel,
    fromRankName: rankNameById(fromRankId),
    toRankName: rankNameById(toRankId),
    costText,
    bonusText,
    totalText,
  });
};

const drawCards = (G: JojGameState, playerID: string, amount: number): void => {
  for (let i = 0; i < amount; i += 1) {
    if (G.deck.length === 0) break;
    const card = G.deck.pop();
    if (card) G.hands[playerID].push(card);
  }
};

const drawLegendaryCards = (G: JojGameState, playerID: string, amount: number): void => {
  const template = getSharedDeckTemplate();
  G.legendaryHands[playerID] = shuffle(template.legendaryDeck.map(cloneCard)).slice(0, Math.max(0, amount));
};

const syncPlayerState = (G: JojGameState, playerID: string): void => {
  G.players[playerID].hand = G.hands[playerID];
  G.players[playerID].rankId = G.ranks[playerID];
  G.players[playerID].resources = G.resources[playerID];
};
const {
  promoteRank,
  promoteToSpecificRank,
  grantSpecificRankIgnoringRequirements,
  demoteByOneRankWithSeatCheck,
} = createRankEngine({
  getActiveRanks,
  hasResources,
  spendResources,
  applyResourceDelta,
  clampNonNegativeResources,
  syncPlayerState,
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
  const flavor = cardFlavorSnippet(card);
  const costText = resourceDeltaToText(costToDelta(cost));
  const bonusText = resourceDeltaToText(bonus);
  const totalText = effectSummaryToText(summary);
  const intros = [
    'оформив освітній стрибок без черги в деканат',
    'пройшов ВВНЗ-коридором до нового погона',
    'увімкнув режим "навчання завершено, дайте звання"',
    'закрив сесію так, що навіть штаб аплодує',
  ];
  const intro = intros[seq % intros.length] ?? intros[0];
  return `🎓 [${seq}] ${playerLabel} ${intro}: «${card.title}» (ВВНЗ). ${rankNameById(fromRankId)} → ${rankNameById(toRankId)}. "${flavor}". Вартість: ${costText}. Бонус звання: ${bonusText}. Підсумок: ${totalText}.`;
};

const getWinner = (G: JojGameState): string | undefined => {
  const activeRanks = getActiveRanks();
  const victoryRankIds = new Set(activeRanks.filter((rank) => rank.victory).map((rank) => rank.id));
  if (victoryRankIds.size > 0) {
    const byVictoryFlag = Object.entries(G.ranks).find(([, rankId]) => victoryRankIds.has(rankId))?.[0];
    if (byVictoryFlag) return byVictoryFlag;
  } else {
    const topRankId = getTopRankId();
    const topRankPlayer = Object.entries(G.ranks).find(([, rankId]) => rankId === topRankId)?.[0];
    if (topRankPlayer) return topRankPlayer;
  }
  if (G.deck.length === 0) {
    const hasCardsInHands = Object.values(G.hands).some((hand) => hand.length > 0);
    if (hasCardsInHands) return undefined;
    return Object.entries(G.resources)
      .sort(([, a], [, b]) =>
        resourceKeys.reduce((sum, key) => sum + (b[key] - a[key]), 0),
      )
      .at(0)?.[0];
  }
  return undefined;
};

const buildReplacementPlan = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): ResourceKey[] | null => planReplacementResources(resources, effects);
export { type SimulationReport } from './simulation';

export const runGameSimulations = (
  players: number,
  simulations: number,
  maxTurns = 600,
  options?: SimulationOptions,
): SimulationReport => runGameSimulationsWithDeps({
  resourceKeys,
  shuffle,
  cloneCard,
  getSharedDeckTemplate,
  getActiveRanks,
  getTopRankId,
  drawCards,
  drawLegendaryCards,
  syncPlayerState,
  promoteRank,
  promoteToSpecificRank,
  grantSpecificRankIgnoringRequirements,
  demoteByOneRankWithSeatCheck,
  triggerSukhpayZsuOnScandal: (G, ctx, sourcePlayerID) =>
    triggerSukhpayZsuOnScandal(G, ctx as Ctx, sourcePlayerID),
  cancelLastLyapOrScandalForPlayer,
  cancelLastScandalForPlayer,
  applyCardEffects,
  applyCardEffectsSoft,
  clampNonNegativeResources,
  planReplacementResources: buildReplacementPlan,
  getWinner,
  startingHandSize: STARTING_HAND_SIZE,
  startingLegendaryHandSize: STARTING_LEGENDARY_HAND_SIZE,
}, players, simulations, maxTurns, options);

export const jojGame: Game<JojGameState> = {
  name: 'joj-game',
  minPlayers: 2,
  maxPlayers: 6,
  setup: ({ ctx }) => {
    const players = [...ctx.playOrder];
    const template = getSharedDeckTemplate();
    const deck = shuffle(template.deck.map(cloneCard));

    const state: JojGameState = {
      deck,
      discard: [],
      legendaryDeck: shuffle(template.legendaryDeck.map(cloneCard)),
      legendaryDiscard: [],
      deckBackImage: template.deckBackImage,
      systemMessageSeq: 0,
      playerNames: {},
      chat: [],
      players: {},
      hands: {},
      legendaryHands: {},
      ranks: {},
      resources: {},
      promotedThisTurn: {},
      lyapScandalShieldUntilTurn: {},
      extraHandPlayTokens: {},
      sukhpayZsuWatchUntilTurn: {},
      sukhpayZsuPendingBonus: {},
    };

    players.forEach((playerID) => {
      state.hands[playerID] = [];
      state.legendaryHands[playerID] = [];
      state.ranks[playerID] = getActiveRanks()[0]?.id ?? 'cadet';
      state.resources[playerID] = {
        time: 1,
        reputation: 1,
        discipline: 1,
        documents: 1,
        tech: 1,
      };
      state.players[playerID] = {
        hand: state.hands[playerID],
        rankId: state.ranks[playerID],
        resources: state.resources[playerID],
      };
      state.promotedThisTurn[playerID] = false;
      state.lyapScandalShieldUntilTurn[playerID] = 0;
      state.extraHandPlayTokens[playerID] = 0;
      state.sukhpayZsuWatchUntilTurn[playerID] = 0;
      state.sukhpayZsuPendingBonus[playerID] = false;
      state.playerNames[playerID] = '';
      drawCards(state, playerID, STARTING_HAND_SIZE);
      drawLegendaryCards(state, playerID, STARTING_LEGENDARY_HAND_SIZE);
    });

    return state;
  },
  turn: {
    activePlayers: { currentPlayer: DRAW_STAGE },
    onBegin: ({ G, ctx, events }) => {
      Object.keys(G.promotedThisTurn).forEach((pid) => {
        G.promotedThisTurn[pid] = false;
      });
      const value: Record<string, string> = {};
      ctx.playOrder.forEach((pid) => {
        value[pid] = IDLE_STAGE;
      });
      value[ctx.currentPlayer] = G.deck.length > 0 ? DRAW_STAGE : PLAY_STAGE;
      events?.setActivePlayers({ value });
    },
  },
  moves: createJojMoves({
    INVALID_MOVE,
    DRAW_STAGE,
    PLAY_STAGE,
    END_STAGE,
    HAND_LIMIT,
    resourceKeys,
    resourceLabelsUk,
    canPlayHandCardAtStage,
    appendChat,
    nextSystemMessageSeq,
    getPlayerLabel,
    syncPlayerState,
    isProtectedFromLyapScandal,
    triggerSukhpayZsuOnScandal,
    applyCardEffects,
    applyCardEffectsSoft,
    summarizeAppliedDiff,
    effectSummaryToText,
    resourceDeltaToText,
    categoryLabelUk,
    cardFlavorSnippet,
    rankNameById,
    buildLyapSystemMessage,
    buildScandalSystemMessage,
    buildSupportSystemMessage,
    buildPlayedLyapSystemMessage,
    buildPlayedScandalSystemMessage,
    buildPlayedDecisionSystemMessage,
    buildVvnzRankSystemMessage,
    buildPromotionSystemMessage,
    buildLegendaryPlayedMessageText,
    legendaryTexts,
    clampNonNegativeResources,
    computeShieldUntilNextOwnTurn,
    cancelLastLyapOrScandalForPlayer,
    cancelLastScandalForPlayer,
    promoteToSpecificRank,
    grantSpecificRankIgnoringRequirements,
    demoteByOneRankWithSeatCheck,
    promoteRank,
    getActiveRanks,
  }),
  endIf: ({ G }) => {
    const winner = getWinner(G);
    if (!winner) return undefined;
    return { winner };
  },
  ai: {
    enumerate: enumerateAiMoves({ DRAW_STAGE, END_STAGE }),
  },
  playerView: ({ G, ctx, playerID }) => {
    if (!playerID) return G;
    const filteredHands: JojGameState['hands'] = {};
    const filteredLegendaryHands: JojGameState['legendaryHands'] = {};
    Object.entries(G.hands as Record<string, CardDefinition[]>).forEach(([pid, cards]) => {
      filteredHands[pid] = pid === playerID ? cards : cards.map(({ id, title, category, image, effects, flavor }) => ({
        id,
        title,
        category,
        image,
        effects,
        flavor,
      }));
    });
    Object.entries(G.legendaryHands as Record<string, CardDefinition[]>).forEach(([pid, cards]) => {
      filteredLegendaryHands[pid] = pid === playerID ? cards : cards.map(({ id, title, category, image, effects, flavor }) => ({
        id,
        title,
        category,
        image,
        effects,
        flavor,
      }));
    });
    const filteredPlayers: JojGameState['players'] = {};
    Object.entries(G.players).forEach(([pid, state]) => {
      filteredPlayers[pid] = {
        ...state,
        hand: filteredHands[pid],
      };
    });

    return {
      ...G,
      players: filteredPlayers,
      hands: filteredHands,
      legendaryHands: filteredLegendaryHands,
      deck: ctx.gameover ? G.deck : new Array(G.deck.length).fill({ id: 'hidden', title: 'Hidden', category: 'NEUTRAL' }),
    };
  },
};

export type JojCtx = Ctx;
