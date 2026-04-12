import test from 'node:test';
import assert from 'node:assert/strict';
import {
  drawCardHandler,
  makeDeps,
  makeState,
  playCardHandler,
  playLegendaryCardHandler,
  promoteHandler,
  resolveDrawAutoCardHandler,
} from './moveSafety.helpers';
import type {
  CardDefinition,
  JojGameState,
  MoveArgs,
} from './moveSafety.helpers';

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
    snapshotResourcesForStats: () => ({
      '0': { ...G.resources['0'] },
      '1': { ...G.resources['1'] },
    }),
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
    card: {
      id: 'scandal-auto',
      title: 'Scandal Auto',
      category: 'SCANDAL',
      effects: [{ resource: 'time', value: -1 }],
    },
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
    snapshotResourcesForStats: () => ({
      '0': { ...G.resources['0'] },
      '1': { ...G.resources['1'] },
    }),
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
  G.players['2'] = {
    hand: [],
    rankId: 'recruit',
    resources: { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
  };
  G.hands['2'] = [];
  G.legendaryHands['2'] = [];
  G.ranks['2'] = 'recruit';
  G.resources['2'] = {
    time: 1,
    reputation: 1,
    discipline: 1,
    documents: 1,
    tech: 1,
  };
  G.promotedThisTurn['2'] = false;
  G.lyapScandalShieldUntilTurn['2'] = 0;
  G.extraHandPlayTokens['2'] = 0;
  G.sukhpayZsuWatchUntilTurn['2'] = 0;
  G.sukhpayZsuPendingBonus['2'] = false;
  G.hands['0'] = [
    {
      id: 'scandal-play',
      title: 'Scandal Play',
      category: 'SCANDAL',
      effects: [{ resource: 'time', value: -1 }],
    },
  ];
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
    snapshotResourcesForStats: () => ({
      '0': { ...G.resources['0'] },
      '1': { ...G.resources['1'] },
      '2': { ...G.resources['2'] },
    }),
  });

  const result = playCardHandler(deps, args, 'scandal-play', [], undefined, {
    '1': [],
    '2': [],
  });

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.hands['0'].length, 1);
  assert.equal(G.discard.length, 0);
  assert.equal(G.resources['1'].time, 1);
  assert.equal(G.resources['2'].time, 1);
});

test('drawCardHandler ends current turn immediately after partial forced resource loss', () => {
  const G = makeState();
  const lyap: CardDefinition = {
    id: 'lyap-force-skip',
    title: 'Ляп',
    category: 'LYAP',
    effects: [{ resource: 'time', value: -2 }],
  };
  G.deck = [{ ...lyap }];
  G.resources['0'] = {
    time: 0,
    reputation: 0,
    discipline: 0,
    documents: 1,
    tech: 0,
  };
  G.players['0'].resources = { ...G.resources['0'] };
  let ended = false;
  let nextStage = '';

  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'draw' }, turn: 1 },
    playerID: '0',
    events: {
      setStage: (stage: string) => {
        nextStage = stage;
      },
      endTurn: () => {
        ended = true;
      },
    },
  };

  const result = drawCardHandler(
    makeDeps({
      getReplacementUnitsForCard: () => 0,
      applyCardEffects: (state: JojGameState, targetPlayerID: string) => {
        state.resources[targetPlayerID] = {
          time: 0,
          reputation: 0,
          discipline: 0,
          documents: 0,
          tech: 0,
        };
        state.players[targetPlayerID].resources = {
          ...state.resources[targetPlayerID],
        };
        state.skippedTurnCounts = {
          ...(state.skippedTurnCounts ?? {}),
          [targetPlayerID]: 1,
        };
        return true;
      },
      snapshotResourcesForStats: () => ({
        '0': { ...G.resources['0'] },
        '1': { ...G.resources['1'] },
      }),
    }),
    args,
  );

  assert.equal(result, undefined);
  assert.equal(ended, true);
  assert.equal(nextStage, '');
  assert.deepEqual(G.resources['0'], {
    time: 0,
    reputation: 0,
    discipline: 0,
    documents: 0,
    tech: 0,
  });
  assert.equal(G.skippedTurnCounts?.['0'] ?? 0, 0);
  assert.equal(G.discard.at(-1)?.id, 'lyap-force-skip');
});

test('playCardHandler applies hand scandal to all other players except source player', () => {
  const G = makeState();
  G.playerNames['2'] = 'P3';
  G.players['2'] = {
    hand: [],
    rankId: 'recruit',
    resources: { time: 2, reputation: 1, discipline: 1, documents: 1, tech: 1 },
  };
  G.hands['2'] = [];
  G.legendaryHands['2'] = [];
  G.ranks['2'] = 'recruit';
  G.resources['2'] = {
    time: 2,
    reputation: 1,
    discipline: 1,
    documents: 1,
    tech: 1,
  };
  G.promotedThisTurn['2'] = false;
  G.lyapScandalShieldUntilTurn['2'] = 0;
  G.extraHandPlayTokens['2'] = 0;
  G.sukhpayZsuWatchUntilTurn['2'] = 0;
  G.sukhpayZsuPendingBonus['2'] = false;
  G.hands['0'] = [
    {
      id: 'scandal-all-others',
      title: 'Scandal All Others',
      category: 'SCANDAL',
      effects: [{ resource: 'time', value: -1 }],
    },
  ];
  G.players['0'].hand = G.hands['0'];
  G.resources['0'].time = 2;
  G.players['0'].resources.time = 2;
  G.resources['1'].time = 2;
  G.players['1'].resources.time = 2;

  const affectedPlayers: string[] = [];
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' }, turn: 1 },
    playerID: '0',
    events: { setStage: () => undefined },
  };
  const deps = makeDeps({
    applyCardEffects: (state: JojGameState, playerID: string, effects) => {
      affectedPlayers.push(playerID);
      const timeLoss =
        effects.find((effect) => effect.resource === 'time')?.value ?? 0;
      state.resources[playerID].time += timeLoss;
      return true;
    },
    snapshotResourcesForStats: () => ({
      '0': { ...G.resources['0'] },
      '1': { ...G.resources['1'] },
      '2': { ...G.resources['2'] },
    }),
  });

  const result = playCardHandler(
    deps,
    args,
    'scandal-all-others',
    [],
    undefined,
    { '1': [], '2': [] },
  );

  assert.equal(result, undefined);
  assert.deepEqual(affectedPlayers.sort(), ['1', '2']);
  assert.equal(G.resources['0'].time, 2);
  assert.equal(G.resources['1'].time, 1);
  assert.equal(G.resources['2'].time, 1);
  assert.equal(G.hands['0'].length, 0);
  assert.equal(G.discard.at(-1)?.id, 'scandal-all-others');
});

test('playCardHandler rolls back command soft effects when self-resolution fails', () => {
  const G = makeState();
  G.hands['0'] = [
    {
      id: 'command-play',
      title: 'Command',
      category: 'COMMAND',
      effects: [{ resource: 'time', value: -1 }],
    },
  ];
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
    snapshotResourcesForStats: () => ({
      '0': { ...G.resources['0'] },
      '1': { ...G.resources['1'] },
    }),
  });

  const result = playCardHandler(deps, args, 'command-play', ['time']);

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.resources['0'].time, 1);
  assert.equal(G.resources['1'].time, 1);
  assert.equal(G.discard.length, 0);
});

test('playCardHandler rolls back VVNZ promotion when effects fail', () => {
  const G = makeState();
  G.resources['0'] = { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 };
  G.players['0'].resources = { ...G.resources['0'] };
  G.hands['0'] = [
    {
      id: 'vvnz-play',
      title: 'VVNZ',
      category: 'VVNZ',
      grantRank: 'soldier',
      effects: [{ resource: 'time', value: 1 }],
    },
  ];
  G.players['0'].hand = G.hands['0'];
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'play' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
    events: { setStage: () => undefined },
  };
  const deps = makeDeps({
    getActiveRanks: () =>
      [{ id: 'recruit', requirement: {}, cost: {}, bonus: {} }, { id: 'soldier', requirement: {}, cost: {}, bonus: {} }] as never,
    applyCardEffects: () => false,
    snapshotResourcesForStats: () => ({
      '0': { ...G.resources['0'] },
      '1': { ...G.resources['1'] },
    }),
  });

  const result = playCardHandler(deps, args, 'vvnz-play');

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.ranks['0'], 'recruit');
  assert.equal(G.hands['0'].length, 1);
  assert.equal(G.discard.length, 0);
});

test('playLegendaryCardHandler rolls back special effects when card effects fail', () => {
  const G = makeState();
  G.legendaryHands['0'] = [
    {
      id: 'legendary-03',
      title: 'Legendary',
      category: 'LEGENDARY',
      effects: [],
    },
  ];
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'play' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
  };
  const deps = makeDeps({
    applyCardEffects: () => false,
    snapshotResourcesForStats: () => ({
      '0': { ...G.resources['0'] },
      '1': { ...G.resources['1'] },
    }),
  });

  const result = playLegendaryCardHandler(deps, args, 'legendary-03');

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.extraHandPlayTokens['0'], 0);
  assert.equal(G.legendaryHands['0'].length, 1);
  assert.equal(G.legendaryDiscard.length, 0);
});

test('playLegendaryCardHandler rejects legendary play outside acting player turn', () => {
  const G = makeState();
  G.legendaryHands['0'] = [
    {
      id: 'legendary-03',
      title: 'Legendary',
      category: 'LEGENDARY',
      effects: [],
    },
  ];
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '1',
      activePlayers: { '0': 'play', '1': 'play' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
  };

  const result = playLegendaryCardHandler(makeDeps(), args, 'legendary-03');

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.legendaryHands['0'].length, 1);
  assert.equal(G.legendaryDiscard.length, 0);
  assert.equal(G.extraHandPlayTokens['0'], 0);
});

test('playLegendaryCardHandler allows legendary play during draw stage of own turn', () => {
  const G = makeState();
  G.legendaryHands['0'] = [
    {
      id: 'legendary-03',
      title: 'Legendary',
      category: 'LEGENDARY',
      effects: [],
    },
  ];
  let nextStage = '';
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'draw' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
    events: {
      setStage: (stage: string) => {
        nextStage = stage;
      },
    },
  };

  const result = playLegendaryCardHandler(
    makeDeps({
      applyCardEffects: () => true,
    }),
    args,
    'legendary-03',
  );

  assert.equal(result, undefined);
  assert.equal(nextStage, 'draw');
  assert.equal(G.legendaryHands['0'].length, 0);
  assert.equal(G.legendaryDiscard.length, 1);
});

test('playLegendaryCardHandler keeps current turn active when card causes future skip', () => {
  const G = makeState();
  G.legendaryHands['0'] = [
    {
      id: 'legendary-11',
      title: 'Legendary Skip',
      category: 'LEGENDARY',
      effects: [{ resource: 'tech', value: -2 }],
    },
  ];
  let ended = false;
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'play' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
    events: {
      endTurn: () => {
        ended = true;
      },
    },
  };

  const result = playLegendaryCardHandler(
    makeDeps({
      applyCardEffects: (state: JojGameState, playerID: string) => {
        state.resources[playerID].tech = 0;
        state.skippedTurnCounts = {
          ...(state.skippedTurnCounts ?? {}),
          [playerID]: 1,
        };
        return true;
      },
      snapshotResourcesForStats: () => ({
        '0': { ...G.resources['0'] },
        '1': { ...G.resources['1'] },
      }),
    }),
    args,
    'legendary-11',
  );

  assert.equal(result, undefined);
  assert.equal(ended, false);
  assert.equal(G.skippedTurnCounts?.['0'], 1);
  assert.equal(G.legendaryHands['0'].length, 0);
  assert.equal(G.legendaryDiscard.at(-1)?.id, 'legendary-11');
});

test('playLegendaryCardHandler keeps draw stage and does not end turn when played legendary adds future skip', () => {
  const G = makeState();
  G.legendaryHands['0'] = [
    {
      id: 'legendary-11',
      title: 'Legendary Skip',
      category: 'LEGENDARY',
      effects: [{ resource: 'tech', value: -2 }],
    },
  ];
  let ended = false;
  let nextStage = '';
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'draw' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
    events: {
      endTurn: () => {
        ended = true;
      },
      setStage: (stage: string) => {
        nextStage = stage;
      },
    },
  };

  const result = playLegendaryCardHandler(
    makeDeps({
      applyCardEffects: (state: JojGameState, playerID: string) => {
        state.resources[playerID].tech = 0;
        state.skippedTurnCounts = {
          ...(state.skippedTurnCounts ?? {}),
          [playerID]: 1,
        };
        return true;
      },
      snapshotResourcesForStats: () => ({
        '0': { ...G.resources['0'] },
        '1': { ...G.resources['1'] },
      }),
    }),
    args,
    'legendary-11',
  );

  assert.equal(result, undefined);
  assert.equal(ended, false);
  assert.equal(nextStage, 'draw');
  assert.equal(G.skippedTurnCounts?.['0'], 1);
  assert.equal(G.legendaryHands['0'].length, 0);
  assert.equal(G.legendaryDiscard.at(-1)?.id, 'legendary-11');
});

test('playLegendaryCardHandler applies legendary-09 by card effects without resource selection', () => {
  const G = makeState();
  G.legendaryHands['0'] = [
    {
      id: 'legendary-09',
      title: 'Вода “ПроZORRO”',
      category: 'LEGENDARY',
      effects: [{ resource: 'discipline', value: 1 }],
    },
  ];
  let nextStage = '';
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'play' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
    events: {
      setStage: (stage: string) => {
        nextStage = stage;
      },
    },
  };

  const result = playLegendaryCardHandler(
    makeDeps({
      applyCardEffects: (state: JojGameState, playerID: string, effects) => {
        for (const effect of effects) {
          if (effect.resource === 'rank') continue;
          state.resources[playerID][effect.resource] += effect.value;
        }
        return true;
      },
      snapshotResourcesForStats: () => ({
        '0': { ...G.resources['0'] },
        '1': { ...G.resources['1'] },
      }),
    }),
    args,
    'legendary-09',
  );

  assert.equal(result, undefined);
  assert.equal(G.resources['0'].discipline, 2);
  assert.equal(nextStage, 'play');
  assert.equal(G.legendaryHands['0'].length, 0);
  assert.equal(G.legendaryDiscard.at(-1)?.id, 'legendary-09');
});

test('playLegendaryCardHandler applies legendary-06 selected resource and grants discipline to other players', () => {
  const G = makeState();
  G.playerNames['2'] = 'P3';
  G.players['2'] = {
    hand: [],
    rankId: 'recruit',
    resources: { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
  };
  G.hands['2'] = [];
  G.legendaryHands['2'] = [];
  G.ranks['2'] = 'recruit';
  G.resources['2'] = {
    time: 1,
    reputation: 1,
    discipline: 1,
    documents: 1,
    tech: 1,
  };
  G.promotedThisTurn['2'] = false;
  G.lyapScandalShieldUntilTurn['2'] = 0;
  G.extraHandPlayTokens['2'] = 0;
  G.sukhpayZsuWatchUntilTurn['2'] = 0;
  G.sukhpayZsuPendingBonus['2'] = false;
  G.legendaryHands['0'] = [
    {
      id: 'legendary-06',
      title: 'Статуя Святого ТОРа',
      category: 'LEGENDARY',
      effects: [],
    },
  ];
  let nextStage = '';
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'play' },
      turn: 1,
      numPlayers: 3,
    },
    playerID: '0',
    events: {
      setStage: (stage: string) => {
        nextStage = stage;
      },
    },
  };

  const result = playLegendaryCardHandler(
    makeDeps({
      snapshotResourcesForStats: () => ({
        '0': { ...G.resources['0'] },
        '1': { ...G.resources['1'] },
        '2': { ...G.resources['2'] },
      }),
    }),
    args,
    'legendary-06',
    undefined,
    'tech',
  );

  assert.equal(result, undefined);
  assert.equal(G.resources['0'].tech, 4);
  assert.equal(G.resources['1'].discipline, 2);
  assert.equal(G.resources['1'].documents, 1);
  assert.equal(G.resources['2'].discipline, 2);
  assert.equal(G.resources['2'].documents, 1);
  assert.equal(nextStage, 'play');
  assert.equal(G.legendaryHands['0'].length, 0);
  assert.equal(G.legendaryDiscard.at(-1)?.id, 'legendary-06');
});

test('promoteHandler moves player to end stage after successful promotion', () => {
  const G = makeState();
  let nextStage = '';
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'play' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
    events: {
      setStage: (stage: string) => {
        nextStage = stage;
      },
    },
  };

  const result = promoteHandler(
    makeDeps({
      promoteRank: (state: JojGameState, playerID: string) => {
        state.ranks[playerID] = 'soldier';
        state.promotedThisTurn[playerID] = true;
        return true;
      },
      getActiveRanks: () =>
        [{ id: 'recruit' }, { id: 'soldier', cost: {}, bonus: {} }] as never,
      buildPromotionSystemMessage: () => '',
    }),
    args,
  );

  assert.equal(result, undefined);
  assert.equal(nextStage, 'end');
});

test('playCardHandler rejects VVNZ when player already received promotion this turn', () => {
  const G = makeState();
  G.promotedThisTurn['0'] = true;
  G.hands['0'] = [
    {
      id: 'vvnz-blocked',
      title: 'VVNZ',
      category: 'VVNZ',
      grantRank: 'soldier',
      effects: [],
    },
  ];
  G.players['0'].hand = G.hands['0'];
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'play' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
    events: { setStage: () => undefined },
  };

  const result = playCardHandler(
    makeDeps({
      getActiveRanks: () =>
        [{ id: 'recruit', requirement: {}, cost: {}, bonus: {} }, { id: 'soldier', requirement: {}, cost: {}, bonus: {} }] as never,
      applyCardEffects: () => true,
    }),
    args,
    'vvnz-blocked',
  );

  assert.equal(result, 'INVALID_MOVE');
  assert.equal(G.hands['0'].length, 1);
  assert.equal(G.discard.length, 0);
});

test('playCardHandler applies VVNZ with any two resources, grants rank bonus, and marks next turn skip', () => {
  const G = makeState();
  G.resources['0'] = { time: 0, reputation: 1, discipline: 0, documents: 1, tech: 0 };
  G.players['0'].resources = { ...G.resources['0'] };
  G.hands['0'] = [
    {
      id: 'vvnz-pay',
      title: 'VVNZ',
      category: 'VVNZ',
      grantRank: 'soldier',
      effects: [],
    },
  ];
  G.players['0'].hand = G.hands['0'];
  const args: MoveArgs = {
    G,
    ctx: {
      currentPlayer: '0',
      activePlayers: { '0': 'play' },
      turn: 1,
      numPlayers: 2,
    },
    playerID: '0',
    events: { setStage: () => undefined },
  };

  const result = playCardHandler(
    makeDeps({
      getActiveRanks: () =>
        [
          { id: 'recruit', requirement: {}, cost: {}, bonus: {} },
          { id: 'soldier', requirement: { reputation: 3, discipline: 2 }, cost: {}, bonus: { discipline: 1 } },
        ] as never,
      applyCardEffects: () => true,
      snapshotResourcesForStats: () => ({
        '0': { ...G.resources['0'] },
        '1': { ...G.resources['1'] },
      }),
    }),
    args,
    'vvnz-pay',
    ['documents', 'reputation'],
  );

  assert.equal(result, undefined);
  assert.equal(G.ranks['0'], 'soldier');
  assert.equal(G.resources['0'].reputation, 0);
  assert.equal(G.resources['0'].documents, 0);
  assert.equal(G.resources['0'].discipline, 1);
  assert.equal(G.skippedTurnCounts?.['0'], 1);
  assert.equal(G.discard.at(-1)?.id, 'vvnz-pay');
});

test('playCardHandler keeps current turn active when played card causes future skip', () => {
  const G = makeState();
  G.hands['0'] = [
    {
      id: 'support-skip',
      title: 'Support Skip',
      category: 'SUPPORT',
      effects: [{ resource: 'tech', value: -2 }],
    },
  ];
  G.players['0'].hand = G.hands['0'];
  let ended = false;
  let nextStage = '';
  const args: MoveArgs = {
    G,
    ctx: { currentPlayer: '0', activePlayers: { '0': 'play' }, turn: 1 },
    playerID: '0',
    events: {
      endTurn: () => {
        ended = true;
      },
      setStage: (stage: string) => {
        nextStage = stage;
      },
    },
  };

  const result = playCardHandler(
    makeDeps({
      applyCardEffects: (state: JojGameState, playerID: string) => {
        state.resources[playerID].tech = 0;
        state.skippedTurnCounts = {
          ...(state.skippedTurnCounts ?? {}),
          [playerID]: 1,
        };
        return true;
      },
      snapshotResourcesForStats: () => ({
        '0': { ...G.resources['0'] },
        '1': { ...G.resources['1'] },
      }),
    }),
    args,
    'support-skip',
  );

  assert.equal(result, undefined);
  assert.equal(ended, false);
  assert.equal(nextStage, 'end');
  assert.equal(G.skippedTurnCounts?.['0'], 1);
  assert.equal(G.hands['0'].length, 0);
  assert.equal(G.discard.at(-1)?.id, 'support-skip');
});
