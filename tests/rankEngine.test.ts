import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankEngine, rankSeatLimitForPlayerCount, rankSeatLimitForRank } from '../src/game/rankEngine';
import type { JojGameState, RankDefinition, ResourceKey } from '../src/game/types';

const ranks: RankDefinition[] = [
  { id: 'recruit', name: 'Рекрут', requirement: {}, cost: {}, bonus: {} },
  { id: 'soldier', name: 'Солдат', requirement: { reputation: 3, discipline: 2 }, cost: { time: 1 }, bonus: {} },
  { id: 'senior_soldier', name: 'Старший солдат', requirement: { reputation: 4, discipline: 3 }, cost: { time: 1 }, bonus: {} },
];

const mkState = (): JojGameState => ({
  deck: [], discard: [], legendaryDeck: [], legendaryDiscard: [], systemMessageSeq: 0,
  playerNames: { '0': '', '1': '' }, chat: [],
  players: {
    '0': { hand: [], rankId: 'recruit', resources: { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 } },
    '1': { hand: [], rankId: 'recruit', resources: { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 } },
  },
  hands: { '0': [], '1': [] }, legendaryHands: { '0': [], '1': [] },
  ranks: { '0': 'recruit', '1': 'recruit' },
  rankImageByPlayer: {},
  resources: {
    '0': { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 },
    '1': { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 },
  },
  promotedThisTurn: { '0': false, '1': false },
  lyapScandalShieldUntilTurn: { '0': 0, '1': 0 },
  extraHandPlayTokens: { '0': 0, '1': 0 },
  sukhpayZsuWatchUntilTurn: { '0': 0, '1': 0 },
  sukhpayZsuPendingBonus: { '0': false, '1': false },
});

test('rank seat limit helper returns expected values', () => {
  assert.equal(rankSeatLimitForPlayerCount(1), 1);
  assert.equal(rankSeatLimitForPlayerCount(2), 2);
  assert.equal(rankSeatLimitForPlayerCount(3), 2);
  assert.equal(rankSeatLimitForPlayerCount(4), 3);
  assert.equal(rankSeatLimitForPlayerCount(5), 4);
  assert.equal(rankSeatLimitForPlayerCount(6), 4);
  assert.equal(rankSeatLimitForRank(6, 'recruit', ranks), 6);
  assert.equal(rankSeatLimitForRank(6, 'soldier', ranks), 4);
});

test('rank seat limit helper keeps recruit capacity equal to player count', () => {
  const cases = [
    { players: 1, recruit: 1, soldier: 1 },
    { players: 2, recruit: 2, soldier: 2 },
    { players: 3, recruit: 3, soldier: 2 },
    { players: 4, recruit: 4, soldier: 3 },
    { players: 5, recruit: 5, soldier: 4 },
    { players: 6, recruit: 6, soldier: 4 },
  ];
  cases.forEach(({ players, recruit, soldier }) => {
    assert.equal(rankSeatLimitForRank(players, 'recruit', ranks), recruit);
    assert.equal(rankSeatLimitForRank(players, 'soldier', ranks), soldier);
  });
});

test('promoteRank spends cost and upgrades when requirements are met', () => {
  const engine = createRankEngine({
    getActiveRanks: () => ranks,
    hasResources: (row, cost) => (Object.entries(cost) as Array<[ResourceKey, number]>).every(([k, v]) => (row[k] ?? 0) >= (v ?? 0)),
    spendResources: (row, cost) => { (Object.entries(cost) as Array<[ResourceKey, number]>).forEach(([k, v]) => { row[k] -= (v ?? 0); }); },
    applyResourceDelta: (row, bonus) => { (Object.entries(bonus) as Array<[ResourceKey, number]>).forEach(([k, v]) => { row[k] += (v ?? 0); }); },
    clampNonNegativeResources: () => {},
    syncPlayerState: (G, pid) => { G.players[pid].rankId = G.ranks[pid]; G.players[pid].resources = G.resources[pid]; },
  });
  const G = mkState();
  const ok = engine.promoteRank(G, '0', 2);
  assert.equal(ok, true);
  assert.equal(G.ranks['0'], 'soldier');
  assert.equal(G.resources['0'].time, 1);
  assert.equal(G.promotedThisTurn['0'], true);
});

test('promoteRank rejects second promotion in the same turn', () => {
  const engine = createRankEngine({
    getActiveRanks: () => ranks,
    hasResources: (row, cost) => (Object.entries(cost) as Array<[ResourceKey, number]>).every(([k, v]) => (row[k] ?? 0) >= (v ?? 0)),
    spendResources: (row, cost) => { (Object.entries(cost) as Array<[ResourceKey, number]>).forEach(([k, v]) => { row[k] -= (v ?? 0); }); },
    applyResourceDelta: () => {},
    clampNonNegativeResources: () => {},
    syncPlayerState: () => {},
  });
  const G = mkState();
  G.promotedThisTurn['0'] = true;

  const ok = engine.promoteRank(G, '0', 2);

  assert.equal(ok, false);
  assert.equal(G.ranks['0'], 'recruit');
});

test('grantSpecificRankIgnoringRequirements marks promotion as used for the turn', () => {
  const engine = createRankEngine({
    getActiveRanks: () => ranks,
    hasResources: () => true,
    spendResources: () => {},
    applyResourceDelta: () => {},
    clampNonNegativeResources: () => {},
    syncPlayerState: () => {},
  });
  const G = mkState();

  const result = engine.grantSpecificRankIgnoringRequirements(G, '0', 'soldier', 2);

  assert.equal(result.ok, true);
  assert.equal(G.ranks['0'], 'soldier');
  assert.equal(G.promotedThisTurn['0'], true);
});

test('promoteRank respects seat limit for 4 players', () => {
  const engine = createRankEngine({
    getActiveRanks: () => ranks,
    hasResources: (row, cost) => (Object.entries(cost) as Array<[ResourceKey, number]>).every(([k, v]) => (row[k] ?? 0) >= (v ?? 0)),
    spendResources: () => {},
    applyResourceDelta: () => {},
    clampNonNegativeResources: () => {},
    syncPlayerState: () => {},
  });
  const G = mkState();
  G.ranks['1'] = 'soldier';
  G.ranks['2'] = 'soldier';
  G.ranks['3'] = 'soldier';
  G.resources['2'] = { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 };
  G.resources['3'] = { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 };
  G.players['2'] = { hand: [], rankId: 'soldier', resources: G.resources['2'] };
  G.players['3'] = { hand: [], rankId: 'soldier', resources: G.resources['3'] };
  G.hands['2'] = [];
  G.hands['3'] = [];
  G.legendaryHands['2'] = [];
  G.legendaryHands['3'] = [];
  G.promotedThisTurn['2'] = false;
  G.promotedThisTurn['3'] = false;
  G.lyapScandalShieldUntilTurn['2'] = 0;
  G.lyapScandalShieldUntilTurn['3'] = 0;
  G.extraHandPlayTokens['2'] = 0;
  G.extraHandPlayTokens['3'] = 0;
  G.sukhpayZsuWatchUntilTurn['2'] = 0;
  G.sukhpayZsuWatchUntilTurn['3'] = 0;
  G.sukhpayZsuPendingBonus['2'] = false;
  G.sukhpayZsuPendingBonus['3'] = false;
  const ok = engine.promoteRank(G, '0', 4);
  assert.equal(ok, false);
});

test('demoteByOneRankWithSeatCheck allows demotion to recruit even above normal seat limit', () => {
  const engine = createRankEngine({
    getActiveRanks: () => ranks,
    hasResources: (row, cost) => (Object.entries(cost) as Array<[ResourceKey, number]>).every(([k, v]) => (row[k] ?? 0) >= (v ?? 0)),
    spendResources: () => {},
    applyResourceDelta: () => {},
    clampNonNegativeResources: () => {},
    syncPlayerState: () => {},
  });
  const G = mkState();
  G.resources['2'] = { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 };
  G.resources['3'] = { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 };
  G.resources['4'] = { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 };
  G.players['2'] = { hand: [], rankId: 'recruit', resources: G.resources['2'] };
  G.players['3'] = { hand: [], rankId: 'recruit', resources: G.resources['3'] };
  G.players['4'] = { hand: [], rankId: 'soldier', resources: G.resources['4'] };
  G.hands['2'] = [];
  G.hands['3'] = [];
  G.hands['4'] = [];
  G.legendaryHands['2'] = [];
  G.legendaryHands['3'] = [];
  G.legendaryHands['4'] = [];
  G.ranks['0'] = 'soldier';
  G.ranks['2'] = 'recruit';
  G.ranks['3'] = 'recruit';
  G.ranks['4'] = 'soldier';
  G.promotedThisTurn['2'] = false;
  G.promotedThisTurn['3'] = false;
  G.promotedThisTurn['4'] = false;
  G.lyapScandalShieldUntilTurn['2'] = 0;
  G.lyapScandalShieldUntilTurn['3'] = 0;
  G.lyapScandalShieldUntilTurn['4'] = 0;
  G.extraHandPlayTokens['2'] = 0;
  G.extraHandPlayTokens['3'] = 0;
  G.extraHandPlayTokens['4'] = 0;
  G.sukhpayZsuWatchUntilTurn['2'] = 0;
  G.sukhpayZsuWatchUntilTurn['3'] = 0;
  G.sukhpayZsuWatchUntilTurn['4'] = 0;
  G.sukhpayZsuPendingBonus['2'] = false;
  G.sukhpayZsuPendingBonus['3'] = false;
  G.sukhpayZsuPendingBonus['4'] = false;

  const result = engine.demoteByOneRankWithSeatCheck(G, '4', 5);
  assert.deepEqual(result, { ok: true, fromRankId: 'soldier', toRankId: 'recruit' });
});
