import test from 'node:test';
import assert from 'node:assert/strict';
import { createJojMoves } from '../src/game/moves';
import { drawCardHandler, playCardHandler, playLegendaryCardHandler, resolveDrawAutoCardHandler } from '../src/game/moveHandlers';
import type { JojMovesDeps, MoveArgs } from '../src/game/moveTypes';
import type { CardDefinition, JojGameState, ResourceKey } from '../src/game/types';

const makeState = (): JojGameState => ({
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

const makeDeps = (overrides: Partial<JojMovesDeps> = {}): JojMovesDeps => ({
  INVALID_MOVE: 'INVALID_MOVE',
  DRAW_STAGE: 'draw',
  PLAY_STAGE: 'play',
  END_STAGE: 'end',
  HAND_LIMIT: 8,
  resourceKeys: ['time', 'reputation', 'discipline', 'documents', 'tech'] as const,
  resourceLabelsUk: { time: 'Час', reputation: 'Авторитет', discipline: 'Дисципліна', documents: 'Документи', tech: 'Технології' },
  canPlayHandCardAtStage: () => true,
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
  applyCardEffects: () => true,
  applyCardEffectsSoft: () => ({ resources: {}, rank: 0 }),
  getReplacementUnitsForCard: () => 0,
  summarizeAppliedDiff: () => ({ resources: {}, rank: 0 }),
  effectSummaryToText: () => 'ok',
  resourceDeltaToText: () => 'ok',
  categoryLabelUk: () => 'SCANDAL',
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
    goodPressOfficerGranted: () => '',
    goodPressOfficerNoChange: () => '',
    droidDemote: () => '',
  } as JojMovesDeps['legendaryTexts'],
  clampNonNegativeResources: () => undefined,
  snapshotResourcesForStats: (G: JojGameState) => ({ '0': { ...G.resources['0'] }, '1': { ...G.resources['1'] } }),
  recordResourceFlowStats: () => undefined,
  resetNoPlayablePassStreak: () => undefined,
  shouldCountNoPlayablePass: () => false,
  hasPlayableCardsByInventory: () => false,
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
  getActiveRanks: () => [{ id: 'recruit' }],
  ...overrides,
});

test('syncPlayerNames only updates current player name', () => {
  const G = makeState();
  const moves = createJojMoves({
    INVALID_MOVE: 'INVALID_MOVE',
  } as JojMovesDeps);
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0' },
    playerID: '0',
  };

  const result = moves.syncPlayerNames(args, { '0': 'Alice', '1': 'Hacked Name' });

  assert.equal(result, undefined);
  assert.equal(G.playerNames['0'], 'Alice');
  assert.equal(G.playerNames['1'], 'P2');
});

test('drawCardHandler rolls back draw when scandal auto-apply fails', () => {
  const G = makeState();
  const scandal: CardDefinition = {
    id: 'scandal-x',
    title: 'Scandal',
    category: 'SCANDAL',
    effects: [{ resource: 'time', value: -1 }],
  };
  G.deck = [{ ...scandal }];

  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'draw' }, turn: 1 },
    playerID: '0',
    events: {
      setStage: () => undefined,
    },
  };

  const deps = makeDeps({
    applyCardEffects: (state: JojGameState, playerID: string) => {
      if (playerID === '0') {
        state.resources[playerID].time = 0;
        return true;
      }
      return false;
    },
    snapshotResourcesForStats: () => ({ '0': { ...G.resources['0'] }, '1': { ...G.resources['1'] } }),
  });

  const result = drawCardHandler(deps, args);

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.deck.length, 1);
  assert.equal(G.discard.length, 0);
  assert.equal(G.resources['0'].time, 1);
  assert.equal(G.resources['1'].time, 1);
});

test('resolveDrawAutoCardHandler rolls back scandal replacement on invalid target resolution', () => {
  const G = makeState();
  G.pendingDrawAutoResolution = {
    kind: 'SCANDAL',
    sourcePlayerID: '0',
    card: { id: 'scandal-auto', title: 'Scandal Auto', category: 'SCANDAL', effects: [{ resource: 'time', value: -1 }] },
  };
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'draw' }, turn: 1 },
    playerID: '0',
    events: { setStage: () => undefined },
  };
  const deps = makeDeps({
    applyCardEffects: (state: JojGameState, playerID: string) => {
      state.resources[playerID].time = 0;
      return playerID === '0';
    },
    snapshotResourcesForStats: () => ({ '0': { ...G.resources['0'] }, '1': { ...G.resources['1'] } }),
  });

  const result = resolveDrawAutoCardHandler(deps, args, [], {});

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.pendingDrawAutoResolution?.card.id, 'scandal-auto');
  assert.equal(G.resources['0'].time, 1);
  assert.equal(G.resources['1'].time, 1);
});

test('playCardHandler rolls back scandal on invalid multi-target resolution', () => {
  const G = makeState();
  G.playerNames['2'] = 'P3';
  G.players['2'] = { hand: [], rankId: 'recruit', resources: { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 } };
  G.hands['2'] = [];
  G.legendaryHands['2'] = [];
  G.ranks['2'] = 'recruit';
  G.resources['2'] = { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 };
  G.promotedThisTurn['2'] = false;
  G.lyapScandalShieldUntilTurn['2'] = 0;
  G.extraHandPlayTokens['2'] = 0;
  G.sukhpayZsuWatchUntilTurn['2'] = 0;
  G.sukhpayZsuPendingBonus['2'] = false;
  G.hands['0'] = [{ id: 'scandal-play', title: 'Scandal Play', category: 'SCANDAL', effects: [{ resource: 'time', value: -1 }] }];
  G.players['0'].hand = G.hands['0'];
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' }, turn: 1 },
    playerID: '0',
    events: { setStage: () => undefined },
  };
  const deps = makeDeps({
    applyCardEffects: (state: JojGameState, playerID: string) => {
      state.resources[playerID].time = 0;
      return playerID === '1';
    },
    snapshotResourcesForStats: () => ({ '0': { ...G.resources['0'] }, '1': { ...G.resources['1'] }, '2': { ...G.resources['2'] } }),
  });

  const result = playCardHandler(deps, args, 'scandal-play', [], undefined, { '1': [] });

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.hands['0'].length, 1);
  assert.equal(G.discard.length, 0);
  assert.equal(G.resources['1'].time, 1);
  assert.equal(G.resources['2'].time, 1);
});

test('playCardHandler rolls back command soft effects when self-resolution fails', () => {
  const G = makeState();
  G.hands['0'] = [{ id: 'command-play', title: 'Command', category: 'COMMAND', effects: [{ resource: 'time', value: -1 }] }];
  G.players['0'].hand = G.hands['0'];
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' }, turn: 1 },
    playerID: '0',
    events: { setStage: () => undefined },
  };
  const deps = makeDeps({
    applyCardEffectsSoft: (state: JojGameState, playerID: string) => {
      state.resources[playerID].time = 0;
      return { resources: { time: -1 }, rank: 0 };
    },
    applyCardEffects: () => false,
    snapshotResourcesForStats: () => ({ '0': { ...G.resources['0'] }, '1': { ...G.resources['1'] } }),
  });

  const result = playCardHandler(deps, args, 'command-play', ['time']);

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.resources['0'].time, 1);
  assert.equal(G.resources['1'].time, 1);
  assert.equal(G.discard.length, 0);
});

test('playCardHandler rolls back VVNZ promotion when effects fail', () => {
  const G = makeState();
  G.hands['0'] = [{ id: 'vvnz-play', title: 'VVNZ', category: 'VVNZ', grantRank: 'soldier', effects: [{ resource: 'time', value: 1 }] }];
  G.players['0'].hand = G.hands['0'];
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' }, turn: 1, numPlayers: 2 },
    playerID: '0',
    events: { setStage: () => undefined },
  };
  const deps = makeDeps({
    promoteToSpecificRank: (state: JojGameState, playerID: string) => {
      state.ranks[playerID] = 'soldier';
      return { ok: true, rank: { cost: {}, bonus: {} } };
    },
    applyCardEffects: () => false,
    snapshotResourcesForStats: () => ({ '0': { ...G.resources['0'] }, '1': { ...G.resources['1'] } }),
  });

  const result = playCardHandler(deps, args, 'vvnz-play');

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.ranks['0'], 'recruit');
  assert.equal(G.hands['0'].length, 1);
  assert.equal(G.discard.length, 0);
});

test('playLegendaryCardHandler rolls back special effects when card effects fail', () => {
  const G = makeState();
  G.legendaryHands['0'] = [{ id: 'legendary-03', title: 'Legendary', category: 'LEGENDARY', effects: [] }];
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' }, turn: 1, numPlayers: 2 },
    playerID: '0',
  };
  const deps = makeDeps({
    applyCardEffects: () => false,
    snapshotResourcesForStats: () => ({ '0': { ...G.resources['0'] }, '1': { ...G.resources['1'] } }),
  });

  const result = playLegendaryCardHandler(deps, args, 'legendary-03');

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.extraHandPlayTokens['0'], 0);
  assert.equal(G.legendaryHands['0'].length, 1);
  assert.equal(G.legendaryDiscard.length, 0);
});
