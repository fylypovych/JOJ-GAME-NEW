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
import { resourceKeys, resourceLabelsUk } from './resourceMeta';
import { createRankEngine } from './rankEngine';
import { runGameSimulationsWithDeps, type SimulationReport } from './simulation';
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

const computeShieldUntilNextOwnTurn = (ctx: Ctx, playerID: string): number => {
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
  return `🎓 [${seq}] ${playerLabel} розіграв «${card.title}» (ВВНЗ) і отримав звання: ${rankNameById(fromRankId)} → ${rankNameById(toRankId)}. "${flavor}". Вартість: ${costText}. Бонус звання: ${bonusText}. Підсумок: ${totalText}.`;
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
}, players, simulations, maxTurns);

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
        time: 2,
        reputation: 2,
        discipline: 2,
        documents: 2,
        tech: 2,
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
  moves: {
    syncPlayerNames: (args, names: Record<string, string>) => {
      if (!names || typeof names !== 'object') return INVALID_MOVE;
      Object.entries(names).forEach(([pid, value]) => {
        if (!(pid in args.G.players)) return;
        const trimmed = value.trim();
        if (!trimmed) return;
        args.G.playerNames[pid] = trimmed.slice(0, 32);
      });
      return undefined;
    },
    setPlayerName: (args, name: string) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const trimmed = name.trim();
      if (!trimmed) return INVALID_MOVE;
      args.G.playerNames[playerID] = trimmed.slice(0, 32);
      return undefined;
    },
    sendChat: (args, text: string) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const trimmed = text.trim();
      if (!trimmed) return INVALID_MOVE;
      appendChat(args.G, {
        type: 'player',
        playerID,
        text: trimmed.slice(0, 280),
      });
      return undefined;
    },
    drawCard: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== DRAW_STAGE) return INVALID_MOVE;

      const hand = args.G.hands[playerID];
      let autoPlayed = false;
      const card = args.G.deck.pop();
      if (card) {
        if (card.category === 'LYAP') {
          // Drawn LYAP auto-triggers on the player who drew it.
          const summary = isProtectedFromLyapScandal(args.G, args.ctx, playerID)
            ? { resources: {}, rank: 0 }
            : applyCardEffectsSoft(args.G, playerID, card.effects);
          const seq = nextSystemMessageSeq(args.G);
          appendChat(args.G, {
            type: 'system',
            text: isProtectedFromLyapScandal(args.G, args.ctx, playerID)
              ? `🛡️ [${seq}] ${getPlayerLabel(args.G, playerID)} витягнув «${card.title}», але щит від Грамоти скасував ЛЯП.`
              : buildLyapSystemMessage(seq, getPlayerLabel(args.G, playerID), card, summary),
          });
          args.G.discard.push(card);
          autoPlayed = true;
        } else if (card.category === 'SCANDAL') {
          // Drawn SCANDAL auto-triggers on all players at the table.
          const targetSummaries: string[] = [];
          Object.keys(args.G.players).forEach((pid) => {
            if (isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
              targetSummaries.push(`${getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`);
            } else {
              const summary = applyCardEffectsSoft(args.G, pid, card.effects);
              targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
            }
            syncPlayerState(args.G, pid);
          });
          triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
          const seq = nextSystemMessageSeq(args.G);
          appendChat(args.G, {
            type: 'system',
            text: buildScandalSystemMessage(seq, getPlayerLabel(args.G, playerID), card, targetSummaries),
          });
          args.G.discard.push(card);
          autoPlayed = true;
        } else {
          hand.push(card);
        }
      }
      syncPlayerState(args.G, playerID);
      args.events?.setStage(autoPlayed ? END_STAGE : PLAY_STAGE);
      return undefined;
    },
    playCard: (
      args,
      cardId: string,
      replacementResources: ResourceKey[] = [],
      targetPlayerID?: string,
    ) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const usingExtraToken = (args.G.extraHandPlayTokens[playerID] ?? 0) > 0;
      if (!usingExtraToken) {
        if (args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
        if (![PLAY_STAGE, END_STAGE].includes(args.ctx.activePlayers?.[playerID] as string)) return INVALID_MOVE;
      }

      const hand = args.G.hands[playerID];
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx === -1) return INVALID_MOVE;

      const card = hand[idx];
      const allPlayerIDs = Object.keys(args.G.players);
      const applySoftTo = (pid: string) => {
        const summary = applyCardEffectsSoft(args.G, pid, card.effects);
        syncPlayerState(args.G, pid);
        return summary;
      };

      if (card.category === 'LYAP') {
        if (!targetPlayerID || targetPlayerID === playerID || !(targetPlayerID in args.G.players)) {
          return INVALID_MOVE;
        }
        const protectedTarget = isProtectedFromLyapScandal(args.G, args.ctx, targetPlayerID);
        const summary = protectedTarget ? { resources: {}, rank: 0 } : applySoftTo(targetPlayerID);
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: protectedTarget
            ? `🛡️ [${seq}] ${getPlayerLabel(args.G, playerID)} розіграв ЛЯП «${card.title}» на ${getPlayerLabel(args.G, targetPlayerID)}, але щит від Грамоти скасував дію.`
            : buildPlayedLyapSystemMessage(
              seq,
              getPlayerLabel(args.G, playerID),
              getPlayerLabel(args.G, targetPlayerID),
              card,
              summary,
            ),
        });
      } else if (card.category === 'SCANDAL') {
        const targetSummaries: string[] = [];
        allPlayerIDs
          .filter((pid) => pid !== playerID)
          .forEach((pid) => {
            if (isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
              targetSummaries.push(`${getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`);
              return;
            }
            const summary = applySoftTo(pid);
            targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
          });
        triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildPlayedScandalSystemMessage(seq, getPlayerLabel(args.G, playerID), card, targetSummaries),
        });
      } else if (card.category === 'SUPPORT') {
        const beforeResources = { ...args.G.resources[playerID] };
        const beforeRankId = args.G.ranks[playerID];
        try {
          const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
          if (!applied) return INVALID_MOVE;
        } catch {
          return INVALID_MOVE;
        }
        const summary = summarizeAppliedDiff(
          beforeResources,
          args.G.resources[playerID],
          beforeRankId,
          args.G.ranks[playerID],
        );
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildSupportSystemMessage(seq, getPlayerLabel(args.G, playerID), card, summary),
        });
      } else if (card.category === 'DECISION') {
        const targetSummaries: string[] = [];
        let invalidDecisionReplacement = false;
        allPlayerIDs.forEach((pid) => {
          if (invalidDecisionReplacement) return;
          if (pid === playerID) {
            const beforeResources = { ...args.G.resources[playerID] };
            const beforeRankId = args.G.ranks[playerID];
            try {
              const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
              if (!applied) {
                invalidDecisionReplacement = true;
                return;
              }
            } catch {
              invalidDecisionReplacement = true;
              return;
            }
            const summary = summarizeAppliedDiff(
              beforeResources,
              args.G.resources[playerID],
              beforeRankId,
              args.G.ranks[playerID],
            );
            targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
            syncPlayerState(args.G, pid);
            return;
          }
          const summary = applySoftTo(pid);
          targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
        });
        if (invalidDecisionReplacement) return INVALID_MOVE;
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildPlayedDecisionSystemMessage(seq, getPlayerLabel(args.G, playerID), card, targetSummaries),
        });
      } else if (card.category === 'VVNZ' && card.grantRank) {
        const beforeResources = { ...args.G.resources[playerID] };
        const beforeRankId = args.G.ranks[playerID];
        const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
        const promoted = promoteToSpecificRank(args.G, playerID, card.grantRank, playerCount);
        if (!promoted.ok) return INVALID_MOVE;
        try {
          const applied = applyCardEffects(args.G, playerID, card.effects, []);
          if (!applied) return INVALID_MOVE;
        } catch {
          return INVALID_MOVE;
        }
        const afterRankId = args.G.ranks[playerID];
        const summary = summarizeAppliedDiff(
          beforeResources,
          args.G.resources[playerID],
          beforeRankId,
          afterRankId,
        );
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildVvnzRankSystemMessage(
            seq,
            getPlayerLabel(args.G, playerID),
            card,
            beforeRankId,
            afterRankId,
            promoted.rank.cost ?? {},
            promoted.rank.bonus ?? {},
            summary,
          ),
        });
      } else {
        try {
          const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
          if (!applied) return INVALID_MOVE;
        } catch {
          return INVALID_MOVE;
        }
      }

      hand.splice(idx, 1);
      args.G.discard.push(card);

      syncPlayerState(args.G, playerID);
      if (usingExtraToken) {
        args.G.extraHandPlayTokens[playerID] = Math.max(0, (args.G.extraHandPlayTokens[playerID] ?? 0) - 1);
      } else {
        args.events?.setStage(END_STAGE);
      }
      return undefined;
    },
    playLegendaryCard: (args, cardId: string, targetPlayerID?: string, selectedResource?: ResourceKey) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const hand = args.G.legendaryHands[playerID] ?? [];
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx === -1) return INVALID_MOVE;
      const card = hand[idx];
      const playerLabel = getPlayerLabel(args.G, playerID);
      let specialMessage = '';

      if (card.id === 'legendary-02') {
        const canceled = cancelLastLyapOrScandalForPlayer(args.G, playerID);
        if (canceled.canceledCard) {
          specialMessage = legendaryTexts.budanovCanceled(playerLabel, canceled.canceledCard.title, effectSummaryToText(canceled.summary));
        } else {
          specialMessage = legendaryTexts.budanovNoTarget();
        }
      } else if (card.id === 'legendary-08') {
        const canceled = cancelLastScandalForPlayer(args.G, playerID);
        if (canceled.canceledCard) {
          specialMessage = legendaryTexts.starlinkCanceled(playerLabel, canceled.canceledCard.title, effectSummaryToText(canceled.summary));
        } else {
          specialMessage = legendaryTexts.starlinkNoTarget();
        }
      } else if (card.id === 'legendary-05') {
        const untilTurn = computeShieldUntilNextOwnTurn(args.ctx, playerID);
        args.G.sukhpayZsuWatchUntilTurn[playerID] = untilTurn;
        args.G.sukhpayZsuPendingBonus[playerID] = true;
        specialMessage = legendaryTexts.sukhpayActivated(playerLabel);
      } else if (card.id === 'legendary-12') {
        const untilTurn = computeShieldUntilNextOwnTurn(args.ctx, playerID);
        args.G.lyapScandalShieldUntilTurn[playerID] = untilTurn;
        specialMessage = legendaryTexts.grammarShield(playerLabel);
      } else if (card.id === 'legendary-03') {
        args.G.extraHandPlayTokens[playerID] = (args.G.extraHandPlayTokens[playerID] ?? 0) + 1;
        specialMessage = legendaryTexts.posmishkaMalyuka(playerLabel);
      } else if (card.id === 'legendary-06') {
        if (!selectedResource || !resourceKeys.includes(selectedResource)) return INVALID_MOVE;
        args.G.resources[playerID][selectedResource] = (args.G.resources[playerID][selectedResource] ?? 0) + 3;
        Object.keys(args.G.players)
          .filter((pid) => pid !== playerID)
          .forEach((pid) => {
            args.G.resources[pid].documents = (args.G.resources[pid].documents ?? 0) + 1;
            clampNonNegativeResources(args.G.resources[pid]);
            syncPlayerState(args.G, pid);
          });
        clampNonNegativeResources(args.G.resources[playerID]);
        syncPlayerState(args.G, playerID);
        specialMessage = legendaryTexts.statueTor(playerLabel, resourceLabelsUk[selectedResource]);
      } else if (card.id === 'legendary-07') {
        args.G.resources[playerID].time = (args.G.resources[playerID].time ?? 0) + 2;
        args.G.resources[playerID].reputation = (args.G.resources[playerID].reputation ?? 0) + 2;
        Object.keys(args.G.players)
          .filter((pid) => pid !== playerID)
          .forEach((pid) => {
            args.G.resources[pid].reputation = Math.max(0, (args.G.resources[pid].reputation ?? 0) - 1);
            clampNonNegativeResources(args.G.resources[pid]);
            syncPlayerState(args.G, pid);
          });
        clampNonNegativeResources(args.G.resources[playerID]);
        syncPlayerState(args.G, playerID);
        specialMessage = legendaryTexts.churchLeadership(playerLabel);
      } else if (card.id === 'legendary-09') {
        if (!selectedResource || !resourceKeys.includes(selectedResource)) return INVALID_MOVE;
        const before = args.G.resources[playerID][selectedResource] ?? 0;
        const after = Math.max(before, 3);
        args.G.resources[playerID][selectedResource] = after;
        syncPlayerState(args.G, playerID);
        specialMessage = legendaryTexts.waterRestore(playerLabel, resourceLabelsUk[selectedResource], before, after);
      } else if (card.id === 'legendary-13') {
        const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
        const granted = grantSpecificRankIgnoringRequirements(args.G, playerID, 'senior_lieutenant', playerCount);
        if (!granted.ok) return INVALID_MOVE;
        if (granted.applied) {
          specialMessage = legendaryTexts.goodPressOfficerGranted(
            playerLabel,
            rankNameById('senior_lieutenant'),
            resourceDeltaToText(granted.rank.bonus ?? {}),
          );
        } else {
          specialMessage = legendaryTexts.goodPressOfficerNoChange(playerLabel, rankNameById(args.G.ranks[playerID]));
        }
      } else if (card.id === 'legendary-10') {
        if (!targetPlayerID || !(targetPlayerID in args.G.players) || targetPlayerID === playerID) return INVALID_MOVE;
        const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
        const demoted = demoteByOneRankWithSeatCheck(args.G, targetPlayerID, playerCount);
        if (!demoted.ok) return INVALID_MOVE;
        specialMessage = legendaryTexts.droidDemote(
          getPlayerLabel(args.G, targetPlayerID),
          rankNameById(demoted.fromRankId),
          rankNameById(demoted.toRankId),
        );
      }

      try {
        const applied = applyCardEffects(args.G, playerID, card.effects, []);
        if (!applied) return INVALID_MOVE;
      } catch {
        return INVALID_MOVE;
      }

      hand.splice(idx, 1);
      args.G.legendaryDiscard.push(card);
      syncPlayerState(args.G, playerID);
      const seq = nextSystemMessageSeq(args.G);
      appendChat(args.G, {
        type: 'system',
        text: buildLegendaryPlayedMessageText({
          seq,
          playerLabel,
          cardTitle: card.title,
          specialMessage,
        }),
      });
      return undefined;
    },
    discardFromHand: (args, cardId: string) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      const stage = args.ctx.activePlayers?.[playerID];
      if (![PLAY_STAGE, END_STAGE].includes(stage as string)) return INVALID_MOVE;
      const hand = args.G.hands[playerID];
      if (hand.length <= HAND_LIMIT) return INVALID_MOVE;
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx === -1) return INVALID_MOVE;
      const card = hand[idx];
      if (card.category === 'LYAP' || card.category === 'SCANDAL') return INVALID_MOVE;
      hand.splice(idx, 1);
      args.G.discard.push(card);
      syncPlayerState(args.G, playerID);
      const seq = nextSystemMessageSeq(args.G);
      appendChat(args.G, {
        type: 'system',
        text: `🗂️ [${seq}] ${getPlayerLabel(args.G, playerID)} скидає «${card.title}» у скид, щоб вкластися в ліміт руки (${HAND_LIMIT}).`,
      });
      // Discarding overflow is a pre-end-turn action; return player to PLAY stage.
      args.events?.setStage(PLAY_STAGE);
      return undefined;
    },
    promote: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== PLAY_STAGE) return INVALID_MOVE;
      if (args.G.promotedThisTurn[playerID]) return INVALID_MOVE;
      const beforeResources = { ...args.G.resources[playerID] };
      const beforeRankId = args.G.ranks[playerID];
      const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
      if (!promoteRank(args.G, playerID, playerCount)) return INVALID_MOVE;
      args.G.promotedThisTurn[playerID] = true;
      const afterRankId = args.G.ranks[playerID];
      const promotedRank = getActiveRanks().find((row) => row.id === afterRankId);
      const summary = summarizeAppliedDiff(
        beforeResources,
        args.G.resources[playerID],
        beforeRankId,
        afterRankId,
      );
      const seq = nextSystemMessageSeq(args.G);
      appendChat(args.G, {
        type: 'system',
        text: buildPromotionSystemMessage(
          seq,
          getPlayerLabel(args.G, playerID),
          beforeRankId,
          afterRankId,
          promotedRank?.cost ?? {},
          promotedRank?.bonus ?? {},
          summary,
        ),
      });
      return undefined;
    },
    pass: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (![PLAY_STAGE, END_STAGE].includes(args.ctx.activePlayers?.[playerID] as string)) return INVALID_MOVE;
      if ((args.G.hands[playerID]?.length ?? 0) > HAND_LIMIT) return INVALID_MOVE;
      args.events?.endTurn();
      return undefined;
    },
  },
  endIf: ({ G }) => {
    const winner = getWinner(G);
    if (!winner) return undefined;
    return { winner };
  },
  ai: {
    enumerate: (G, ctx, playerID) => {
      const currentPlayer = playerID ?? ctx.currentPlayer;
      const hand = G.hands[currentPlayer] ?? [];
      const legendaryHand = G.legendaryHands[currentPlayer] ?? [];
      const stage = ctx.activePlayers?.[currentPlayer];
      if (stage === DRAW_STAGE) {
        return [
          { move: 'drawCard' as const },
          ...legendaryHand.map((card) => ({ move: 'playLegendaryCard' as const, args: [card.id] })),
        ];
      }
      if (stage === END_STAGE) {
        return [
          { move: 'pass' as const },
          ...legendaryHand.map((card) => ({ move: 'playLegendaryCard' as const, args: [card.id] })),
        ];
      }
      return [
        ...legendaryHand.map((card) => ({ move: 'playLegendaryCard' as const, args: [card.id] })),
        ...hand.map((card) => ({ move: 'playCard' as const, args: [card.id] })),
        { move: 'promote' as const },
        { move: 'pass' as const },
      ];
    },
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
