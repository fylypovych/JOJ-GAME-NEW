import type { CardDefinition, GameMode, JojGameState, ResourceKey } from './types';
import { getCardPlayBehavior } from './cardRules';
import { appendAppliedEffectLog } from './effectLog';
import { withGameStateTransaction } from './gameStateUtils';
import { applyLegendaryAbility } from './legendaryAbilities';
import { calculateSimulationTurnLimit, createSimulationState } from './simulationSetup';
import type { SharedGameSetup } from './sharedConfig';
import { buildBotPlans, type BotPlan } from './bot-engine/planner';
import { executeBestBotPlan, executeBotPlanSequence } from './bot-engine/execution';
import { canAffordVvnzCost, isValidVvnzPayment, selectVvnzPaymentResources, spendVvnzPayment } from './vvnzCost';
import { rankSeatLimitForRank } from './rankEngine';

export type SimulationReport = {
  input: {
    players: number;
    simulations: number;
    maxTurns: number;
    useMainDeck: boolean;
    useLegendaryDeck: boolean;
    gameMode: GameMode;
  };
  generatedAt: string;
  summary: {
    finished: number;
    stalled: number;
    avgTurns: number;
    avgDeckDepletionTurn: number;
    rankWins: number;
    scoreWins: number;
    avgPassesPerGame: number;
  };
  seatWinRates: Array<{
    playerID: string;
    wins: number;
    winRatePct: number;
  }>;
  rankReached: Record<string, number>;
  topReachedRanks: Array<{
    rankId: string;
    games: number;
    pct: number;
  }>;
  topReachedRanksByPct: Array<{
    rankId: string;
    games: number;
    pct: number;
  }>;
  lastGame: {
    winnerPlayerID: string;
    winnerRankId: string;
    winnerResources: Record<ResourceKey, number>;
    turns: number;
  };
  issues: string[];
};

export type SimulationAggregate = {
  input: SimulationReport['input'];
  generatedAt: string;
  rankOrder: string[];
  wins: Record<string, number>;
  rankReached: Record<string, number>;
  highestRankReachedByGame: Record<string, number>;
  totalTurns: number;
  stalled: number;
  rankWins: number;
  scoreWins: number;
  passesTotal: number;
  deckDepletionTotal: number;
  deckDepletionKnown: number;
  lastGame: SimulationReport['lastGame'];
};

export type SimulationOptions = {
  useMainDeck?: boolean;
  useLegendaryDeck?: boolean;
  gameMode?: GameMode;
  gameSetup?: Partial<SharedGameSetup>;
  onProgress?: (completed: number, total: number) => void;
  onStatus?: (status: {
    completed: number;
    total: number;
    currentMatch: number;
    turnsInCurrentMatch: number;
    maxTurns: number;
  }) => void;
};

export type SimulationDeps = {
  resourceKeys: readonly ResourceKey[];
  shuffle: <T>(items: T[]) => T[];
  cloneCard: (card: CardDefinition) => CardDefinition;
  getSharedDeckTemplate: () => {
    deck: CardDefinition[];
    legendaryDeck: CardDefinition[];
    rankTrack: CardDefinition[];
    extraCatalog: CardDefinition[];
    deckBackImage?: string;
    modules: Array<{
      id: string;
      name: string;
      moduleType: 'MAIN_DECK_MODULE' | 'SEPARATE_DECK_MODULE' | 'SYSTEM_MODULE' | 'VISUAL_TRACK_MODULE';
      category: 'LYAP' | 'SCANDAL' | 'SUPPORT' | 'COMMAND' | 'LEGENDARY' | 'VVNZ' | 'RANK';
      cardCount: number;
      enabled: boolean;
      target: 'deck' | 'legendaryDeck' | 'rankTrack';
      cardIds: string[];
      defaultCategory?: CardDefinition['category'];
      deckBackImage?: string;
    }>;
    gameSetup: {
      lyapModuleId?: string;
      scandalModuleId?: string;
      supportModuleId?: string;
      commandModuleId?: string;
      optionalMainDeckModuleIds: string[];
      legendaryModuleId?: string;
      rankModuleId?: string;
      legendaryDeckMode: 'separate' | 'merged';
    };
  };
  getActiveRanks: () => Array<{ id: string } & Partial<{ victory: boolean }>>;
  getTopRankId: () => string;
  drawCards: (G: JojGameState, playerID: string, amount: number) => void;
  drawLegendaryCards: (G: JojGameState, playerID: string, amount: number, sourceCards?: CardDefinition[]) => void;
  syncPlayerState: (G: JojGameState, playerID: string) => void;
  promoteRank: (G: JojGameState, playerID: string, playerCount: number) => boolean;
  promoteToSpecificRank: (G: JojGameState, playerID: string, rankId: string, playerCount: number) => { ok: boolean };
  grantSpecificRankIgnoringRequirements: (
    G: JojGameState,
    playerID: string,
    rankId: string,
    playerCount: number,
  ) => { ok: boolean; applied?: boolean };
  demoteByOneRankWithSeatCheck: (
    G: JojGameState,
    playerID: string,
    playerCount: number,
  ) => { ok: boolean };
  triggerSukhpayZsuOnScandal: (G: JojGameState, ctx: { turn: number }, sourcePlayerID: string) => void;
  cancelLastLyapOrScandalForPlayer: (G: JojGameState, playerID: string) => { canceledCard?: CardDefinition | null };
  cancelLastScandalForPlayer: (G: JojGameState, playerID: string) => { canceledCard?: CardDefinition | null };
  applyCardEffects: (
    G: JojGameState,
    playerID: string,
    effects: CardDefinition['effects'],
    replacementResources?: ResourceKey[],
  ) => boolean;
  applyCardEffectsSoft: (
    G: JojGameState,
    playerID: string,
    effects: CardDefinition['effects'],
  ) => { resources: Partial<Record<ResourceKey, number>>; rank: number };
  clampNonNegativeResources: (resources: Record<ResourceKey, number>) => void;
  planReplacementResources: (
    resources: Record<ResourceKey, number>,
    effects: CardDefinition['effects'],
  ) => ResourceKey[] | null;
  hasPlayableCardsByInventory: (G: JojGameState, playerID: string) => boolean;
  getWinner: (G: JojGameState) => string | undefined;
  startingHandSize: number;
  startingLegendaryHandSize: number;
};

type SimulationMatchResult = {
  winner: string;
  turns: number;
  stalled: boolean;
  deckDepletionTurn: number;
  wonByRank: boolean;
  passes: number;
  reachedRanks: Record<string, string>;
  finalResources: Record<string, Record<ResourceKey, number>>;
};

const createEmptySimulationAggregate = (args: {
  players: number;
  simulations: number;
  maxTurns: number;
  useMainDeck: boolean;
  useLegendaryDeck: boolean;
  gameMode: GameMode;
  rankOrder: string[];
}): SimulationAggregate => ({
  input: {
    players: args.players,
    simulations: args.simulations,
    maxTurns: args.maxTurns,
    useMainDeck: args.useMainDeck,
    useLegendaryDeck: args.useLegendaryDeck,
    gameMode: args.gameMode,
  },
  generatedAt: new Date().toISOString(),
  rankOrder: [...args.rankOrder],
  wins: {},
  rankReached: {},
  highestRankReachedByGame: {},
  totalTurns: 0,
  stalled: 0,
  rankWins: 0,
  scoreWins: 0,
  passesTotal: 0,
  deckDepletionTotal: 0,
  deckDepletionKnown: 0,
  lastGame: {
    winnerPlayerID: '0',
    winnerRankId: args.rankOrder[0] ?? 'cadet',
    winnerResources: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
    turns: 0,
  },
});

const recordSimulationResult = (
  aggregate: SimulationAggregate,
  result: SimulationMatchResult,
) => {
  aggregate.wins[result.winner] = (aggregate.wins[result.winner] ?? 0) + 1;
  aggregate.totalTurns += result.turns;
  aggregate.passesTotal += result.passes;
  if (result.stalled) aggregate.stalled += 1;
  if (result.wonByRank) aggregate.rankWins += 1;
  else aggregate.scoreWins += 1;
  if (result.deckDepletionTurn >= 0) {
    aggregate.deckDepletionTotal += result.deckDepletionTurn;
    aggregate.deckDepletionKnown += 1;
  }
  Object.values(result.reachedRanks).forEach((rankId) => {
    aggregate.rankReached[rankId] = (aggregate.rankReached[rankId] ?? 0) + 1;
  });
  const highest = Object.values(result.reachedRanks)
    .map((rankId) => ({ rankId, idx: aggregate.rankOrder.indexOf(rankId) }))
    .sort((a, b) => b.idx - a.idx)[0];
  if (highest?.rankId) {
    aggregate.highestRankReachedByGame[highest.rankId] = (aggregate.highestRankReachedByGame[highest.rankId] ?? 0) + 1;
  }
  aggregate.lastGame = {
    winnerPlayerID: result.winner,
    winnerRankId: result.reachedRanks[result.winner] ?? (aggregate.rankOrder[0] ?? 'cadet'),
    winnerResources: { ...result.finalResources[result.winner] },
    turns: result.turns,
  };
};

export const buildSimulationReportFromAggregate = (aggregate: SimulationAggregate): SimulationReport => {
  const { input } = aggregate;
  const clampedSims = Math.max(1, input.simulations);
  const topReachedRanks = Object.entries(aggregate.highestRankReachedByGame)
    .map(([rankId, games]) => ({
      rankId,
      games,
      pct: Number(((games / clampedSims) * 100).toFixed(2)),
      idx: aggregate.rankOrder.indexOf(rankId),
    }))
    .sort((a, b) => b.idx - a.idx || b.games - a.games)
    .slice(0, 3)
    .map(({ rankId, games, pct }) => ({ rankId, games, pct }));
  const topReachedRanksByPct = Object.entries(aggregate.highestRankReachedByGame)
    .map(([rankId, games]) => ({
      rankId,
      games,
      pct: Number(((games / clampedSims) * 100).toFixed(2)),
      idx: aggregate.rankOrder.indexOf(rankId),
    }))
    .sort((a, b) => b.games - a.games || b.pct - a.pct || b.idx - a.idx)
    .slice(0, 3)
    .map(({ rankId, games, pct }) => ({ rankId, games, pct }));

  const seatWinRates = Array.from({ length: input.players }, (_, i) => String(i)).map((playerID) => {
    const seatWins = aggregate.wins[playerID] ?? 0;
    return {
      playerID,
      wins: seatWins,
      winRatePct: Number(((seatWins / clampedSims) * 100).toFixed(2)),
    };
  });

  const issues: string[] = [];
  if (aggregate.stalled > 0) {
    issues.push(
      `Виявлено ${aggregate.stalled} зациклених/довгих матчів із ${clampedSims} (ліміт ${input.maxTurns} ходів).`,
    );
  }
  const bestSeat = [...seatWinRates].sort((a, b) => b.winRatePct - a.winRatePct)[0];
  const worstSeat = [...seatWinRates].sort((a, b) => a.winRatePct - b.winRatePct)[0];
  if (bestSeat && worstSeat && bestSeat.winRatePct - worstSeat.winRatePct >= 12) {
    issues.push(
      `Можлива перевага порядку ходу: seat ${bestSeat.playerID} (${bestSeat.winRatePct}%) vs seat ${worstSeat.playerID} (${worstSeat.winRatePct}%).`,
    );
  }
  if (aggregate.rankWins === 0) {
    issues.push('У симуляціях не зафіксовано перемог через звання Генерала (можливо завеликі вимоги або замалий темп ресурсів).');
  }

  return {
    input,
    generatedAt: aggregate.generatedAt,
    summary: {
      finished: clampedSims - aggregate.stalled,
      stalled: aggregate.stalled,
      avgTurns: Number((aggregate.totalTurns / clampedSims).toFixed(2)),
      avgDeckDepletionTurn: Number(
        (aggregate.deckDepletionKnown > 0 ? aggregate.deckDepletionTotal / aggregate.deckDepletionKnown : 0).toFixed(2),
      ),
      rankWins: aggregate.rankWins,
      scoreWins: aggregate.scoreWins,
      avgPassesPerGame: Number((aggregate.passesTotal / clampedSims).toFixed(2)),
    },
    seatWinRates,
    rankReached: { ...aggregate.rankReached },
    topReachedRanks,
    topReachedRanksByPct,
    lastGame: {
      ...aggregate.lastGame,
      winnerResources: { ...aggregate.lastGame.winnerResources },
    },
    issues,
  };
};

export const mergeSimulationAggregates = (aggregates: SimulationAggregate[]): SimulationAggregate => {
  const base = aggregates[0];
  if (!base) {
    return createEmptySimulationAggregate({
      players: 2,
      simulations: 1,
      maxTurns: 600,
      useMainDeck: true,
      useLegendaryDeck: true,
      gameMode: 'standard',
      rankOrder: [],
    });
  }
  const merged = createEmptySimulationAggregate({
    players: base.input.players,
    simulations: aggregates.reduce((sum, aggregate) => sum + aggregate.input.simulations, 0),
    maxTurns: base.input.maxTurns,
    useMainDeck: base.input.useMainDeck,
    useLegendaryDeck: base.input.useLegendaryDeck,
    gameMode: base.input.gameMode,
    rankOrder: base.rankOrder,
  });
  merged.generatedAt = new Date().toISOString();
  for (const aggregate of aggregates) {
    Object.entries(aggregate.wins).forEach(([playerID, wins]) => {
      merged.wins[playerID] = (merged.wins[playerID] ?? 0) + wins;
    });
    Object.entries(aggregate.rankReached).forEach(([rankId, count]) => {
      merged.rankReached[rankId] = (merged.rankReached[rankId] ?? 0) + count;
    });
    Object.entries(aggregate.highestRankReachedByGame).forEach(([rankId, count]) => {
      merged.highestRankReachedByGame[rankId] = (merged.highestRankReachedByGame[rankId] ?? 0) + count;
    });
    merged.totalTurns += aggregate.totalTurns;
    merged.stalled += aggregate.stalled;
    merged.rankWins += aggregate.rankWins;
    merged.scoreWins += aggregate.scoreWins;
    merged.passesTotal += aggregate.passesTotal;
    merged.deckDepletionTotal += aggregate.deckDepletionTotal;
    merged.deckDepletionKnown += aggregate.deckDepletionKnown;
    merged.lastGame = {
      ...aggregate.lastGame,
      winnerResources: { ...aggregate.lastGame.winnerResources },
    };
  }
  return merged;
};

const isProtectedFromLyapScandal = (G: JojGameState, currentTurn: number, playerID: string): boolean => {
  const untilTurn = Number(G.lyapScandalShieldUntilTurn?.[playerID] ?? 0);
  return untilTurn > 0 && currentTurn < untilTurn;
};

const chooseLowestResource = (
  deps: Pick<SimulationDeps, 'resourceKeys'>,
  row: Record<ResourceKey, number>,
): ResourceKey => [...deps.resourceKeys].sort((a, b) => (row[a] ?? 0) - (row[b] ?? 0))[0] ?? 'time';

const runSimulationTransaction = (G: JojGameState, run: () => boolean): boolean => {
  try {
    return withGameStateTransaction(G, run, (ok) => !ok);
  } catch {
    return false;
  }
};

const createSimulationPlannerDeps = (deps: SimulationDeps) => ({
  resourceKeys: deps.resourceKeys,
  getActiveRanks: deps.getActiveRanks,
  planReplacementResources: deps.planReplacementResources,
  hasPlayableCardsByInventory: deps.hasPlayableCardsByInventory,
});

const tryExecuteLegendaryPlanSim = (args: {
  deps: SimulationDeps;
  G: JojGameState;
  plan: Extract<BotPlan, { kind: 'play-legendary' }>;
  playerID: string;
  playerIDs: string[];
  currentTurn: number;
}): boolean => {
  const { deps, G, plan, playerID, playerIDs, currentTurn } = args;
  const hand = G.legendaryHands[playerID] ?? [];
  const index = hand.findIndex((card) => card.id === plan.cardId);
  if (index === -1) return false;
  const card = hand[index];
  const played = runSimulationTransaction(G, () => {
    const special = applyLegendaryAbility({
      d: {
        INVALID_MOVE: 'INVALID_MOVE',
        resourceKeys: deps.resourceKeys,
        resourceLabelsUk: Object.fromEntries(deps.resourceKeys.map((key) => [key, String(key)])) as Record<ResourceKey, string>,
        legendaryTexts: {
          budanovCanceled: () => '',
          budanovNoTarget: () => '',
          starlinkCanceled: () => '',
          starlinkNoTarget: () => '',
          sukhpayActivated: () => '',
          grammarShield: () => '',
          posmishkaMalyuka: () => '',
          statueTor: () => '',
          churchLeadership: () => '',
          waterRestore: () => '',
          droidDemote: () => '',
        },
        effectSummaryToText: () => '',
        rankNameById: (rankId) => rankId,
        resourceDeltaToText: () => '',
        clampNonNegativeResources: deps.clampNonNegativeResources,
        syncPlayerState: deps.syncPlayerState,
        getPlayerLabel: (_G, pid) => pid,
        computeShieldUntilNextOwnTurn: () => currentTurn + playerIDs.length,
        cancelLastLyapOrScandalForPlayer: (state, pid) => ({ ...deps.cancelLastLyapOrScandalForPlayer(state, pid), summary: { resources: {}, rank: 0 } }),
        cancelLastScandalForPlayer: (state, pid) => ({ ...deps.cancelLastScandalForPlayer(state, pid), summary: { resources: {}, rank: 0 } }),
        grantSpecificRankIgnoringRequirements: (state, pid, rankId, playerCount) => {
          const result = deps.grantSpecificRankIgnoringRequirements(state, pid, rankId, playerCount);
          if (!result.ok) return { ok: false as const, reason: 'grant-failed' };
          return { ok: true as const, applied: Boolean(result.applied), rank: { bonus: undefined } };
        },
        demoteByOneRankWithSeatCheck: (state, pid, playerCount) => {
          const result = deps.demoteByOneRankWithSeatCheck(state, pid, playerCount);
          return result.ok
            ? { ok: true as const, fromRankId: '', toRankId: '' }
            : { ok: false as const, reason: 'demote-failed' };
        },
      },
      G,
      ctx: { currentPlayer: playerID, playOrder: playerIDs, turn: currentTurn, numPlayers: playerIDs.length },
      card,
      playerID,
      targetPlayerID: plan.targetPlayerID,
      selectedResource: plan.selectedResource ?? chooseLowestResource(deps, G.resources[playerID]),
    });
    if (special === 'INVALID_MOVE') return false;
    return deps.applyCardEffects(G, playerID, card.effects, []);
  });
  if (!played) return false;
  hand.splice(index, 1);
  G.legendaryDiscard.push(card);
  deps.syncPlayerState(G, playerID);
  return true;
};

export const executeSimulationLegendaryPlan = (args: {
  deps: SimulationDeps;
  G: JojGameState;
  plan: Extract<BotPlan, { kind: 'play-legendary' }>;
  playerID: string;
  playerIDs: string[];
  currentTurn: number;
}): boolean => tryExecuteLegendaryPlanSim(args);

const tryExecuteHandPlanSim = (args: {
  deps: SimulationDeps;
  G: JojGameState;
  plan: Extract<BotPlan, { kind: 'play-card' }>;
  playerID: string;
  playerIDs: string[];
  currentTurn: number;
  numPlayers: number;
}): boolean => {
  const { deps, G, plan, playerID, playerIDs, currentTurn, numPlayers } = args;
  const hand = G.hands[playerID];
  if (!hand || hand.length === 0) return false;
  const index = hand.findIndex((card) => card.id === plan.cardId);
  if (index === -1) return false;
  const card = hand[index];

  const behavior = getCardPlayBehavior(card);
  if (behavior === 'lyap') {
    if (!plan.targetPlayerID) return false;
    if (!isProtectedFromLyapScandal(G, currentTurn, plan.targetPlayerID)) {
      const summary = deps.applyCardEffectsSoft(G, plan.targetPlayerID, card.effects);
      appendAppliedEffectLog(G, {
        sourceCardId: card.id,
        sourceCardTitle: card.title,
        sourceCategory: 'LYAP',
        sourcePlayerID: playerID,
        targetPlayerID: plan.targetPlayerID,
        summary,
        createdAtTurn: currentTurn,
      });
    }
    deps.syncPlayerState(G, plan.targetPlayerID);
  } else if (behavior === 'scandal') {
    playerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
      if (!isProtectedFromLyapScandal(G, currentTurn, pid)) {
        const summary = deps.applyCardEffectsSoft(G, pid, card.effects);
        appendAppliedEffectLog(G, {
          sourceCardId: card.id,
          sourceCardTitle: card.title,
          sourceCategory: 'SCANDAL',
          sourcePlayerID: playerID,
          targetPlayerID: pid,
          summary,
          createdAtTurn: currentTurn,
        });
      }
      deps.syncPlayerState(G, pid);
    });
    deps.triggerSukhpayZsuOnScandal(G, { turn: currentTurn }, playerID);
  } else if (behavior === 'command') {
    const played = runSimulationTransaction(G, () => {
      const replacement = plan.replacementResources ?? deps.planReplacementResources(G.resources[playerID], card.effects);
      if (replacement === null) return false;
      if (!deps.applyCardEffects(G, playerID, card.effects, replacement)) return false;
      deps.syncPlayerState(G, playerID);
      playerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
        deps.applyCardEffectsSoft(G, pid, card.effects);
        deps.syncPlayerState(G, pid);
      });
      return true;
    });
    if (!played) return false;
  } else if (behavior === 'vvnz') {
    const played = runSimulationTransaction(G, () => {
      const ranks = deps.getActiveRanks();
      const currentRankIdx = Math.max(0, ranks.findIndex((rank) => rank.id === G.ranks[playerID]));
      const targetRankIdx = ranks.findIndex((rank) => rank.id === (card.grantRank as string));
      if (targetRankIdx <= currentRankIdx) return false;
      const targetRank = ranks[targetRankIdx];
      if (!targetRank) return false;
      const occupied = Object.entries(G.ranks)
        .filter(([pid, rankId]) => pid !== playerID && rankId === targetRank.id)
        .length;
      if (occupied >= rankSeatLimitForRank(numPlayers, targetRank.id, ranks as never)) return false;
      if (!canAffordVvnzCost(G.resources[playerID])) return false;
      const payment = plan.replacementResources ?? selectVvnzPaymentResources(G.resources[playerID]);
      if (!payment || !isValidVvnzPayment(G.resources[playerID], payment)) return false;
      spendVvnzPayment(G.resources[playerID], payment);
      Object.entries((targetRank as { bonus?: Partial<Record<ResourceKey, number>> }).bonus ?? {}).forEach(([key, amount]) => {
        G.resources[playerID][key as ResourceKey] = (G.resources[playerID][key as ResourceKey] ?? 0) + (amount ?? 0);
      });
      G.ranks[playerID] = targetRank.id;
      G.promotedThisTurn[playerID] = true;
      if (!G.skippedTurnCounts) G.skippedTurnCounts = {};
      G.skippedTurnCounts[playerID] = (G.skippedTurnCounts[playerID] ?? 0) + 1;
      const ok = deps.applyCardEffects(G, playerID, card.effects, []);
      if (!ok) return false;
      deps.syncPlayerState(G, playerID);
      return true;
    });
    if (!played) return false;
  } else {
    const replacement = plan.replacementResources ?? deps.planReplacementResources(G.resources[playerID], card.effects);
    if (replacement === null) return false;
    try {
      const ok = deps.applyCardEffects(G, playerID, card.effects, replacement);
      if (!ok) return false;
    } catch {
      return false;
    }
  }

  hand.splice(index, 1);
  G.discard.push(card);
  deps.syncPlayerState(G, playerID);
  return true;
};

export const executeSimulationHandPlan = (args: {
  deps: SimulationDeps;
  G: JojGameState;
  plan: Extract<BotPlan, { kind: 'play-card' }>;
  playerID: string;
  playerIDs: string[];
  currentTurn: number;
  numPlayers: number;
}): boolean => tryExecuteHandPlanSim(args);

const tryPlayLegendaryCards = (
  deps: SimulationDeps,
  G: JojGameState,
  playerID: string,
  playerIDs: string[],
  currentTurn: number,
): boolean => {
  return executeBotPlanSequence({
    getPlans: () =>
      buildBotPlans(createSimulationPlannerDeps(deps), G, playerID, 'normal')
        .filter((plan): plan is Extract<BotPlan, { kind: 'play-legendary' }> => plan.kind === 'play-legendary'),
    executePlan: (plan) => tryExecuteLegendaryPlanSim({ deps, G, plan, playerID, playerIDs, currentTurn }),
  }).acted;
};

const tryPlayOneHandCardSim = (args: {
  deps: SimulationDeps;
  G: JojGameState;
  playerID: string;
  playerIDs: string[];
  currentTurn: number;
  numPlayers: number;
}): { played: boolean; promotedByPlay: boolean } => {
  const { deps, G, playerID, playerIDs, currentTurn, numPlayers } = args;
  const hand = G.hands[playerID];
  if (!hand || hand.length === 0) return { played: false, promotedByPlay: false };
  const { acted } = executeBestBotPlan(
    buildBotPlans(createSimulationPlannerDeps(deps), G, playerID, 'normal')
      .filter((plan): plan is Extract<BotPlan, { kind: 'play-card' }> => plan.kind === 'play-card'),
    (plan) => tryExecuteHandPlanSim({ deps, G, plan, playerID, playerIDs, currentTurn, numPlayers }),
  );
  return { played: acted, promotedByPlay: false };
};

const simulateSingleMatch = (
  deps: SimulationDeps,
  numPlayers: number,
  maxTurns: number,
  options?: Pick<SimulationOptions, 'onStatus'> & { currentMatch?: number; totalMatches?: number },
): {
  winner: string;
  turns: number;
  stalled: boolean;
  deckDepletionTurn: number;
  wonByRank: boolean;
  passes: number;
  reachedRanks: Record<string, string>;
  finalResources: Record<string, Record<ResourceKey, number>>;
} => simulateSingleMatchWithOptions(deps, numPlayers, maxTurns, {
  useMainDeck: true,
  useLegendaryDeck: true,
  gameMode: 'standard',
}, options);

export const runGameSimulationsWithDeps = (
  deps: SimulationDeps,
  players: number,
  simulations: number,
  maxTurns = 600,
  options: SimulationOptions = {},
): SimulationReport => {
  return buildSimulationReportFromAggregate(
    runGameSimulationsAggregateWithDeps(deps, players, simulations, maxTurns, options),
  );
};

export const runGameSimulationsAggregateWithDeps = (
  deps: SimulationDeps,
  players: number,
  simulations: number,
  _maxTurns = 600,
  options: SimulationOptions = {},
): SimulationAggregate => {
  const clampedPlayers = Math.max(2, Math.min(6, Math.floor(players || 2)));
  const clampedSims = Math.max(1, Math.min(5000, Math.floor(simulations || 1)));
  const requestedMode: GameMode | null = options.gameMode ?? null;
  const templateLegendaryMode = deps.getSharedDeckTemplate().gameSetup?.legendaryDeckMode ?? 'separate';
  const resolvedLegendaryMode = options.gameSetup?.legendaryDeckMode ?? templateLegendaryMode;
  const mode: GameMode | null = requestedMode
    ? (resolvedLegendaryMode === 'merged' ? 'simplified' : requestedMode)
    : null;
  const useMainDeck = mode ? true : options.useMainDeck !== false;
  const useLegendaryDeck = mode
    ? mode !== 'simplified'
    : options.useLegendaryDeck !== false;
  const activeRanks = deps.getActiveRanks();
  const previewPlayerIDs = Array.from({ length: clampedPlayers }, (_, i) => String(i));
  const previewState = createSimulationState(deps, previewPlayerIDs, {
    useMainDeck,
    useLegendaryDeck,
    gameMode: mode ?? undefined,
    gameSetup: options.gameSetup,
  });
  const resolvedMaxTurns = calculateSimulationTurnLimit(previewState, clampedPlayers);
  const aggregate = createEmptySimulationAggregate({
    players: clampedPlayers,
    simulations: clampedSims,
    maxTurns: resolvedMaxTurns,
    useMainDeck,
    useLegendaryDeck,
    gameMode: mode ?? (useLegendaryDeck ? 'standard' : 'simplified'),
    rankOrder: activeRanks.map((rank) => rank.id),
  });

  for (let i = 0; i < clampedSims; i += 1) {
    options.onStatus?.({
      completed: i,
      total: clampedSims,
      currentMatch: i + 1,
      turnsInCurrentMatch: 0,
      maxTurns: resolvedMaxTurns,
    });
    const result = (!mode && useMainDeck && useLegendaryDeck && !options.gameSetup)
      ? simulateSingleMatch(deps, clampedPlayers, resolvedMaxTurns, {
        onStatus: options.onStatus,
        currentMatch: i + 1,
        totalMatches: clampedSims,
      })
      : simulateSingleMatchWithOptions(deps, clampedPlayers, resolvedMaxTurns, {
        useMainDeck,
        useLegendaryDeck,
        gameMode: mode ?? undefined,
        gameSetup: options.gameSetup,
      }, {
        onStatus: options.onStatus,
        currentMatch: i + 1,
        totalMatches: clampedSims,
      });
    recordSimulationResult(aggregate, result);
    options.onProgress?.(i + 1, clampedSims);
  }
  return aggregate;
};

const simulateSingleMatchWithOptions = (
  deps: SimulationDeps,
  numPlayers: number,
  maxTurns: number,
  options: { useMainDeck: boolean; useLegendaryDeck: boolean; gameMode?: GameMode; gameSetup?: Partial<SharedGameSetup> },
  progress?: Pick<SimulationOptions, 'onStatus'> & { currentMatch?: number; totalMatches?: number },
) => {
  const playerIDs = Array.from({ length: numPlayers }, (_, i) => String(i));
  const G = createSimulationState(deps, playerIDs, options);

  return simulateFromPreparedState(deps, G, playerIDs, numPlayers, maxTurns, progress);
};

const simulateFromPreparedState = (
  deps: SimulationDeps,
  G: JojGameState,
  playerIDs: string[],
  numPlayers: number,
  maxTurns: number,
  progress?: Pick<SimulationOptions, 'onStatus'> & { currentMatch?: number; totalMatches?: number },
): {
  winner: string;
  turns: number;
  stalled: boolean;
  deckDepletionTurn: number;
  wonByRank: boolean;
  passes: number;
  reachedRanks: Record<string, string>;
  finalResources: Record<string, Record<ResourceKey, number>>;
} => {
  let currentIdx = 0;
  let turns = 0;
  let deckDepletionTurn = G.deck.length === 0 ? 0 : -1;
  let passes = 0;
  let deadTurnsAfterDeckEmpty = 0;
  const progressEveryTurns = 10;
  const tryPromoteOnce = (pid: string) => deps.promoteRank(G, pid, numPlayers);
  const scoreWinner = () => Object.entries(G.resources)
    .sort(([, a], [, b]) => deps.resourceKeys.reduce((sum, key) => sum + (b[key] - a[key]), 0))
    .at(0)?.[0] ?? '0';

  while (turns < maxTurns) {
    const currentTurn = turns + 1;
    if (
      progress?.onStatus
      && (turns === 0 || currentTurn % progressEveryTurns === 0)
    ) {
      progress.onStatus({
        completed: Math.max(0, (progress.currentMatch ?? 1) - 1),
        total: progress.totalMatches ?? 1,
        currentMatch: progress.currentMatch ?? 1,
        turnsInCurrentMatch: currentTurn,
        maxTurns,
      });
    }
    const playerID = playerIDs[currentIdx];
    const hand = G.hands[playerID];
    let stage: 'play' | 'end' = 'play';
    let progressedThisTurn = false;

    if (G.deck.length > 0) {
      const card = G.deck.pop();
      if (card) {
        progressedThisTurn = true;
        const behavior = getCardPlayBehavior(card);
        if (behavior === 'lyap') {
          if (!isProtectedFromLyapScandal(G, currentTurn, playerID)) {
            const summary = deps.applyCardEffectsSoft(G, playerID, card.effects);
            appendAppliedEffectLog(G, {
              sourceCardId: card.id,
              sourceCardTitle: card.title,
              sourceCategory: 'LYAP',
              sourcePlayerID: playerID,
              targetPlayerID: playerID,
              summary,
              createdAtTurn: currentTurn,
            });
          }
          G.discard.push(card);
          stage = 'end';
        } else if (behavior === 'scandal') {
          playerIDs.forEach((pid) => {
            if (!isProtectedFromLyapScandal(G, currentTurn, pid)) {
              const summary = deps.applyCardEffectsSoft(G, pid, card.effects);
              appendAppliedEffectLog(G, {
                sourceCardId: card.id,
                sourceCardTitle: card.title,
                sourceCategory: 'SCANDAL',
                sourcePlayerID: playerID,
                targetPlayerID: pid,
                summary,
                createdAtTurn: currentTurn,
              });
            }
            deps.syncPlayerState(G, pid);
          });
          deps.triggerSukhpayZsuOnScandal(G, { turn: currentTurn }, playerID);
          G.discard.push(card);
          stage = 'end';
        } else {
          hand.push(card);
          stage = 'play';
        }
      }
      if (G.deck.length === 0 && deckDepletionTurn < 0) deckDepletionTurn = turns + 1;
    }

    if (stage === 'play') {
      let promotedThisTurn = tryPromoteOnce(playerID);
      if (promotedThisTurn) progressedThisTurn = true;
      if (tryPlayLegendaryCards(deps, G, playerID, playerIDs, currentTurn) && !promotedThisTurn) {
        progressedThisTurn = true;
        promotedThisTurn = tryPromoteOnce(playerID);
        if (promotedThisTurn) progressedThisTurn = true;
      }
      let played = false;
      let handActionsRemaining = 1 + Math.max(0, G.extraHandPlayTokens[playerID] ?? 0);
      let handActionsTaken = 0;
      while (handActionsRemaining > 0) {
        const result = tryPlayOneHandCardSim({ deps, G, playerID, playerIDs, currentTurn, numPlayers });
        if (!result.played) break;
        if (!promotedThisTurn) {
          promotedThisTurn = tryPromoteOnce(playerID);
          if (promotedThisTurn) progressedThisTurn = true;
        }
        if (handActionsTaken >= 1) {
          G.extraHandPlayTokens[playerID] = Math.max(0, (G.extraHandPlayTokens[playerID] ?? 0) - 1);
        }
        handActionsTaken += 1;
        handActionsRemaining -= 1;
        played = true;
        progressedThisTurn = true;
      }
      if (!played && G.deck.length === 0 && !deps.hasPlayableCardsByInventory(G, playerID)) passes += 1;
    } else {
      let acted = false;
      let promotedThisTurn = tryPromoteOnce(playerID);
      if (promotedThisTurn) acted = true;
      if (tryPlayLegendaryCards(deps, G, playerID, playerIDs, currentTurn)) {
        acted = true;
        if (!promotedThisTurn) {
          promotedThisTurn = tryPromoteOnce(playerID);
          if (promotedThisTurn) acted = true;
        }
      }
      if (acted) progressedThisTurn = true;

      let handActionsRemaining = Math.max(0, G.extraHandPlayTokens[playerID] ?? 0);
      while (handActionsRemaining > 0) {
        const result = tryPlayOneHandCardSim({ deps, G, playerID, playerIDs, currentTurn, numPlayers });
        if (!result.played) break;
        if (!promotedThisTurn) {
          promotedThisTurn = tryPromoteOnce(playerID);
          if (promotedThisTurn) acted = true;
        }
        G.extraHandPlayTokens[playerID] = Math.max(0, (G.extraHandPlayTokens[playerID] ?? 0) - 1);
        handActionsRemaining -= 1;
        acted = true;
        progressedThisTurn = true;
      }
      if (!acted && G.deck.length === 0 && !deps.hasPlayableCardsByInventory(G, playerID)) passes += 1;
    }

    turns += 1;
    const winner = deps.getWinner(G);
    if (winner) {
      return {
        winner,
        turns,
        stalled: false,
        deckDepletionTurn,
        wonByRank: G.ranks[winner] === deps.getTopRankId(),
        passes,
        reachedRanks: { ...G.ranks },
        finalResources: Object.fromEntries(Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }])) as Record<string, Record<ResourceKey, number>>,
      };
    }

    if (G.deck.length === 0) {
      deadTurnsAfterDeckEmpty = progressedThisTurn ? 0 : deadTurnsAfterDeckEmpty + 1;
      if (deadTurnsAfterDeckEmpty >= playerIDs.length) {
        const fallbackWinner = scoreWinner();
        return {
          winner: fallbackWinner,
          turns,
          stalled: false,
          deckDepletionTurn,
          wonByRank: G.ranks[fallbackWinner] === deps.getTopRankId(),
          passes,
          reachedRanks: { ...G.ranks },
          finalResources: Object.fromEntries(Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }])) as Record<string, Record<ResourceKey, number>>,
        };
      }
    } else {
      deadTurnsAfterDeckEmpty = 0;
    }

    currentIdx = (currentIdx + 1) % playerIDs.length;
  }

  const fallbackWinner = scoreWinner();
  return {
    winner: fallbackWinner,
    turns: maxTurns,
    stalled: true,
    deckDepletionTurn,
    wonByRank: G.ranks[fallbackWinner] === deps.getTopRankId(),
    passes,
    reachedRanks: { ...G.ranks },
    finalResources: Object.fromEntries(Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }])) as Record<string, Record<ResourceKey, number>>,
  };
};
