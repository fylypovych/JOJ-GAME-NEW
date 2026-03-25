import test from 'node:test';
import assert from 'node:assert/strict';
import type { JojGameState } from '../src/game/types';
import { createPlaybackSignature, resolveBotPlaybackMeta } from '../src/ui/board/useBotPlaybackQueue';

const createGameState = (): JojGameState => ({
  players: { '0': {}, '1': {} },
  playerNames: { '0': 'You', '1': 'Bot Alpha' },
  botPlayers: { '1': { difficulty: 'normal', profile: 'balanced', name: 'Bot Alpha' } },
  hands: { '0': [], '1': [] },
  legendaryHands: { '0': [], '1': [] },
  deck: [],
  discard: [],
  chat: [],
  resources: {
    '0': { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
    '1': { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
  },
  ranks: { '0': 'cadet', '1': 'cadet' },
  promotedThisTurn: {},
  extraHandPlayTokens: {},
  playerGameStats: {},
  gameStats: {
    turnsCompleted: 0,
    resourcesGainedTotal: 0,
    resourcesLostTotal: 0,
    lyapsPlayedOnOthers: 0,
    scandalsPlayedOnOthers: 0,
  },
}) as unknown as JojGameState;

test('createPlaybackSignature changes when discard top card changes', () => {
  const stateA = createGameState();
  const stateB = createGameState();
  stateB.discard = [{ id: 'support-1', title: 'Support', category: 'SUPPORT', effects: [] }] as never;

  const sigA = createPlaybackSignature({ G: stateA, ctx: { currentPlayer: '1', turn: 2 }, playerID: '0' });
  const sigB = createPlaybackSignature({ G: stateB, ctx: { currentPlayer: '1', turn: 2 }, playerID: '0' });

  assert.notEqual(sigA, sigB);
});

test('resolveBotPlaybackMeta delays snapshot produced after bot acted even if next player is human', () => {
  const nextSnapshot = {
    G: createGameState(),
    ctx: { currentPlayer: '0', turn: 3 },
  };

  assert.deepEqual(resolveBotPlaybackMeta({
    previousCurrentPlayer: '1',
    nextSnapshot,
  }), {
    shouldDelay: true,
    actorName: 'Bot Alpha',
  });
});

test('resolveBotPlaybackMeta does not delay human-origin snapshot', () => {
  const nextSnapshot = {
    G: createGameState(),
    ctx: { currentPlayer: '1', turn: 4 },
  };

  assert.deepEqual(resolveBotPlaybackMeta({
    previousCurrentPlayer: '0',
    nextSnapshot,
  }), {
    shouldDelay: false,
    actorName: '',
  });
});
