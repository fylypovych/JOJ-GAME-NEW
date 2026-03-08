import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankEngine, rankSeatLimitForPlayerCount } from '../src/game/rankEngine';
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
  assert.equal(rankSeatLimitForPlayerCount(2), 1);
  assert.equal(rankSeatLimitForPlayerCount(3), 2);
  assert.equal(rankSeatLimitForPlayerCount(5), 3);
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
});

test('promoteRank respects seat limit for 2 players', () => {
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
  const ok = engine.promoteRank(G, '0', 2);
  assert.equal(ok, false);
});
