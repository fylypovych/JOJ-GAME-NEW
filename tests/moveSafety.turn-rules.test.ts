import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyGameState,
  createJojMoves,
  endTurnHandler,
  makeDeps,
  makeState,
  passHandler,
} from './moveSafety.helpers';
import type { JojMovesDeps, MoveArgs } from './moveSafety.helpers';

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

  const result = moves.syncPlayerNames(args, {
    '0': 'Alice',
    '1': 'Hacked Name',
  });

  assert.equal(result, undefined);
  assert.equal(G.playerNames['0'], 'Alice');
  assert.equal(G.playerNames['1'], 'P2');
});

test('createEmptyGameState starts resource flow stats at zero', () => {
  const G = createEmptyGameState({
    gameMode: 'standard',
    deck: [],
    legendaryDeck: [],
  });

  assert.deepEqual(G.gameStats.resourcesGainedByType, {
    time: 0,
    reputation: 0,
    discipline: 0,
    documents: 0,
    tech: 0,
  });
  assert.deepEqual(G.gameStats.resourcesLostByType, {
    time: 0,
    reputation: 0,
    discipline: 0,
    documents: 0,
    tech: 0,
  });
});

test('passHandler rejects pass while deck still has cards', () => {
  const G = makeState();
  G.deck = [
    {
      id: 'support-x',
      title: 'Support',
      category: 'SUPPORT',
      effects: [{ resource: 'time', value: 1 }],
    },
  ];
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' } },
    playerID: '0',
    events: { endTurn: () => undefined },
  };

  const result = passHandler(makeDeps(), args);

  assert.equal(result, 'INVALID_MOVE');
});

test('endTurnHandler allows normal end turn while deck still has cards', () => {
  const G = makeState();
  G.deck = [
    {
      id: 'support-x',
      title: 'Support',
      category: 'SUPPORT',
      effects: [{ resource: 'time', value: 1 }],
    },
  ];
  let ended = false;
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' } },
    playerID: '0',
    events: {
      endTurn: () => {
        ended = true;
      },
    },
  };

  const result = endTurnHandler(makeDeps(), args);

  assert.equal(result, undefined);
  assert.equal(ended, true);
});

test('passHandler allows pass only when deck is empty and no playable cards remain', () => {
  const G = makeState();
  G.deck = [];
  G.hands['0'] = [
    {
      id: 'vvnz-down',
      title: 'VVNZ',
      category: 'VVNZ',
      grantRank: 'junior_lieutenant',
      effects: [],
    },
  ];
  G.players['0'].hand = G.hands['0'];
  let ended = false;
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' } },
    playerID: '0',
    events: {
      endTurn: () => {
        ended = true;
      },
    },
  };

  const result = passHandler(
    makeDeps({
      hasPlayableCardsByInventory: () => false,
      shouldCountNoPlayablePass: () => true,
    }),
    args,
  );

  assert.equal(result, undefined);
  assert.equal(ended, true);
});
