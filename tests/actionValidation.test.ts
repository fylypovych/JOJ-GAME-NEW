import test from 'node:test';
import assert from 'node:assert/strict';
import { getPromoteBlockedReason, getVvnzPlayBlockedReason } from '../src/game/actionValidation';
import type { JojGameState, RankDefinition, ResourceKey } from '../src/game/types';

const labels: Record<ResourceKey, string> = {
  time: 'Час',
  reputation: 'Авторитет',
  discipline: 'Дисципліна',
  documents: 'Документи',
  tech: 'Технології',
};

const ranks: RankDefinition[] = [
  { id: 'recruit', name: 'Рекрут', requirement: {}, cost: {}, bonus: {} },
  { id: 'soldier', name: 'Солдат', requirement: { reputation: 3, discipline: 2 }, cost: { time: 1 }, bonus: {} },
  { id: 'senior_sergeant', name: 'Старший сержант', requirement: { reputation: 7, discipline: 5 }, cost: { time: 2 }, bonus: {} },
];

const makeState = (overrides?: Partial<JojGameState>): JojGameState => ({
  deck: [],
  discard: [],
  legendaryDeck: [],
  legendaryDiscard: [],
  systemMessageSeq: 0,
  playerNames: { '0': 'P1', '1': 'P2' },
  chat: [],
  players: {
    '0': { hand: [], rankId: 'recruit', resources: { time: 2, reputation: 2, discipline: 2, documents: 0, tech: 0 } },
    '1': { hand: [], rankId: 'recruit', resources: { time: 2, reputation: 2, discipline: 2, documents: 0, tech: 0 } },
  },
  hands: { '0': [], '1': [] },
  legendaryHands: { '0': [], '1': [] },
  ranks: { '0': 'recruit', '1': 'recruit' },
  rankImageByPlayer: {},
  resources: {
    '0': { time: 2, reputation: 2, discipline: 2, documents: 0, tech: 0 },
    '1': { time: 2, reputation: 2, discipline: 2, documents: 0, tech: 0 },
  },
  promotedThisTurn: { '0': false, '1': false },
  lyapScandalShieldUntilTurn: { '0': 0, '1': 0 },
  extraHandPlayTokens: { '0': 0, '1': 0 },
  sukhpayZsuWatchUntilTurn: { '0': 0, '1': 0 },
  sukhpayZsuPendingBonus: { '0': false, '1': false },
  ...overrides,
});

test('getPromoteBlockedReason reports missing requirement', () => {
  const G = makeState();
  const reason = getPromoteBlockedReason({ G, playerID: '0', ranks, resourceLabels: labels, lang: 'uk' });
  assert.match(reason ?? '', /бракує/i);
  assert.match(reason ?? '', /Авторитет/);
});

test('getPromoteBlockedReason reports seat limit for 2 players', () => {
  const G = makeState({
    ranks: { '0': 'recruit', '1': 'soldier' },
    resources: {
      '0': { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 },
      '1': { time: 2, reputation: 3, discipline: 2, documents: 0, tech: 0 },
    },
  });
  const reason = getPromoteBlockedReason({ G, playerID: '0', ranks, resourceLabels: labels, lang: 'uk' });
  assert.match(reason ?? '', /Немає вільного місця/);
});

test('getVvnzPlayBlockedReason reports target rank not higher', () => {
  const G = makeState({
    ranks: { '0': 'senior_sergeant', '1': 'recruit' },
    resources: {
      '0': { time: 5, reputation: 10, discipline: 10, documents: 2, tech: 2 },
      '1': { time: 2, reputation: 2, discipline: 2, documents: 0, tech: 0 },
    },
  });
  const reason = getVvnzPlayBlockedReason({
    card: { category: 'VVNZ', grantRank: 'soldier' },
    G,
    playerID: '0',
    ranks,
    resourceLabels: labels,
    lang: 'uk',
  });
  assert.match(reason ?? '', /вже не нижче/);
});

test('getPromoteBlockedReason reports already promoted this turn', () => {
  const G = makeState({
    promotedThisTurn: { '0': true, '1': false },
  });
  const reason = getPromoteBlockedReason({ G, playerID: '0', ranks, resourceLabels: labels, lang: 'uk' });
  assert.match(reason ?? '', /вже підвищувалися/);
});
