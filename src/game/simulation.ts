import type { CardDefinition, GameMode, JojGameState, ResourceKey } from './types';
import { isCommandCategory } from './cardRules';
import { withGameStateTransaction } from './gameStateUtils';
import { calculateSimulationTurnLimit, createSimulationState } from './simulationSetup';
import type { SharedGameSetup } from './sharedConfig';

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

const chooseLyapTarget = (
  deps: Pick<SimulationDeps, 'getActiveRanks' | 'resourceKeys'>,
  G: JojGameState,
  sourcePlayerID: string,
): string | null => {
  const activeRanks = deps.getActiveRanks();
  const rankIndex = (playerID: string) => activeRanks.findIndex((r) => r.id === G.ranks[playerID]);
  const score = (playerID: string) =>
    deps.resourceKeys.reduce((sum, key) => sum + (G.resources[playerID][key] ?? 0), 0) + rankIndex(playerID) * 2;
  const candidates = Object.keys(G.players).filter((pid) => pid !== sourcePlayerID);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
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

const tryPlayLegendaryCards = (
  deps: SimulationDeps,
  G: JojGameState,
  playerID: string,
  playerIDs: string[],
  currentTurn: number,
): boolean => {
  const hand = G.legendaryHands[playerID] ?? [];
  let playedAny = false;
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (let i = 0; i < hand.length; i += 1) {
      const card = hand[i];
      const played = runSimulationTransaction(G, () => {
        let playable = true;

        if (card.id === 'legendary-02') {
          deps.cancelLastLyapOrScandalForPlayer(G, playerID);
        } else if (card.id === 'legendary-08') {
          deps.cancelLastScandalForPlayer(G, playerID);
        } else if (card.id === 'legendary-05') {
          G.sukhpayZsuWatchUntilTurn[playerID] = currentTurn + playerIDs.length;
          G.sukhpayZsuPendingBonus[playerID] = true;
        } else if (card.id === 'legendary-12') {
          G.lyapScandalShieldUntilTurn[playerID] = currentTurn + playerIDs.length;
        } else if (card.id === 'legendary-03') {
          G.extraHandPlayTokens[playerID] = (G.extraHandPlayTokens[playerID] ?? 0) + 1;
        } else if (card.id === 'legendary-06') {
          const selected = chooseLowestResource(deps, G.resources[playerID]);
          G.resources[playerID][selected] = (G.resources[playerID][selected] ?? 0) + 3;
          playerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
            G.resources[pid].documents = (G.resources[pid].documents ?? 0) + 1;
            deps.clampNonNegativeResources(G.resources[pid]);
            deps.syncPlayerState(G, pid);
          });
          deps.clampNonNegativeResources(G.resources[playerID]);
        } else if (card.id === 'legendary-07') {
          G.resources[playerID].time = (G.resources[playerID].time ?? 0) + 2;
          G.resources[playerID].reputation = (G.resources[playerID].reputation ?? 0) + 2;
          playerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
            G.resources[pid].reputation = Math.max(0, (G.resources[pid].reputation ?? 0) - 1);
            deps.clampNonNegativeResources(G.resources[pid]);
            deps.syncPlayerState(G, pid);
          });
          deps.clampNonNegativeResources(G.resources[playerID]);
        } else if (card.id === 'legendary-09') {
          const selected = chooseLowestResource(deps, G.resources[playerID]);
          G.resources[playerID][selected] = Math.max(G.resources[playerID][selected] ?? 0, 3);
        } else if (card.id === 'legendary-13') {
          playable = deps.grantSpecificRankIgnoringRequirements(G, playerID, 'senior_lieutenant', playerIDs.length).ok;
        } else if (card.id === 'legendary-10') {
          const target = chooseLyapTarget(deps, G, playerID);
          playable = Boolean(target && deps.demoteByOneRankWithSeatCheck(G, target, playerIDs.length).ok);
        }

        if (!playable) return false;
        return deps.applyCardEffects(G, playerID, card.effects, []);
      });
      if (!played) continue;

      hand.splice(i, 1);
      G.legendaryDiscard.push(card);
      deps.syncPlayerState(G, playerID);
      playedAny = true;
      progressed = true;
      break;
    }
  }

  return playedAny;
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

  for (let i = 0; i < hand.length; i += 1) {
    const card = hand[i];
    const allPlayerIDs = playerIDs;

    if (card.category === 'LYAP') {
      const target = chooseLyapTarget(deps, G, playerID);
      if (!target) continue;
      if (!isProtectedFromLyapScandal(G, currentTurn, target)) {
        deps.applyCardEffectsSoft(G, target, card.effects);
      }
      deps.syncPlayerState(G, target);
    } else if (card.category === 'SCANDAL') {
      allPlayerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
        if (!isProtectedFromLyapScandal(G, currentTurn, pid)) {
          deps.applyCardEffectsSoft(G, pid, card.effects);
        }
        deps.syncPlayerState(G, pid);
      });
      deps.triggerSukhpayZsuOnScandal(G, { turn: currentTurn }, playerID);
    } else if (isCommandCategory(card)) {
      const played = runSimulationTransaction(G, () => {
        const replacement = deps.planReplacementResources(G.resources[playerID], card.effects);
        if (replacement === null) return false;
        if (!deps.applyCardEffects(G, playerID, card.effects, replacement)) return false;
        deps.syncPlayerState(G, playerID);
        allPlayerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
          deps.applyCardEffectsSoft(G, pid, card.effects);
          deps.syncPlayerState(G, pid);
        });
        return true;
      });
      if (!played) continue;
    } else if (card.category === 'VVNZ' && card.grantRank) {
      const played = runSimulationTransaction(G, () => {
        const targetRankId = card.grantRank;
        if (!targetRankId) return false;
        const promoted = deps.promoteToSpecificRank(G, playerID, targetRankId, numPlayers);
        if (!promoted.ok) return false;
        const ok = deps.applyCardEffects(G, playerID, card.effects, []);
        if (!ok) return false;
        deps.syncPlayerState(G, playerID);
        return true;
      });
      if (!played) continue;
    } else {
      const replacement = deps.planReplacementResources(G.resources[playerID], card.effects);
      if (replacement === null) continue;
      try {
        const ok = deps.applyCardEffects(G, playerID, card.effects, replacement);
        if (!ok) continue;
      } catch {
        continue;
      }
    }

    hand.splice(i, 1);
    G.discard.push(card);
    deps.syncPlayerState(G, playerID);
    return { played: true, promotedByPlay: false };
  }

  return { played: false, promotedByPlay: false };
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
        if (card.category === 'LYAP') {
          if (!isProtectedFromLyapScandal(G, currentTurn, playerID)) deps.applyCardEffectsSoft(G, playerID, card.effects);
          G.discard.push(card);
          stage = 'end';
        } else if (card.category === 'SCANDAL') {
          playerIDs.forEach((pid) => {
            if (!isProtectedFromLyapScandal(G, currentTurn, pid)) deps.applyCardEffectsSoft(G, pid, card.effects);
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
