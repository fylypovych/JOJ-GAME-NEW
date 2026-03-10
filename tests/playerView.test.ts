import test from 'node:test';
import assert from 'node:assert/strict';
import { jojGame } from '../src/game/jojGame';
import { createEmptyGameState } from '../src/game/stateFactory';
import type { CardDefinition, JojGameState } from '../src/game/types';

const supportCard: CardDefinition = {
  id: 'support-secret',
  title: 'Secret Support',
  category: 'SUPPORT',
  effects: [{ resource: 'time', value: 1 }],
  flavor: 'private',
};

const legendaryCard: CardDefinition = {
  id: 'legendary-secret',
  title: 'Secret Legendary',
  category: 'LEGENDARY',
  effects: [],
  flavor: 'private legendary',
};

const makeState = (): JojGameState => {
  const G = createEmptyGameState({
    gameMode: 'standard_plus',
    deck: [{ ...supportCard }],
    legendaryDeck: [{ ...legendaryCard }],
  });
  G.players = {
    '0': { hand: [], rankId: 'recruit', resources: { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 } },
    '1': { hand: [], rankId: 'recruit', resources: { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 } },
  };
  G.hands = {
    '0': [{ ...supportCard }],
    '1': [{ ...supportCard, id: 'support-other', title: 'Other Secret', flavor: 'other private' }],
  };
  G.legendaryHands = {
    '0': [{ ...legendaryCard }],
    '1': [{ ...legendaryCard, id: 'legendary-other', title: 'Other Legendary', flavor: 'other legendary' }],
  };
  G.players['0'].hand = G.hands['0'];
  G.players['1'].hand = G.hands['1'];
  return G;
};

test('playerView hides other players hand contents', () => {
  const playerView = jojGame.playerView?.({
    G: makeState(),
    ctx: { gameover: undefined },
    playerID: '0',
  });
  assert.ok(playerView);
  assert.equal(playerView?.hands['0'][0]?.id, 'support-secret');
  assert.equal(playerView?.hands['1'][0]?.id, 'hidden');
  assert.equal(playerView?.hands['1'][0]?.title, 'Hidden');
  assert.equal(playerView?.legendaryHands['1'][0]?.id, 'hidden');
  assert.equal(playerView?.legendaryDeck[0]?.id, 'hidden');
});

test('playerView hides all hand contents for spectators', () => {
  const spectatorView = jojGame.playerView?.({
    G: makeState(),
    ctx: { gameover: undefined },
    playerID: undefined,
  });
  assert.ok(spectatorView);
  assert.equal(spectatorView?.hands['0'][0]?.id, 'hidden');
  assert.equal(spectatorView?.hands['1'][0]?.id, 'hidden');
  assert.equal(spectatorView?.legendaryHands['0'][0]?.id, 'hidden');
  assert.equal(spectatorView?.legendaryDeck[0]?.id, 'hidden');
});

test('playerView hides both decks before game end and reveals them after gameover', () => {
  const liveView = jojGame.playerView?.({
    G: makeState(),
    ctx: { gameover: undefined },
    playerID: '0',
  });
  assert.ok(liveView);
  assert.equal(liveView?.deck[0]?.id, 'hidden');
  assert.equal(liveView?.legendaryDeck[0]?.id, 'hidden');

  const finishedView = jojGame.playerView?.({
    G: makeState(),
    ctx: { gameover: { winner: '0' } },
    playerID: '0',
  });
  assert.ok(finishedView);
  assert.equal(finishedView?.deck[0]?.id, 'support-secret');
  assert.equal(finishedView?.legendaryDeck[0]?.id, 'legendary-secret');
});
