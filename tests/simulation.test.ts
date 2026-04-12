import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSimulationHandPlan, executeSimulationLegendaryPlan, runGameSimulationsWithDeps } from '../src/game/simulation';
import { calculateSimulationTurnLimit } from '../src/game/simulationSetup';
import type { SimulationDeps } from '../src/game/simulation';
import { playCardHandler, playLegendaryCardHandler, promoteHandler } from '../src/game/moveHandlers';
import type { JojMovesDeps, MoveArgs } from '../src/game/moveTypes';
import type { CardDefinition, JojGameState, ResourceKey } from '../src/game/types';

const resourceKeys: readonly ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

const cloneCard = (card: CardDefinition) => ({ ...card, effects: card.effects ? [...card.effects] : undefined });

const createBaseDeps = (overrides: Partial<SimulationDeps> = {}): SimulationDeps => ({
  resourceKeys,
  shuffle: <T>(items: T[]) => [...items],
  cloneCard,
  getSharedDeckTemplate: () => ({ deck: [], legendaryDeck: [] }),
  getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier', victory: true }],
  getTopRankId: () => 'soldier',
  drawCards: () => {},
  drawLegendaryCards: () => {},
  syncPlayerState: () => {},
  promoteRank: () => false,
  promoteToSpecificRank: () => ({ ok: false }),
  grantSpecificRankIgnoringRequirements: () => ({ ok: false }),
  demoteByOneRankWithSeatCheck: () => ({ ok: false }),
  triggerSukhpayZsuOnScandal: () => {},
  cancelLastLyapOrScandalForPlayer: () => ({ canceledCard: null }),
  cancelLastScandalForPlayer: () => ({ canceledCard: null }),
  applyCardEffects: () => true,
  applyCardEffectsSoft: () => ({ resources: {}, rank: 0 }),
  clampNonNegativeResources: () => {},
  planReplacementResources: () => [],
  hasPlayableCardsByInventory: () => false,
  getWinner: () => undefined,
  startingHandSize: 0,
  startingLegendaryHandSize: 0,
  ...overrides,
});

test('simulation ends by score after no-progress round when deck is empty', () => {
  const report = runGameSimulationsWithDeps(createBaseDeps({
    getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier' }],
    getWinner: (_G: JojGameState) => undefined,
  }), 2, 1, 600);

  assert.equal(report.summary.stalled, 0);
  assert.ok(report.summary.avgTurns <= 3, `expected quick finish, got ${report.summary.avgTurns}`);
  assert.equal(report.summary.scoreWins, 1);
});

test('simulation report stores deck mode flags', () => {
  const deps = createBaseDeps({
    getSharedDeckTemplate: () => ({
      deck: [{ id: 'support-x', title: 'S', category: 'SUPPORT', effects: [{ resource: 'time', value: 1 }] } as CardDefinition],
      legendaryDeck: [{ id: 'legendary-03', title: 'L', category: 'LEGENDARY', effects: [] }],
      rankTrack: [],
      modules: [],
      gameSetup: {
        optionalMainDeckModuleIds: [],
        legendaryDeckMode: 'separate',
      },
    }),
    drawCards: (G: JojGameState, pid: string, amount: number) => { for (let i = 0; i < amount && G.deck.length; i += 1) G.hands[pid].push(G.deck.pop() as CardDefinition); },
    drawLegendaryCards: (G: JojGameState, pid: string, amount: number) => { for (let i = 0; i < amount && G.legendaryDeck.length; i += 1) G.legendaryHands[pid].push(G.legendaryDeck.pop() as CardDefinition); },
    syncPlayerState: (G: JojGameState, pid: string) => { G.players[pid].hand = G.hands[pid]; G.players[pid].rankId = G.ranks[pid]; G.players[pid].resources = G.resources[pid]; },
    startingHandSize: 1,
    startingLegendaryHandSize: 1,
  });

  const mainOnly = runGameSimulationsWithDeps(deps, 2, 1, 40, { useMainDeck: true, useLegendaryDeck: false });
  assert.equal(mainOnly.input.useMainDeck, true);
  assert.equal(mainOnly.input.useLegendaryDeck, false);
  assert.equal(mainOnly.input.gameMode, 'simplified');

  const bothOff = runGameSimulationsWithDeps(deps, 2, 1, 40, { useMainDeck: false, useLegendaryDeck: false });
  assert.equal(bothOff.input.useMainDeck, false);
  assert.equal(bothOff.input.useLegendaryDeck, false);
  assert.equal(bothOff.input.gameMode, 'simplified');
  assert.equal(bothOff.summary.stalled, 0);

  const standardPlus = runGameSimulationsWithDeps(deps, 2, 1, 40, { gameMode: 'standard_plus' });
  assert.equal(standardPlus.input.gameMode, 'standard_plus');
  assert.equal(standardPlus.input.useMainDeck, true);
  assert.equal(standardPlus.input.useLegendaryDeck, true);
});

test('simulation forces simplified mode when legendary deck mode is merged', () => {
  const deps = createBaseDeps({
    getSharedDeckTemplate: () => ({
      deck: [{ id: 'support-x', title: 'S', category: 'SUPPORT', effects: [{ resource: 'time', value: 1 }] } as CardDefinition],
      legendaryDeck: [{ id: 'legendary-03', title: 'L', category: 'LEGENDARY', effects: [] }],
      rankTrack: [],
      modules: [],
      gameSetup: {
        optionalMainDeckModuleIds: [],
        legendaryDeckMode: 'merged',
      },
    }),
  });

  const report = runGameSimulationsWithDeps(deps, 2, 1, 40, {
    gameMode: 'standard_plus',
    gameSetup: { legendaryDeckMode: 'merged' },
  });

  assert.equal(report.input.gameMode, 'simplified');
  assert.equal(report.input.useMainDeck, true);
  assert.equal(report.input.useLegendaryDeck, false);
});

test('simulation reports seat bias issue when win rates diverge strongly', () => {
  const deps = createBaseDeps({
    getWinner: (G: JojGameState) => Object.keys(G.players)[0],
  });

  const report = runGameSimulationsWithDeps(deps, 2, 10, 40);

  assert.ok(report.issues.some((line) => line.includes('перевага порядку ходу')));
});

test('simulation reports missing rank wins when nobody can reach top rank', () => {
  const deps = createBaseDeps({
    getWinner: (G: JojGameState) => Object.keys(G.players)[0],
  });

  const report = runGameSimulationsWithDeps(deps, 2, 3, 40);

  assert.equal(report.summary.rankWins, 0);
  assert.ok(report.issues.some((line) => line.includes('не зафіксовано перемог')));
});

test('simulation tracks average passes when no hand plays happen', () => {
  const deps = createBaseDeps();

  const report = runGameSimulationsWithDeps(deps, 2, 1, 40);

  assert.ok(report.summary.avgPassesPerGame >= 1);
});

test('calculateSimulationTurnLimit uses round-based cap plus 13 rounds', () => {
  const G = {
    deck: Array.from({ length: 100 }, (_, i) => ({ id: `d${i}` })),
    legendaryDeck: Array.from({ length: 15 }, (_, i) => ({ id: `l${i}` })),
    hands: {
      '0': [{ id: 'h0' }, { id: 'h1' }],
      '1': [{ id: 'h2' }, { id: 'h3' }],
      '2': [{ id: 'h4' }, { id: 'h5' }],
      '3': [{ id: 'h6' }, { id: 'h7' }],
      '4': [{ id: 'h8' }, { id: 'h9' }],
      '5': [{ id: 'h10' }, { id: 'h11' }],
    },
    legendaryHands: {},
    discard: [],
    legendaryDiscard: [],
  } as unknown as JojGameState;

  const totalCards = 127;
  const expectedRounds = Math.ceil(totalCards / 6) + 13;
  assert.equal(calculateSimulationTurnLimit(G, 6), expectedRounds * 6);
});

const makeParityState = (): JojGameState => ({
  gameMode: 'standard',
  deck: [],
  discard: [],
  legendaryDeck: [],
  legendaryDiscard: [],
  legendaryDraftCompleted: { '0': true, '1': true },
  systemMessageSeq: 0,
  playerNames: { '0': 'P1', '1': 'P2' },
  chat: [],
  players: {
    '0': { hand: [], rankId: 'recruit', resources: { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 } },
    '1': { hand: [], rankId: 'recruit', resources: { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 } },
  },
  hands: { '0': [], '1': [] },
  legendaryHands: { '0': [], '1': [] },
  ranks: { '0': 'recruit', '1': 'recruit' },
  rankImageByPlayer: {},
  resources: {
    '0': { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
    '1': { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
  },
  promotedThisTurn: { '0': false, '1': false },
  lyapScandalShieldUntilTurn: { '0': 0, '1': 0 },
  extraHandPlayTokens: { '0': 0, '1': 0 },
  sukhpayZsuWatchUntilTurn: { '0': 0, '1': 0 },
  sukhpayZsuPendingBonus: { '0': false, '1': false },
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
  endGameVote: { active: false, requestedBy: null, votes: {} },
  pendingDrawAutoResolution: null,
});

const syncParityPlayerState = (G: JojGameState, playerID: string) => {
  G.players[playerID].resources = { ...G.resources[playerID] };
  G.players[playerID].rankId = G.ranks[playerID];
  G.players[playerID].hand = G.hands[playerID];
};

const applyParityEffects = (
  G: JojGameState,
  playerID: string,
  effects: CardDefinition['effects'],
) => {
  const summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } = { resources: {}, rank: 0 };
  for (const effect of effects ?? []) {
    if (effect.resource === 'rank') {
      summary.rank += effect.value;
      continue;
    }
    G.resources[playerID][effect.resource] = (G.resources[playerID][effect.resource] ?? 0) + effect.value;
    summary.resources[effect.resource] = (summary.resources[effect.resource] ?? 0) + effect.value;
  }
  syncParityPlayerState(G, playerID);
  return summary;
};

const createParitySimulationDeps = (): SimulationDeps => ({
  ...createBaseDeps(),
  syncPlayerState: syncParityPlayerState,
  applyCardEffects: (G, playerID, effects) => {
    applyParityEffects(G, playerID, effects);
    return true;
  },
  applyCardEffectsSoft: (G, playerID, effects) => applyParityEffects(G, playerID, effects),
  promoteToSpecificRank: (G, playerID, rankId) => {
    G.ranks[playerID] = rankId;
    syncParityPlayerState(G, playerID);
    return { ok: true, rank: { cost: {}, bonus: {} } };
  },
  grantSpecificRankIgnoringRequirements: () => ({ ok: false }),
  demoteByOneRankWithSeatCheck: () => ({ ok: false }),
});

const createParityMoveDeps = (): JojMovesDeps => {
  const simDeps = createParitySimulationDeps();
  return {
    INVALID_MOVE: 'INVALID_MOVE',
    DRAW_STAGE: 'draw',
    PLAY_STAGE: 'play',
    END_STAGE: 'end',
    HAND_LIMIT: 8,
    resourceKeys,
    resourceLabelsUk: { time: 'Час', reputation: 'Авторитет', discipline: 'Дисципліна', documents: 'Документи', tech: 'Технології' },
    canPlayHandCardAtStage: () => true,
    appendChat: () => undefined,
    nextSystemMessageSeq: () => 1,
    getPlayerLabel: (_G, playerID) => playerID,
    syncPlayerState: simDeps.syncPlayerState,
    isProtectedFromLyapScandal: () => false,
    triggerSukhpayZsuOnScandal: () => undefined,
    applyCardEffects: simDeps.applyCardEffects,
    applyCardEffectsSoft: simDeps.applyCardEffectsSoft,
    getReplacementUnitsForCard: () => 0,
    summarizeAppliedDiff: (_G, _playerID, effects) => {
      const summary = { resources: {} as Partial<Record<ResourceKey, number>>, rank: 0 };
      for (const effect of effects ?? []) {
        if (effect.resource === 'rank') summary.rank += effect.value;
        else summary.resources[effect.resource] = (summary.resources[effect.resource] ?? 0) + effect.value;
      }
      return summary;
    },
    effectSummaryToText: () => 'ok',
    resourceDeltaToText: () => 'ok',
    categoryLabelUk: (category) => category,
    cardFlavorSnippet: () => '',
    rankNameById: (rankId) => rankId,
    buildLyapSystemMessage: () => '',
    buildScandalSystemMessage: () => '',
    buildSupportSystemMessage: () => '',
    buildPlayedLyapSystemMessage: () => '',
    buildPlayedScandalSystemMessage: () => '',
    buildPlayedDecisionSystemMessage: () => '',
    buildVvnzRankSystemMessage: () => '',
    buildPromotionSystemMessage: () => '',
    buildLegendaryPlayedMessageText: () => '',
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
      goodPressOfficerGranted: () => '',
      goodPressOfficerNoChange: () => '',
      droidDemote: () => '',
    },
    clampNonNegativeResources: () => undefined,
    snapshotResourcesForStats: (G) => ({ '0': { ...G.resources['0'] }, '1': { ...G.resources['1'] } }),
    recordResourceFlowStats: () => undefined,
    resetNoPlayablePassStreak: () => undefined,
    shouldCountNoPlayablePass: () => false,
    hasPlayableCardsByInventory: () => true,
    incrementNoPlayablePassStreak: () => undefined,
    incrementTurnsCompleted: () => undefined,
    incrementLyapPlayedOnOthers: () => undefined,
    incrementScandalPlayedOnOthers: () => undefined,
    resetEndGameVote: () => undefined,
    computeShieldUntilNextOwnTurn: () => 0,
    cancelLastLyapOrScandalForPlayer: () => ({ canceledCard: null, summary: { resources: {}, rank: 0 } }),
    cancelLastScandalForPlayer: () => ({ canceledCard: null, summary: { resources: {}, rank: 0 } }),
    promoteToSpecificRank: simDeps.promoteToSpecificRank,
    grantSpecificRankIgnoringRequirements: (G, playerID, rankId, playerCount) => {
      const result = simDeps.grantSpecificRankIgnoringRequirements(G, playerID, rankId, playerCount);
      return result.ok ? { ok: true, applied: Boolean(result.applied), rank: { bonus: {} } } : { ok: false, reason: 'blocked' };
    },
    demoteByOneRankWithSeatCheck: () => ({ ok: false, reason: 'blocked' }),
    promoteRank: () => false,
    getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier' }, { id: 'senior_lieutenant' }],
  };
};

const makePlayArgs = (G: JojGameState): MoveArgs => ({
  G,
  ctx: { currentPlayer: '0', activePlayers: { '0': 'play' }, turn: 1, numPlayers: 2 },
  playerID: '0',
  events: { setStage: () => undefined },
});

const comparableState = (G: JojGameState) => ({
  resources: G.resources,
  ranks: G.ranks,
  hands: G.hands,
  legendaryHands: G.legendaryHands,
  discard: G.discard.map((card) => card.id),
  legendaryDiscard: G.legendaryDiscard.map((card) => card.id),
  players: G.players,
  extraHandPlayTokens: G.extraHandPlayTokens,
  skippedTurnCounts: G.skippedTurnCounts,
});

test('simulation hand SUPPORT execution stays in parity with live handler', () => {
  const live = makeParityState();
  const sim = makeParityState();
  const card: CardDefinition = {
    id: 'support-parity',
    title: 'Support',
    category: 'SUPPORT',
    effects: [{ resource: 'time', value: 2 }],
  };
  live.hands['0'] = [card];
  sim.hands['0'] = [cloneCard(card)];
  syncParityPlayerState(live, '0');
  syncParityPlayerState(sim, '0');

  const liveResult = playCardHandler(createParityMoveDeps(), makePlayArgs(live), card.id, []);
  const simResult = executeSimulationHandPlan({
    deps: createParitySimulationDeps(),
    G: sim,
    plan: { kind: 'play-card', cardId: card.id, score: 0, replacementResources: [] },
    playerID: '0',
    playerIDs: ['0', '1'],
    currentTurn: 1,
    numPlayers: 2,
  });

  assert.equal(liveResult, undefined);
  assert.equal(simResult, true);
  assert.deepEqual(comparableState(sim), comparableState(live));
});

test('simulation hand VVNZ execution stays in parity with live handler', () => {
  const live = makeParityState();
  const sim = makeParityState();
  const card: CardDefinition = {
    id: 'vvnz-parity',
    title: 'VVNZ',
    category: 'VVNZ',
    grantRank: 'soldier',
    effects: [{ resource: 'reputation', value: 1 }],
  };
  live.hands['0'] = [card];
  sim.hands['0'] = [cloneCard(card)];
  syncParityPlayerState(live, '0');
  syncParityPlayerState(sim, '0');

  const liveResult = playCardHandler(createParityMoveDeps(), makePlayArgs(live), card.id, []);
  const simResult = executeSimulationHandPlan({
    deps: createParitySimulationDeps(),
    G: sim,
    plan: { kind: 'play-card', cardId: card.id, score: 0 },
    playerID: '0',
    playerIDs: ['0', '1'],
    currentTurn: 1,
    numPlayers: 2,
  });

  assert.equal(liveResult, undefined);
  assert.equal(simResult, true);
  assert.deepEqual(comparableState(sim), comparableState(live));
});

test('simulation legendary execution stays in parity with live handler', () => {
  const live = makeParityState();
  const sim = makeParityState();
  const card: CardDefinition = {
    id: 'legendary-03',
    title: 'Legendary',
    category: 'LEGENDARY',
    effects: [],
  };
  live.legendaryHands['0'] = [card];
  sim.legendaryHands['0'] = [cloneCard(card)];
  syncParityPlayerState(live, '0');
  syncParityPlayerState(sim, '0');

  const liveResult = playLegendaryCardHandler(createParityMoveDeps(), makePlayArgs(live), card.id);
  const simResult = executeSimulationLegendaryPlan({
    deps: createParitySimulationDeps(),
    G: sim,
    plan: { kind: 'play-legendary', cardId: card.id, score: 0 },
    playerID: '0',
    playerIDs: ['0', '1'],
    currentTurn: 1,
  });

  assert.equal(liveResult, undefined);
  assert.equal(simResult, true);
  assert.deepEqual(comparableState(sim), comparableState(live));
});

test('simulation promote flow stays in parity with live handler end-stage behavior', () => {
  const live = makeParityState();
  const sim = makeParityState();
  let nextStage = '';

  const liveDeps = createParityMoveDeps();
  liveDeps.promoteRank = (G, playerID) => {
    G.ranks[playerID] = 'soldier';
    G.promotedThisTurn[playerID] = true;
    syncParityPlayerState(G, playerID);
    return true;
  };
  liveDeps.getActiveRanks = () => [{ id: 'recruit' }, { id: 'soldier', cost: {}, bonus: {} }];
  const liveArgs: MoveArgs = {
    G: live,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' }, turn: 1, numPlayers: 2 },
    playerID: '0',
    events: { setStage: (stage: string) => { nextStage = stage; } },
  };

  const simDeps = createParitySimulationDeps();
  simDeps.promoteRank = (G, playerID) => {
    G.ranks[playerID] = 'soldier';
    G.promotedThisTurn[playerID] = true;
    syncParityPlayerState(G, playerID);
    return true;
  };

  const liveResult = promoteHandler(liveDeps, liveArgs);
  const simResult = simDeps.promoteRank(sim, '0', 2);

  assert.equal(liveResult, undefined);
  assert.equal(simResult, true);
  assert.equal(nextStage, 'end');
  assert.equal(live.ranks['0'], sim.ranks['0']);
  assert.equal(live.promotedThisTurn['0'], sim.promotedThisTurn['0']);
});
