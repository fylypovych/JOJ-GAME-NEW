import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLegendaryAbility } from '../src/game/legendaryAbilities';
import { createGameRuntimeHelpers } from '../src/game/gameRuntimeHelpers';
import { jojGame } from '../src/game/jojGame';
import type { CardDefinition, ResourceKey } from '../src/game/types';
import { makeDeps, makeState } from './moveSafety.helpers';

const resourceKeys = ['time', 'reputation', 'discipline', 'documents', 'tech'] as const;
const ctx = { currentPlayer: '0', playOrder: ['0', '1'], turn: 5, numPlayers: 2 };

test('Sukhpay grants its conditional discipline when a scandal was played this turn', () => {
  const G = makeState();
  G.appliedEffectLog = [{
    id: 'scandal:1:0:1', sourceCardId: 'scandal-1', sourceCardTitle: 'Scandal',
    sourceCategory: 'SCANDAL', sourcePlayerID: '1', targetPlayerID: '0',
    summary: { resources: {}, rank: 0 }, createdAtTurn: 5,
  }];

  const result = applyLegendaryAbility({
    d: makeDeps(), G, ctx, playerID: '0',
    card: { id: 'legendary-05', title: 'Sukhpay', category: 'LEGENDARY', effects: [] },
  });

  assert.notEqual(result, 'INVALID_MOVE');
  assert.equal(G.resources['0'].discipline, 2);
  assert.equal(G.sukhpayZsuPendingBonus['0'], false);
});

test('Sukhpay reacts to a scandal played later by its owner in the same turn', () => {
  const G = makeState();
  G.sukhpayZsuPendingBonus['0'] = true;
  G.sukhpayZsuWatchUntilTurn['0'] = 5;
  const helpers = createGameRuntimeHelpers({
    resourceKeys,
    resourceLabelsUk: Object.fromEntries(resourceKeys.map((key) => [key, key])) as Record<ResourceKey, string>,
    getActiveRanks: () => [], getTopRankId: () => 'general', resolveRandomRankImage: () => undefined,
    nextSystemMessageSeq: () => 1, appendChat: () => undefined, getPlayerLabel: (_state, pid) => pid,
    clampNonNegativeResources: () => undefined, syncPlayerState: () => undefined,
    hasResources: () => true, planReplacementResources: () => [],
  });

  helpers.triggerSukhpayZsuOnScandal(G, { turn: 5 } as never, '0');

  assert.equal(G.resources['0'].discipline, 2);
  assert.equal(G.sukhpayZsuPendingBonus['0'], false);
});

test('Neptune applies the selected resource symmetrically', () => {
  const G = makeState();
  const card: CardDefinition = { id: 'legendary-17', title: 'Neptune', category: 'LEGENDARY', effects: [] };

  const result = applyLegendaryAbility({
    d: makeDeps(), G, ctx, playerID: '0', card, selectedResource: 'tech',
  });

  assert.notEqual(result, 'INVALID_MOVE');
  assert.equal(G.resources['0'].tech, 2);
  assert.equal(G.resources['1'].tech, 0);
});

test('Kotieika seat-limit override expires at the next own turn', () => {
  const G = makeState();
  G.ignoreSeatLimitForPromotionUntilTurn = { '0': 3 };
  const onBegin = (jojGame.turn as unknown as { onBegin: (args: unknown) => void }).onBegin;

  onBegin({
    G,
    ctx: { currentPlayer: '0', playOrder: ['0', '1'], turn: 3, numPlayers: 2 },
    events: { setActivePlayers: () => undefined, endTurn: () => undefined },
  });

  assert.equal(G.ignoreSeatLimitForPromotionUntilTurn['0'], undefined);
});

test('unused extra hand play expires at the next own turn', () => {
  const G = makeState();
  G.extraHandPlayTokens['0'] = 1;
  const onBegin = (jojGame.turn as unknown as { onBegin: (args: unknown) => void }).onBegin;

  onBegin({
    G,
    ctx: { currentPlayer: '0', playOrder: ['0', '1'], turn: 3, numPlayers: 2 },
    events: { setActivePlayers: () => undefined, endTurn: () => undefined },
  });

  assert.equal(G.extraHandPlayTokens['0'], 0);
});

test('VVNZ skip is logged with its real reason', () => {
  const G = makeState();
  G.skippedTurnCounts = { '0': 1, '1': 0 };
  G.vvnzSkippedTurnCounts = { '0': 1, '1': 0 };
  const onBegin = (jojGame.turn as unknown as { onBegin: (args: unknown) => void }).onBegin;
  let ended = false;

  onBegin({
    G,
    ctx: { currentPlayer: '0', playOrder: ['0', '1'], turn: 4, numPlayers: 2 },
    events: { setActivePlayers: () => undefined, endTurn: () => { ended = true; } },
  });

  assert.equal(ended, true);
  assert.equal(G.skippedTurnCounts['0'], 0);
  assert.equal(G.vvnzSkippedTurnCounts['0'], 0);
  assert.match(G.chat.at(-1)?.text ?? '', /ВВНЗ/);
  assert.equal(G.chat.at(-1)?.eventKind, 'skip');
});
