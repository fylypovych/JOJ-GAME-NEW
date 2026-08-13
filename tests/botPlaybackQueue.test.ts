import test from 'node:test';
import assert from 'node:assert/strict';
import type { JojGameState } from '../src/game/types';
import {
  buildBotPlaybackQueuedSnapshots,
  clonePlaybackSnapshot,
  createPlaybackSignature,
  resolveBotActorNameFromText,
  resolveBotPlaybackMeta,
} from '../src/ui/board/useBotPlaybackQueue';
import { extractPlaybackCardTitle } from '../src/ui/board/playbackCardMeta';

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

test('bot playback detection only accepts a bot as the event actor', () => {
  const G = createGameState();

  assert.equal(
    resolveBotActorNameFromText(
      '🧭 [31] You played «Shared order». Effects: You: Time +1 | Bot Alpha: Time +1.',
      G,
    ),
    '',
  );
  assert.equal(
    resolveBotActorNameFromText(
      '🧭 [32] Bot Alpha played «Shared order». Effects: You: Time +1.',
      G,
    ),
    'Bot Alpha',
  );
});

test('clonePlaybackSnapshot freezes queued bot frame from later incoming mutations', () => {
  const state = createGameState();
  const cloned = clonePlaybackSnapshot({
    G: state,
    ctx: { currentPlayer: '1', turn: 2 },
  });

  state.discard = [{ id: 'support-9', title: 'Late state', category: 'SUPPORT', effects: [] }] as never;
  state.resources['1'].time = 5;

  assert.equal(cloned.G.discard.length, 0);
  assert.equal(cloned.G.resources['1'].time, 1);
});

test('buildBotPlaybackQueuedSnapshots keeps final ctx and final board state for every delayed bot event frame', () => {
  const finalState = createGameState();
  finalState.discard = [{ id: 'card-final', title: 'Final', category: 'SUPPORT', effects: [] }] as never;

  const queued = buildBotPlaybackQueuedSnapshots({
    botPlaybackEvents: [
      { actorName: 'Bot Alpha', text: 'Bot Alpha played first card' },
      { actorName: 'Bot Alpha', text: 'Bot Alpha played second card' },
    ],
    queuedSnapshot: { G: finalState, ctx: { currentPlayer: '0', turn: 2 } },
  });

  assert.equal(queued.length, 2);
  assert.equal(queued[0]?.ctx.turn, 2);
  assert.equal(queued[1]?.ctx.turn, 2);
  assert.equal(queued[0]?.G.discard[0]?.id, 'card-final');
  assert.equal(queued[1]?.G.discard[0]?.id, 'card-final');
});

test('extractPlaybackCardTitle reads quoted card title from system playback event', () => {
  const title = extractPlaybackCardTitle('📣 [160] Бібік урочисто вніс драму в порядок денний карткою «Колаборант» (СКАНДАЛ).');
  assert.equal(title, 'Колаборант');
});
