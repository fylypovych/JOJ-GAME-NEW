import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyGameState } from '../src/game/stateFactory';
import {
  HIDDEN_CARD,
  SECRET_DECK_COLLECTIONS,
  SECRET_PLAYER_COLLECTIONS,
  cloneGameState,
  createSanitizedPlayerView,
  restoreGameState,
  withGameStateTransaction,
} from '../src/game/gameStateUtils';
import type { CardDefinition, JojGameState } from '../src/game/types';

const supportCard: CardDefinition = {
  id: 'support-01',
  title: 'Support',
  category: 'SUPPORT',
  effects: [{ resource: 'time', value: 1 }],
};

const makeState = (): JojGameState => {
  const G = createEmptyGameState({
    gameMode: 'standard_plus',
    deck: [{ ...supportCard }],
    legendaryDeck: [{ ...supportCard, id: 'legendary-01', category: 'LEGENDARY' }],
  });
  G.players = {
    '0': { hand: [], rankId: 'recruit', resources: { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 } },
    '1': { hand: [], rankId: 'recruit', resources: { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 } },
  };
  G.resources = {
    '0': { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
    '1': { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
  };
  G.ranks = { '0': 'recruit', '1': 'recruit' };
  G.hands = {
    '0': [{ ...supportCard }],
    '1': [{ ...supportCard, id: 'support-02', title: 'Hidden Support' }],
  };
  G.legendaryHands = {
    '0': [{ ...supportCard, id: 'legendary-02', category: 'LEGENDARY' }],
    '1': [{ ...supportCard, id: 'legendary-03', category: 'LEGENDARY', title: 'Hidden Legendary' }],
  };
  G.players['0'].hand = G.hands['0'];
  G.players['1'].hand = G.hands['1'];
  return G;
};

test('restoreGameState restores runtime-added fields through generic object replacement', () => {
  const G = makeState() as JojGameState & { runtimeOnly?: { flag: boolean } };
  G.runtimeOnly = { flag: true };
  const snapshot = cloneGameState(G);
  G.runtimeOnly = { flag: false };
  G.deck = [];
  restoreGameState(G, snapshot);
  assert.deepEqual(G.runtimeOnly, { flag: true });
  assert.equal(G.deck[0]?.id, 'support-01');
});

test('withGameStateTransaction rolls back full state on requested failure', () => {
  const G = makeState();
  const result = withGameStateTransaction(
    G,
    () => {
      G.deck = [];
      G.resources['0'].time = 99;
      return false;
    },
    (ok) => ok === false,
  );
  assert.equal(result, false);
  assert.equal(G.deck[0]?.id, 'support-01');
  assert.equal(G.resources['0'].time, 1);
});

test('sanitized player view keeps declared secret collections hidden', () => {
  const view = createSanitizedPlayerView(makeState(), { gameover: undefined }, '0');
  SECRET_PLAYER_COLLECTIONS.forEach((key) => {
    assert.equal(view[key]['1'][0]?.id, HIDDEN_CARD.id);
  });
  SECRET_DECK_COLLECTIONS.forEach((key) => {
    assert.equal(view[key][0]?.id, HIDDEN_CARD.id);
  });
});
