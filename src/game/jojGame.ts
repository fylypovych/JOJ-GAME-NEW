import type { Ctx, Game } from 'boardgame.io';
import {
  buildLegendaryPlayedMessageText,
  legendaryTexts,
} from './systemMessages';
import { appendChat as appendChatBase, getPlayerLabel, nextSystemMessageSeq } from './chatUtils';
import { cloneCard } from './cloneUtils';
import { createEffectsEngine } from './effectsEngine';
import { createSanitizedPlayerView } from './gameStateUtils';
import { createGameRuntimeHelpers, normalizeGameModeByLegendaryMode } from './gameRuntimeHelpers';
import { createBotEngine, attachBotsToGameState, isBotPlayer } from './bot-engine/engine';
import { normalizeBotSetup } from './bot-engine/config';
import {
  drawCardHandler,
  passHandler,
  playCardHandler,
  playLegendaryCardHandler,
  promoteHandler,
  resolveDrawAutoCardHandler,
} from './moveHandlers';
import { createJojMoves, enumerateAiMoves } from './moves';
import { resourceKeys, resourceLabelsUk } from './resourceMeta';
import { createRankEngine } from './rankEngine';
import { createEmptyGameState, initializePlayerInGameState } from './stateFactory';
import { canPlayHandCardAtStage } from './turnRules';
import {
  runGameSimulationsAggregateWithDeps,
  runGameSimulationsWithDeps,
  type SimulationAggregate,
  type SimulationOptions,
  type SimulationReport,
} from './simulation';
import {
  buildDeckModulesFromTemplate,
  getActiveRanks,
  getSharedDeckTemplate,
  resolveRandomRankImage,
  getTopRankId,
  shuffle,
  type LegendaryDeckMode,
  type SharedGameSetup,
} from './sharedConfig';
import type { CardDefinition, GameMode, JojGameState, ResourceKey } from './types';
export {
  addCardToSharedDeckTemplate,
  addCustomCardToSharedDeckTemplate,
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  getCardCatalog,
  getSharedDeckTemplate,
  getSharedDeckTemplateStats,
  getSharedRanks,
  importSharedRanksJson,
  importSharedDeckTemplateJson,
  resetSharedDeckTemplate,
  resetSharedRanks,
  repairGeneratedRankVisualData,
  removeCardAtFromSharedDeckTemplate,
  setSharedDeckBackImage,
  setSharedRanks,
  shuffleSharedDeckTemplate,
  updateCardAtInSharedDeckTemplate,
} from './sharedConfig';
export type {
  DeckModuleCategory,
  DeckModuleDefinition,
  DeckModuleType,
  DeckTarget,
  LegendaryDeckMode,
  SharedGameSetup,
  SharedRanks,
} from './sharedConfig';

const INVALID_MOVE = 'INVALID_MOVE' as const;
const STARTING_HAND_SIZE = 5;
const STARTING_LEGENDARY_HAND_SIZE = 5;
const HAND_LIMIT = 8;
const GAME_MODE_STANDARD: GameMode = 'standard';
const GAME_MODE_STANDARD_PLUS: GameMode = 'standard_plus';
const GAME_MODE_SIMPLIFIED: GameMode = 'simplified';
const DRAW_STAGE = 'draw';
const PLAY_STAGE = 'play';
const END_STAGE = 'end';
const IDLE_STAGE = 'idle';
const CHAT_LIMIT = 200;
const resolveGameMode = (setupData: unknown): GameMode => {
  if (!setupData || typeof setupData !== 'object') return GAME_MODE_STANDARD;
  const rawMode = (setupData as { gameMode?: unknown }).gameMode;
  if (rawMode === GAME_MODE_STANDARD_PLUS) return GAME_MODE_STANDARD_PLUS;
  if (rawMode === GAME_MODE_SIMPLIFIED) return GAME_MODE_SIMPLIFIED;
  return GAME_MODE_STANDARD;
};

const resolveSetupOverride = (setupData: unknown): Partial<SharedGameSetup> => {
  if (!setupData || typeof setupData !== 'object') return {};
  const raw = setupData as { gameSetup?: unknown; legendaryDeckMode?: unknown };
  const safeId = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    return normalized || undefined;
  };
  const out: Partial<SharedGameSetup> = {};
  if (raw.gameSetup && typeof raw.gameSetup === 'object') {
    const setup = raw.gameSetup as Record<string, unknown>;
    const lyapModuleId = safeId(setup.lyapModuleId);
    if (lyapModuleId) out.lyapModuleId = lyapModuleId;
    const scandalModuleId = safeId(setup.scandalModuleId);
    if (scandalModuleId) out.scandalModuleId = scandalModuleId;
    const supportModuleId = safeId(setup.supportModuleId);
    if (supportModuleId) out.supportModuleId = supportModuleId;
    const commandModuleId = safeId(setup.commandModuleId);
    if (commandModuleId) out.commandModuleId = commandModuleId;
    if (Array.isArray(setup.optionalMainDeckModuleIds)) {
      out.optionalMainDeckModuleIds = setup.optionalMainDeckModuleIds
        .filter((item): item is string => typeof item === 'string')
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean);
    }
    const legendaryModuleId = safeId(setup.legendaryModuleId);
    if (legendaryModuleId) out.legendaryModuleId = legendaryModuleId;
    const rankModuleId = safeId(setup.rankModuleId);
    if (rankModuleId) out.rankModuleId = rankModuleId;
    const mode = setup.legendaryDeckMode;
    if (mode === 'merged' || mode === 'separate') out.legendaryDeckMode = mode;
  }
  const mode = raw.legendaryDeckMode;
  if (mode === 'merged' || mode === 'separate') out.legendaryDeckMode = mode as LegendaryDeckMode;
  return out;
};

const resolveBotSetup = (setupData: unknown, totalPlayers: number) => {
  if (!setupData || typeof setupData !== 'object') return null;
  return normalizeBotSetup((setupData as { bots?: unknown }).bots, totalPlayers);
};


const appendChat = (
  G: JojGameState,
  entry: { type: 'player' | 'system'; text: string; playerID?: string },
) => appendChatBase(G, entry, CHAT_LIMIT);

const applyRankImageForPlayer = (G: JojGameState, playerID: string) => {
  if (!G.rankImageByPlayer) G.rankImageByPlayer = {};
  const rankId = G.ranks[playerID];
  const image = resolveRandomRankImage(rankId);
  if (image) G.rankImageByPlayer[playerID] = image;
  else delete G.rankImageByPlayer[playerID];
};

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
  onRankChanged: (G, playerID) => {
    applyRankImageForPlayer(G, playerID);
  },
});
export { getReplacementUnitsForCard };

const drawCards = (G: JojGameState, playerID: string, amount: number): void => {
  for (let i = 0; i < amount; i += 1) {
    if (G.deck.length === 0) break;
    const card = G.deck.pop();
    if (card) G.hands[playerID].push(card);
  }
};

const drawLegendaryCards = (G: JojGameState, playerID: string, amount: number, sourceCards?: CardDefinition[]): void => {
  const fallback = getSharedDeckTemplate().legendaryDeck;
  const source = (sourceCards ?? G.legendaryDeck ?? fallback).map(cloneCard);
  G.legendaryHands[playerID] = shuffle(source).slice(0, Math.max(0, amount));
};

const syncPlayerState = (G: JojGameState, playerID: string): void => {
  if (!G.rankImageByPlayer) G.rankImageByPlayer = {};
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
  onRankChanged: (G, playerID) => {
    applyRankImageForPlayer(G, playerID);
  },
});

const buildReplacementPlan = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): ResourceKey[] | null => planReplacementResources(resources, effects);
const {
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
} = createGameRuntimeHelpers({
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
  hasResources,
  planReplacementResources,
});
export {
  buildSimulationReportFromAggregate,
  mergeSimulationAggregates,
  type SimulationAggregate,
  type SimulationReport,
} from './simulation';

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
  hasPlayableCardsByInventory,
  getWinner,
  startingHandSize: STARTING_HAND_SIZE,
  startingLegendaryHandSize: STARTING_LEGENDARY_HAND_SIZE,
}, players, simulations, maxTurns, options);

export const runGameSimulationsAggregate = (
  players: number,
  simulations: number,
  maxTurns = 600,
  options?: SimulationOptions,
): SimulationAggregate => runGameSimulationsAggregateWithDeps({
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
  hasPlayableCardsByInventory,
  getWinner,
  startingHandSize: STARTING_HAND_SIZE,
  startingLegendaryHandSize: STARTING_LEGENDARY_HAND_SIZE,
}, players, simulations, maxTurns, options);

const botEngine = createBotEngine({
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
  getReplacementUnitsForCard,
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
  snapshotResourcesForStats: snapshotResourceTotals,
  recordResourceFlowStats,
  resetNoPlayablePassStreak,
  shouldCountNoPlayablePass,
  hasPlayableCardsByInventory,
  incrementNoPlayablePassStreak: (G) => {
    G.noPlayablePassStreak = (G.noPlayablePassStreak ?? 0) + 1;
  },
  incrementTurnsCompleted: (G, playerID) => {
    G.gameStats.turnsCompleted = (G.gameStats.turnsCompleted ?? 0) + 1;
    if (playerID && G.playerGameStats[playerID]) {
      G.playerGameStats[playerID].turnsTaken = (G.playerGameStats[playerID].turnsTaken ?? 0) + 1;
    }
  },
  incrementLyapPlayedOnOthers: (G, playerID) => {
    G.gameStats.lyapsPlayedOnOthers = (G.gameStats.lyapsPlayedOnOthers ?? 0) + 1;
    if (playerID && G.playerGameStats[playerID]) {
      G.playerGameStats[playerID].lyapsPlayedOnOthers = (G.playerGameStats[playerID].lyapsPlayedOnOthers ?? 0) + 1;
    }
  },
  incrementScandalPlayedOnOthers: (G, playerID) => {
    G.gameStats.scandalsPlayedOnOthers = (G.gameStats.scandalsPlayedOnOthers ?? 0) + 1;
    if (playerID && G.playerGameStats[playerID]) {
      G.playerGameStats[playerID].scandalsPlayedOnOthers = (G.playerGameStats[playerID].scandalsPlayedOnOthers ?? 0) + 1;
    }
  },
  resetEndGameVote: (G) => {
    G.endGameVote = { active: false, requestedBy: null, votes: {} };
  },
  computeShieldUntilNextOwnTurn,
  cancelLastLyapOrScandalForPlayer,
  cancelLastScandalForPlayer,
  promoteToSpecificRank,
  grantSpecificRankIgnoringRequirements,
  demoteByOneRankWithSeatCheck,
  promoteRank,
  getActiveRanks,
  drawCardHandler,
  resolveDrawAutoCardHandler,
  playCardHandler,
  playLegendaryCardHandler,
  promoteHandler,
  passHandler,
  planReplacementResources: buildReplacementPlan,
});

export const jojGame: Game<JojGameState> = {
  name: 'joj-game',
  minPlayers: 2,
  maxPlayers: 6,
  setup: ({ ctx }, setupData) => {
    const players = [...ctx.playOrder];
    const template = getSharedDeckTemplate();
    const requestedGameMode = resolveGameMode(setupData);
    const setupOverride = resolveSetupOverride(setupData);
    const botSetup = resolveBotSetup(setupData, players.length);
    const deckModules = buildDeckModulesFromTemplate(template, setupOverride);
    let optionalMainDeckCards: CardDefinition[] = deckModules.gameSetup.optionalMainDeckModuleIds
      .flatMap((moduleId) => (deckModules.optionalMainDeckModules[moduleId] ?? []).map(cloneCard));
    let optionalLegendaryCards: CardDefinition[] = deckModules.legendaryDeck.map(cloneCard);
    const mergedLegendaryMode = deckModules.gameSetup.legendaryDeckMode === 'merged';
    const effectiveGameMode = normalizeGameModeByLegendaryMode(
      requestedGameMode,
      mergedLegendaryMode ? 'merged' : 'separate',
    );
    const mainDeckCards = [...deckModules.baseDeck.map(cloneCard), ...optionalMainDeckCards.map(cloneCard)];
    const mergedDeckSource = effectiveGameMode === GAME_MODE_SIMPLIFIED
      ? [...mainDeckCards, ...optionalLegendaryCards.map(cloneCard)]
      : mainDeckCards;
    const deck = shuffle(mergedDeckSource.map(cloneCard));
    const hasLegendaryModule = optionalLegendaryCards.length > 0;

    const state = createEmptyGameState({
      gameMode: effectiveGameMode,
      deck,
      legendaryDeck: effectiveGameMode === GAME_MODE_SIMPLIFIED
        ? []
        : !hasLegendaryModule
          ? []
          : effectiveGameMode === GAME_MODE_STANDARD_PLUS
            ? optionalLegendaryCards.map(cloneCard)
            : shuffle(optionalLegendaryCards.map(cloneCard)),
      deckBackImage: template.deckBackImage,
    });

    players.forEach((playerID) => {
      initializePlayerInGameState({
        G: state,
        playerID,
        playerIndex: Number(playerID),
        startingRankId: getActiveRanks()[0]?.id ?? 'cadet',
        startingHandSize: STARTING_HAND_SIZE,
        startingLegendaryHandSize: STARTING_LEGENDARY_HAND_SIZE,
        legendaryDraftCompleted: !hasLegendaryModule || effectiveGameMode === GAME_MODE_STANDARD || effectiveGameMode === GAME_MODE_SIMPLIFIED,
        playerName: '',
        drawCards,
        drawLegendaryCards: hasLegendaryModule && effectiveGameMode === GAME_MODE_STANDARD ? drawLegendaryCards : undefined,
        legendarySourceCards: hasLegendaryModule && effectiveGameMode === GAME_MODE_STANDARD ? optionalLegendaryCards : undefined,
        syncPlayerState,
        onBeforeSync: applyRankImageForPlayer,
      });
    });

    attachBotsToGameState({
      G: state,
      totalPlayers: players.length,
      botSetup,
    });
    if (hasLegendaryModule && effectiveGameMode === GAME_MODE_STANDARD_PLUS) {
      Object.keys(state.botPlayers ?? {}).forEach((playerID) => {
        state.legendaryHands[playerID] = shuffle(optionalLegendaryCards.map(cloneCard)).slice(0, STARTING_LEGENDARY_HAND_SIZE);
        state.legendaryDraftCompleted[playerID] = true;
        syncPlayerState(state, playerID);
      });
    }

    return state;
  },
  turn: {
    activePlayers: { currentPlayer: DRAW_STAGE },
    onBegin: ({ G, ctx, events }) => {
      G.extraHandPlayTokens[ctx.currentPlayer] = 0;
      Object.keys(G.promotedThisTurn).forEach((pid) => {
        G.promotedThisTurn[pid] = false;
      });
      if (Number(G.ignoreSeatLimitForPromotionUntilTurn?.[ctx.currentPlayer] ?? 0) <= Number(ctx.turn ?? 0)) {
        delete G.ignoreSeatLimitForPromotionUntilTurn?.[ctx.currentPlayer];
      }
      Object.keys(G.sukhpayZsuPendingBonus ?? {}).forEach((pid) => {
        if (Number(G.sukhpayZsuWatchUntilTurn?.[pid] ?? -1) < Number(ctx.turn ?? 0)) {
          G.sukhpayZsuPendingBonus[pid] = false;
        }
      });
      if ((G.skippedTurnCounts?.[ctx.currentPlayer] ?? 0) > 0) {
        G.skippedTurnCounts![ctx.currentPlayer] = Math.max(0, (G.skippedTurnCounts?.[ctx.currentPlayer] ?? 0) - 1);
        G.gameStats.turnsCompleted = (G.gameStats.turnsCompleted ?? 0) + 1;
        if (G.playerGameStats?.[ctx.currentPlayer]) {
          G.playerGameStats[ctx.currentPlayer].turnsTaken = (G.playerGameStats[ctx.currentPlayer].turnsTaken ?? 0) + 1;
        }
        syncPlayerState(G, ctx.currentPlayer);
        const seq = nextSystemMessageSeq(G);
        appendChat(G, {
          type: 'system',
          text: `⏭️ [${seq}] ${getPlayerLabel(G, ctx.currentPlayer)} пропускає хід через нестачу ресурсів для обов'язкового списання.`,
        });
        events?.endTurn?.();
        return;
      }
      const value: Record<string, string> = {};
      ctx.playOrder.forEach((pid) => {
        value[pid] = IDLE_STAGE;
      });
      value[ctx.currentPlayer] = G.deck.length > 0 ? DRAW_STAGE : PLAY_STAGE;
      if (isBotPlayer(G, ctx.currentPlayer)) {
        botEngine.playTurn({
          G,
          ctx: {
            currentPlayer: ctx.currentPlayer,
            activePlayers: value,
            numPlayers: ctx.numPlayers,
            playOrder: ctx.playOrder,
            turn: ctx.turn,
          },
          playerID: ctx.currentPlayer,
          initialStage: value[ctx.currentPlayer],
        });
        events?.endTurn?.();
        return;
      }
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
    planReplacementResources,
    getReplacementUnitsForCard,
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
    snapshotResourcesForStats: snapshotResourceTotals,
    recordResourceFlowStats,
    resetNoPlayablePassStreak,
    shouldCountNoPlayablePass,
    hasPlayableCardsByInventory,
    incrementNoPlayablePassStreak: (G) => {
      G.noPlayablePassStreak = (G.noPlayablePassStreak ?? 0) + 1;
    },
    incrementTurnsCompleted: (G, playerID) => {
      G.gameStats.turnsCompleted = (G.gameStats.turnsCompleted ?? 0) + 1;
      if (playerID && G.playerGameStats[playerID]) {
        G.playerGameStats[playerID].turnsTaken = (G.playerGameStats[playerID].turnsTaken ?? 0) + 1;
      }
    },
    incrementLyapPlayedOnOthers: (G, playerID) => {
      G.gameStats.lyapsPlayedOnOthers = (G.gameStats.lyapsPlayedOnOthers ?? 0) + 1;
      if (playerID && G.playerGameStats[playerID]) {
        G.playerGameStats[playerID].lyapsPlayedOnOthers = (G.playerGameStats[playerID].lyapsPlayedOnOthers ?? 0) + 1;
      }
    },
    incrementScandalPlayedOnOthers: (G, playerID) => {
      G.gameStats.scandalsPlayedOnOthers = (G.gameStats.scandalsPlayedOnOthers ?? 0) + 1;
      if (playerID && G.playerGameStats[playerID]) {
        G.playerGameStats[playerID].scandalsPlayedOnOthers = (G.playerGameStats[playerID].scandalsPlayedOnOthers ?? 0) + 1;
      }
    },
    resetEndGameVote: (G) => {
      G.endGameVote = { active: false, requestedBy: null, votes: {} };
    },
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
    if (G.endGameVote?.active) {
      const playerIDs = Object.keys(G.players ?? {});
      const allAgreed = playerIDs.length > 0 && playerIDs.every((pid) => G.endGameVote.votes?.[pid] === true);
      if (allAgreed) {
        const winner = getWinner(G) ?? getRankThenResourceLeader(G);
        return { winner, endReason: 'agreed-end', stats: G.gameStats };
      }
    }
    const winner = getWinner(G);
    if (winner) {
      return { winner, endReason: 'winner', stats: G.gameStats };
    }
    const playerCount = Object.keys(G.players ?? {}).length;
    if (
      playerCount > 0
      && (G.deck?.length ?? 0) === 0
      && allPlayersOutOfPlayableCardsByInventory(G)
      && (G.noPlayablePassStreak ?? 0) >= playerCount
    ) {
      const fallbackWinner = getRankThenResourceLeader(G);
      if (!fallbackWinner) return { endReason: 'stalled-no-cards', stats: G.gameStats };
      return { winner: fallbackWinner, endReason: 'stalled-no-cards', stats: G.gameStats };
    }
    return undefined;
  },
  ai: {
    enumerate: enumerateAiMoves({ DRAW_STAGE, END_STAGE }),
  },
  playerView: ({ G, ctx, playerID }) => createSanitizedPlayerView(G, ctx, playerID ?? undefined),
};

export type JojCtx = Ctx;
