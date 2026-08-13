import test from 'node:test';
import assert from 'node:assert/strict';
import { jojGame } from '../src/game/jojGame';
import { createBotEngine } from '../src/game/bot-engine/engine';
import type { JojGameState } from '../src/game/types';
import type { JojMovesDeps } from '../src/game/moveTypes';
import {
  drawCardHandler,
  passHandler,
  playCardHandler,
  playLegendaryCardHandler,
  promoteHandler,
  resolveDrawAutoCardHandler,
} from '../src/game/moveHandlers';
import { createJojMoves } from '../src/game/moves';

const makeState = (): JojGameState => ({
  gameMode: 'standard',
  deck: [],
  discard: [],
  legendaryDeck: [],
  legendaryDiscard: [],
  legendaryDraftCompleted: { '0': true, '1': true },
  systemMessageSeq: 0,
  playerNames: { '0': 'P1', '1': 'Bot Easy 1' },
  botPlayers: { '1': { difficulty: 'easy', name: 'Bot Easy 1' } },
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
  playerGameStats: {
    '0': { resourcesGainedTotal: 0, resourcesLostTotal: 0, lyapsPlayedOnOthers: 0, scandalsPlayedOnOthers: 0, turnsTaken: 0 },
    '1': { resourcesGainedTotal: 0, resourcesLostTotal: 0, lyapsPlayedOnOthers: 0, scandalsPlayedOnOthers: 0, turnsTaken: 0 },
  },
  noPlayablePassStreak: 0,
  endGameVote: { active: false, requestedBy: null, votes: {} },
  pendingDrawAutoResolution: null,
});

const makeDeps = (overrides: Partial<JojMovesDeps> = {}): JojMovesDeps => ({
  INVALID_MOVE: 'INVALID_MOVE',
  DRAW_STAGE: 'draw',
  PLAY_STAGE: 'play',
  END_STAGE: 'end',
  HAND_LIMIT: 8,
  resourceKeys: ['time', 'reputation', 'discipline', 'documents', 'tech'] as const,
  resourceLabelsUk: { time: 'Час', reputation: 'Авторитет', discipline: 'Дисципліна', documents: 'Документи', tech: 'Технології' },
  canPlayHandCardAtStage: ({ stage }) => stage === 'play' || stage === 'end',
  appendChat: () => undefined,
  nextSystemMessageSeq: () => 1,
  getPlayerLabel: (_G: JojGameState, playerID: string) => playerID,
  syncPlayerState: (state: JojGameState, playerID: string) => {
    state.players[playerID].resources = { ...state.resources[playerID] };
    state.players[playerID].rankId = state.ranks[playerID];
    state.players[playerID].hand = state.hands[playerID];
  },
  isProtectedFromLyapScandal: () => false,
  triggerSukhpayZsuOnScandal: () => undefined,
  applyCardEffects: (state: JojGameState, playerID: string, effects) => {
    (effects ?? []).forEach((effect) => {
      if (effect.resource === 'rank') return;
      state.resources[playerID][effect.resource] = (state.resources[playerID][effect.resource] ?? 0) + effect.value;
    });
    return true;
  },
  applyCardEffectsSoft: () => ({ resources: {}, rank: 0 }),
  planReplacementResources: () => [],
  getReplacementUnitsForCard: () => 0,
  summarizeAppliedDiff: () => ({ resources: {}, rank: 0 }),
  effectSummaryToText: () => 'ok',
  resourceDeltaToText: () => 'ok',
  categoryLabelUk: () => 'SUPPORT',
  cardFlavorSnippet: () => '',
  rankNameById: (rankId: string) => rankId,
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
    droidDemote: () => '',
  } as JojMovesDeps['legendaryTexts'],
  clampNonNegativeResources: () => undefined,
  snapshotResourcesForStats: (G: JojGameState) => ({ '0': { ...G.resources['0'] }, '1': { ...G.resources['1'] } }),
  recordResourceFlowStats: () => undefined,
  resetNoPlayablePassStreak: () => undefined,
  shouldCountNoPlayablePass: () => false,
  hasPlayableCardsByInventory: (G: JojGameState, playerID: string) => (G.hands[playerID]?.length ?? 0) > 0,
  incrementNoPlayablePassStreak: () => undefined,
  incrementTurnsCompleted: () => undefined,
  incrementLyapPlayedOnOthers: () => undefined,
  incrementScandalPlayedOnOthers: () => undefined,
  resetEndGameVote: () => undefined,
  computeShieldUntilNextOwnTurn: () => 0,
  cancelLastLyapOrScandalForPlayer: () => ({ canceledCard: null, summary: { resources: {}, rank: 0 } }),
  cancelLastScandalForPlayer: () => ({ canceledCard: null, summary: { resources: {}, rank: 0 } }),
  promoteToSpecificRank: () => ({ ok: false }),
  grantSpecificRankIgnoringRequirements: () => ({ ok: false, reason: 'nope' }),
  demoteByOneRankWithSeatCheck: () => ({ ok: false, reason: 'nope' }),
  promoteRank: () => false,
  getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier', cost: { reputation: 2 }, bonus: {} }],
  ...overrides,
});

const makeBotEngine = (deps: JojMovesDeps) => createBotEngine({
  ...deps,
  drawCardHandler,
  resolveDrawAutoCardHandler,
  playCardHandler,
  playLegendaryCardHandler,
  promoteHandler,
  passHandler,
  planReplacementResources: deps.planReplacementResources,
});

const addBotSeat = (G: JojGameState, playerID: string, name: string, difficulty: 'easy' | 'normal' | 'hard' = 'easy') => {
  const baseResources = { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 };
  G.players[playerID] = { hand: [], rankId: 'recruit', resources: { ...baseResources } };
  G.hands[playerID] = [];
  G.legendaryHands[playerID] = [];
  G.ranks[playerID] = 'recruit';
  G.resources[playerID] = { ...baseResources };
  G.promotedThisTurn[playerID] = false;
  G.lyapScandalShieldUntilTurn[playerID] = 0;
  G.extraHandPlayTokens[playerID] = 0;
  G.sukhpayZsuWatchUntilTurn[playerID] = 0;
  G.sukhpayZsuPendingBonus[playerID] = false;
  G.playerGameStats[playerID] = {
    resourcesGainedTotal: 0,
    resourcesLostTotal: 0,
    lyapsPlayedOnOthers: 0,
    scandalsPlayedOnOthers: 0,
    turnsTaken: 0,
  };
  G.playerNames[playerID] = name;
  G.botPlayers[playerID] = { difficulty, name };
};

test('jojGame setup attaches bot players from setupData', () => {
  const state = jojGame.setup?.(
    { ctx: { playOrder: ['0', '1', '2'], currentPlayer: '0' } as never },
    { bots: { count: 2, difficulty: 'normal' } },
  ) as JojGameState;

  assert.equal(state.botPlayers['1']?.difficulty, 'normal');
  assert.equal(state.botPlayers['2']?.difficulty, 'normal');
  assert.match(state.playerNames['1'], /Bot Normal 1/);
  assert.match(state.playerNames['2'], /Bot Normal 2/);
});

test('jojGame setup auto-completes legendary draft for bot players in standard plus', () => {
  const state = jojGame.setup?.(
    { ctx: { playOrder: ['0', '1', '2'], currentPlayer: '0' } as never },
    {
      gameMode: 'standard_plus',
      bots: { count: 2, difficulty: 'easy' },
      gameSetup: { optionalMainDeckModuleIds: ['vvnz_default'] },
    },
  ) as JojGameState;

  assert.equal(state.legendaryDraftCompleted['1'], true);
  assert.equal(state.legendaryDraftCompleted['2'], true);
  assert.equal(state.legendaryHands['1'].length, 5);
  assert.equal(state.legendaryHands['2'].length, 5);
});

test('bot engine plays a support card from hand', () => {
  const G = makeState();
  G.hands['1'] = [{
    id: 'support-1',
    title: 'Support',
    category: 'SUPPORT',
    effects: [{ resource: 'reputation', value: 2 }],
  }];
  G.players['1'].hand = G.hands['1'];

  const deps = makeDeps();
  const engine = makeBotEngine(deps);

  const acted = engine.playTurn({
    G,
    ctx: { currentPlayer: '1', activePlayers: { '1': 'play' }, numPlayers: 2, playOrder: ['0', '1'], turn: 1 },
    playerID: '1',
    initialStage: 'play',
  });

  assert.equal(acted, true);
  assert.equal(G.hands['1'].length, 0);
  assert.equal(G.discard.length, 1);
  assert.equal(G.resources['1'].reputation, 3);
});

test('bot engine plays at most one legendary card during a turn', () => {
  const G = makeState();
  G.legendaryHands['1'] = [
    { id: 'legendary-03', title: 'Extra play', category: 'LEGENDARY', effects: [] },
    { id: 'legendary-12', title: 'Shield', category: 'LEGENDARY', effects: [] },
  ];
  const engine = makeBotEngine(makeDeps());

  engine.playTurn({
    G,
    ctx: { currentPlayer: '1', activePlayers: { '1': 'play' }, numPlayers: 2, playOrder: ['0', '1'], turn: 1 },
    playerID: '1',
    initialStage: 'play',
  });

  assert.equal(G.legendaryDiscard.length, 1);
  assert.equal(G.legendaryHands['1'].length, 1);
});

test('end game vote auto-adds bot approvals', () => {
  const G = makeState();
  addBotSeat(G, '2', 'Bot Easy 2');

  const moves = createJojMoves(makeDeps());
  const requestResult = moves.requestEndGameVote({ G, ctx: { currentPlayer: '0', activePlayers: { '0': 'play' } } as never, playerID: '0' });

  assert.equal(requestResult, undefined);
  assert.deepEqual(G.endGameVote.votes, { '0': true, '1': true, '2': true });
});

test('bot engine force-resolves pending draw auto state before ending turn', () => {
  const G = makeState();
  G.pendingDrawAutoResolution = {
    kind: 'LYAP',
    sourcePlayerID: '1',
    card: {
      id: 'lyap-1',
      title: 'Lyap',
      category: 'LYAP',
      effects: [{ resource: 'reputation', value: -5 }],
    },
  };

  const deps = makeDeps({
    planReplacementResources: () => null as never,
  });
  const engine = makeBotEngine(deps);

  const acted = engine.playTurn({
    G,
    ctx: { currentPlayer: '1', activePlayers: { '1': 'draw' }, numPlayers: 2, playOrder: ['0', '1'], turn: 1 },
    playerID: '1',
    initialStage: 'draw',
  });

  assert.equal(acted, true);
  assert.equal(G.pendingDrawAutoResolution, null);
  assert.equal(G.discard.length, 1);
});
