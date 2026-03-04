import type { CardDefinition, GameMode, JojGameState, ResourceKey } from './types';
import { createSimulationState } from './simulationSetup';

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

export type SimulationOptions = {
  useMainDeck?: boolean;
  useLegendaryDeck?: boolean;
  gameMode?: GameMode;
};

type SimulationDeps = {
  resourceKeys: readonly ResourceKey[];
  shuffle: <T>(items: T[]) => T[];
  cloneCard: (card: CardDefinition) => CardDefinition;
  getSharedDeckTemplate: () => {
    deck: CardDefinition[];
    legendaryDeck: CardDefinition[];
    deckBackImage?: string;
  };
  getActiveRanks: () => Array<{ id: string } & Partial<{ victory: boolean }>>;
  getTopRankId: () => string;
  drawCards: (G: JojGameState, playerID: string, amount: number) => void;
  drawLegendaryCards: (G: JojGameState, playerID: string, amount: number) => void;
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
  getWinner: (G: JojGameState) => string | undefined;
  startingHandSize: number;
  startingLegendaryHandSize: number;
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
        if (!deps.grantSpecificRankIgnoringRequirements(G, playerID, 'senior_lieutenant', playerIDs.length).ok) {
          playable = false;
        }
      } else if (card.id === 'legendary-10') {
        const target = chooseLyapTarget(deps, G, playerID);
        if (!target || !deps.demoteByOneRankWithSeatCheck(G, target, playerIDs.length).ok) {
          playable = false;
        }
      }

      if (!playable) continue;
      try {
        if (!deps.applyCardEffects(G, playerID, card.effects, [])) continue;
      } catch {
        continue;
      }

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
    } else if (card.category === 'DECISION') {
      const replacement = deps.planReplacementResources(G.resources[playerID], card.effects);
      if (replacement === null) continue;
      try {
        const ok = deps.applyCardEffects(G, playerID, card.effects, replacement);
        if (!ok) continue;
      } catch {
        continue;
      }
      deps.syncPlayerState(G, playerID);
      allPlayerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
        deps.applyCardEffectsSoft(G, pid, card.effects);
        deps.syncPlayerState(G, pid);
      });
    } else if (card.category === 'VVNZ' && card.grantRank) {
      const promoted = deps.promoteToSpecificRank(G, playerID, card.grantRank, numPlayers);
      if (!promoted.ok) continue;
      try {
        const ok = deps.applyCardEffects(G, playerID, card.effects, []);
        if (!ok) continue;
      } catch {
        continue;
      }
      deps.syncPlayerState(G, playerID);
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
  const playerIDs = Array.from({ length: numPlayers }, (_, i) => String(i));
  const sharedDeckTemplate = deps.getSharedDeckTemplate();
  const G: JojGameState = {
    gameMode: 'standard',
    deck: deps.shuffle(sharedDeckTemplate.deck.map(deps.cloneCard)),
    discard: [],
    legendaryDeck: deps.shuffle(sharedDeckTemplate.legendaryDeck.map(deps.cloneCard)),
    legendaryDiscard: [],
    legendaryDraftCompleted: {},
    deckBackImage: sharedDeckTemplate.deckBackImage,
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
    gameStats: {
      turnsCompleted: 0,
      resourcesGainedTotal: 0,
      resourcesLostTotal: 0,
      resourcesGainedByType: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
      resourcesLostByType: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
      lyapsPlayedOnOthers: 0,
      scandalsPlayedOnOthers: 0,
    },
    noPlayablePassStreak: 0,
    endGameVote: {
      active: false,
      requestedBy: null,
      votes: {},
    },
  };

  playerIDs.forEach((pid, index) => {
    G.hands[pid] = [];
    G.legendaryHands[pid] = [];
    G.ranks[pid] = deps.getActiveRanks()[0]?.id ?? 'cadet';
    G.resources[pid] = { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 };
    G.players[pid] = { hand: G.hands[pid], rankId: G.ranks[pid], resources: G.resources[pid] };
    G.playerNames[pid] = `P${index + 1}`;
    G.promotedThisTurn[pid] = false;
    G.lyapScandalShieldUntilTurn[pid] = 0;
    G.extraHandPlayTokens[pid] = 0;
    G.sukhpayZsuWatchUntilTurn[pid] = 0;
    G.sukhpayZsuPendingBonus[pid] = false;
    G.legendaryDraftCompleted[pid] = true;
    deps.drawCards(G, pid, deps.startingHandSize);
    deps.drawLegendaryCards(G, pid, deps.startingLegendaryHandSize);
    deps.syncPlayerState(G, pid);
  });

  let currentIdx = 0;
  let turns = 0;
  let deckDepletionTurn = -1;
  let passes = 0;
  let deadTurnsAfterDeckEmpty = 0;
  const tryPromoteOnce = (pid: string) => deps.promoteRank(G, pid, numPlayers);
  const scoreWinner = () => Object.entries(G.resources)
    .sort(([, a], [, b]) => deps.resourceKeys.reduce((sum, key) => sum + (b[key] - a[key]), 0))
    .at(0)?.[0] ?? '0';

  while (turns < maxTurns) {
    const currentTurn = turns + 1;
    const playerID = playerIDs[currentIdx];
    const hand = G.hands[playerID];
    let stage: 'play' | 'end' = 'play';
    let progressedThisTurn = false;

    if (G.deck.length > 0) {
      const card = G.deck.pop();
      if (card) {
        progressedThisTurn = true;
        if (card.category === 'LYAP') {
          if (!isProtectedFromLyapScandal(G, currentTurn, playerID)) {
            deps.applyCardEffectsSoft(G, playerID, card.effects);
          }
          G.discard.push(card);
          stage = 'end';
        } else if (card.category === 'SCANDAL') {
          playerIDs.forEach((pid) => {
            if (!isProtectedFromLyapScandal(G, currentTurn, pid)) {
              deps.applyCardEffectsSoft(G, pid, card.effects);
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
      if (G.deck.length === 0 && deckDepletionTurn < 0) {
        deckDepletionTurn = turns + 1;
      }
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
        if (result.played) {
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
          continue;
        }
        break;
      }

      if (!played) {
        passes += 1;
      }
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

      // In END stage, only extra-token hand plays are allowed.
      let handActionsRemaining = Math.max(0, G.extraHandPlayTokens[playerID] ?? 0);
      while (handActionsRemaining > 0) {
        const result = tryPlayOneHandCardSim({ deps, G, playerID, playerIDs, currentTurn, numPlayers });
        if (result.played) {
          if (!promotedThisTurn) {
            promotedThisTurn = tryPromoteOnce(playerID);
            if (promotedThisTurn) acted = true;
          }
          // Every END-stage hand play is extra-token based.
          G.extraHandPlayTokens[playerID] = Math.max(0, (G.extraHandPlayTokens[playerID] ?? 0) - 1);
          handActionsRemaining -= 1;
          acted = true;
          progressedThisTurn = true;
          continue;
        }
        break;
      }

      if (!acted) passes += 1;
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
        finalResources: Object.fromEntries(
          Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }]),
        ) as Record<string, Record<ResourceKey, number>>,
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
          finalResources: Object.fromEntries(
            Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }]),
          ) as Record<string, Record<ResourceKey, number>>,
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
    finalResources: Object.fromEntries(
      Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }]),
    ) as Record<string, Record<ResourceKey, number>>,
  };
};

export const runGameSimulationsWithDeps = (
  deps: SimulationDeps,
  players: number,
  simulations: number,
  maxTurns = 600,
  options: SimulationOptions = {},
): SimulationReport => {
  const clampedPlayers = Math.max(2, Math.min(6, Math.floor(players || 2)));
  const clampedSims = Math.max(1, Math.min(5000, Math.floor(simulations || 1)));
  const clampedMaxTurns = Math.max(20, Math.min(4000, Math.floor(maxTurns || 600)));
  const mode: GameMode | null = options.gameMode ?? null;
  const useMainDeck = mode ? true : options.useMainDeck !== false;
  const useLegendaryDeck = mode
    ? mode !== 'simplified'
    : options.useLegendaryDeck !== false;
  const wins: Record<string, number> = {};
  const rankReached: Record<string, number> = {};
  let totalTurns = 0;
  let stalled = 0;
  let rankWins = 0;
  let scoreWins = 0;
  let passesTotal = 0;
  let deckDepletionTotal = 0;
  let deckDepletionKnown = 0;
  const highestRankReachedByGame: Record<string, number> = {};
  let lastGame: SimulationReport['lastGame'] = {
    winnerPlayerID: '0',
    winnerRankId: deps.getActiveRanks()[0]?.id ?? 'cadet',
    winnerResources: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
    turns: 0,
  };

  for (let i = 0; i < clampedSims; i += 1) {
    const result = (!mode && useMainDeck && useLegendaryDeck)
      ? simulateSingleMatch(deps, clampedPlayers, clampedMaxTurns)
      : simulateSingleMatchWithOptions(deps, clampedPlayers, clampedMaxTurns, {
        useMainDeck,
        useLegendaryDeck,
        gameMode: mode ?? undefined,
      });
    wins[result.winner] = (wins[result.winner] ?? 0) + 1;
    totalTurns += result.turns;
    passesTotal += result.passes;
    if (result.stalled) stalled += 1;
    if (result.wonByRank) rankWins += 1;
    else scoreWins += 1;
    if (result.deckDepletionTurn >= 0) {
      deckDepletionTotal += result.deckDepletionTurn;
      deckDepletionKnown += 1;
    }
    Object.values(result.reachedRanks).forEach((rankId) => {
      rankReached[rankId] = (rankReached[rankId] ?? 0) + 1;
    });
    const activeRanks = deps.getActiveRanks();
    const highest = Object.values(result.reachedRanks)
      .map((rankId) => ({ rankId, idx: activeRanks.findIndex((r) => r.id === rankId) }))
      .sort((a, b) => b.idx - a.idx)[0];
    if (highest?.rankId) {
      highestRankReachedByGame[highest.rankId] = (highestRankReachedByGame[highest.rankId] ?? 0) + 1;
    }
    lastGame = {
      winnerPlayerID: result.winner,
      winnerRankId: result.reachedRanks[result.winner] ?? (deps.getActiveRanks()[0]?.id ?? 'cadet'),
      winnerResources: { ...result.finalResources[result.winner] },
      turns: result.turns,
    };
  }

  const activeRanks = deps.getActiveRanks();
  const topReachedRanks = Object.entries(highestRankReachedByGame)
    .map(([rankId, games]) => ({
      rankId,
      games,
      pct: Number(((games / clampedSims) * 100).toFixed(2)),
      idx: activeRanks.findIndex((r) => r.id === rankId),
    }))
    .sort((a, b) => b.idx - a.idx || b.games - a.games)
    .slice(0, 3)
    .map(({ rankId, games, pct }) => ({ rankId, games, pct }));
  const topReachedRanksByPct = Object.entries(highestRankReachedByGame)
    .map(([rankId, games]) => ({
      rankId,
      games,
      pct: Number(((games / clampedSims) * 100).toFixed(2)),
      idx: activeRanks.findIndex((r) => r.id === rankId),
    }))
    .sort((a, b) => b.games - a.games || b.pct - a.pct || b.idx - a.idx)
    .slice(0, 3)
    .map(({ rankId, games, pct }) => ({ rankId, games, pct }));

  const seatWinRates = Array.from({ length: clampedPlayers }, (_, i) => String(i)).map((playerID) => {
    const seatWins = wins[playerID] ?? 0;
    return {
      playerID,
      wins: seatWins,
      winRatePct: Number(((seatWins / clampedSims) * 100).toFixed(2)),
    };
  });

  const issues: string[] = [];
  if (stalled > 0) {
    issues.push(
      `Виявлено ${stalled} зациклених/довгих матчів із ${clampedSims} (ліміт ${clampedMaxTurns} ходів).`,
    );
  }
  const bestSeat = [...seatWinRates].sort((a, b) => b.winRatePct - a.winRatePct)[0];
  const worstSeat = [...seatWinRates].sort((a, b) => a.winRatePct - b.winRatePct)[0];
  if (bestSeat && worstSeat && bestSeat.winRatePct - worstSeat.winRatePct >= 12) {
    issues.push(
      `Можлива перевага порядку ходу: seat ${bestSeat.playerID} (${bestSeat.winRatePct}%) vs seat ${worstSeat.playerID} (${worstSeat.winRatePct}%).`,
    );
  }
  if (rankWins === 0) {
    issues.push('У симуляціях не зафіксовано перемог через звання Генерала (можливо завеликі вимоги або замалий темп ресурсів).');
  }

  return {
    input: {
      players: clampedPlayers,
      simulations: clampedSims,
      maxTurns: clampedMaxTurns,
      useMainDeck,
      useLegendaryDeck,
      gameMode: mode ?? (useLegendaryDeck ? 'standard' : 'simplified'),
    },
    generatedAt: new Date().toISOString(),
    summary: {
      finished: clampedSims - stalled,
      stalled,
      avgTurns: Number((totalTurns / clampedSims).toFixed(2)),
      avgDeckDepletionTurn: Number(
        (deckDepletionKnown > 0 ? deckDepletionTotal / deckDepletionKnown : 0).toFixed(2),
      ),
      rankWins,
      scoreWins,
      avgPassesPerGame: Number((passesTotal / clampedSims).toFixed(2)),
    },
    seatWinRates,
    rankReached,
    topReachedRanks,
    topReachedRanksByPct,
    lastGame,
    issues,
  };
};

const simulateSingleMatchWithOptions = (
  deps: SimulationDeps,
  numPlayers: number,
  maxTurns: number,
  options: { useMainDeck: boolean; useLegendaryDeck: boolean; gameMode?: GameMode },
) => {
  const playerIDs = Array.from({ length: numPlayers }, (_, i) => String(i));
  const G = createSimulationState(deps, playerIDs, options);

  return simulateFromPreparedState(deps, G, playerIDs, numPlayers, maxTurns);
};

const simulateFromPreparedState = (
  deps: SimulationDeps,
  G: JojGameState,
  playerIDs: string[],
  numPlayers: number,
  maxTurns: number,
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
  const tryPromoteOnce = (pid: string) => deps.promoteRank(G, pid, numPlayers);
  const scoreWinner = () => Object.entries(G.resources)
    .sort(([, a], [, b]) => deps.resourceKeys.reduce((sum, key) => sum + (b[key] - a[key]), 0))
    .at(0)?.[0] ?? '0';

  while (turns < maxTurns) {
    const currentTurn = turns + 1;
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
      if (!played) passes += 1;
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
      if (!acted) passes += 1;
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
