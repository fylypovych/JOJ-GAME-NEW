import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffectsEngine } from '../src/game/effectsEngine';
import { appendAppliedEffectLog } from '../src/game/effectLog';
import type { JojGameState, ResourceKey } from '../src/game/types';

const makeState = (): JojGameState => ({
  gameMode: 'standard',
  deck: [],
  discard: [],
  legendaryDeck: [],
  legendaryDiscard: [],
  legendaryDraftCompleted: {},
  systemMessageSeq: 0,
  playerNames: { '0': '' },
  chat: [],
  players: {
    '0': { hand: [], rankId: 'recruit', resources: { time: 1, reputation: 0, discipline: 3, documents: 1, tech: 0 } },
  },
  hands: { '0': [] },
  legendaryHands: { '0': [] },
  ranks: { '0': 'recruit' },
  rankImageByPlayer: {},
  resources: {
    '0': { time: 1, reputation: 0, discipline: 3, documents: 1, tech: 0 },
  },
  promotedThisTurn: { '0': false },
  lyapScandalShieldUntilTurn: { '0': 0 },
  extraHandPlayTokens: { '0': 0 },
  sukhpayZsuWatchUntilTurn: { '0': 0 },
  sukhpayZsuPendingBonus: { '0': false },
  gameStats: {
    turnsCompleted: 0,
    resourcesGainedTotal: 0,
    resourcesLostTotal: 0,
    resourcesGainedByType: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
    resourcesLostByType: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
    lyapsPlayedOnOthers: 0,
    scandalsPlayedOnOthers: 0,
  },
  noPlayablePassStreak: 0,
  endGameVote: { active: false, requestedBy: null, votes: {} },
  pendingDrawAutoResolution: null,
});

const engine = createEffectsEngine({
  resourceKeys: ['time', 'reputation', 'discipline', 'documents', 'tech'] as const,
  getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier' }, { id: 'captain' }],
});

test('planReplacementResources spends two other units per missing unit', () => {
  const plan = engine.planReplacementResources(
    { time: 1, reputation: 0, discipline: 3, documents: 1, tech: 0 },
    [{ resource: 'time', value: -2 }],
  );
  assert.deepEqual(plan, ['discipline', 'discipline']);
});

test('applyCardEffects rejects invalid explicit replacement sequence', () => {
  const G = makeState();
  const ok = engine.applyCardEffects(
    G,
    '0',
    [{ resource: 'time', value: -2 }],
    ['discipline'],
  );
  assert.equal(ok, false);
  assert.equal(G.resources['0'].time, 1);
  assert.equal(G.resources['0'].discipline, 3);
});

test('applyCardEffectsSoft clamps losses safely when strict resolution fails', () => {
  const G = makeState();
  const summary = engine.applyCardEffectsSoft(G, '0', [{ resource: 'reputation', value: -2 }]);
  assert.equal(G.resources['0'].reputation, 0);
  assert.equal(summary.resources.reputation ?? 0, 0);
});

test('applyCardEffects applies rank deltas after resources', () => {
  const G = makeState();
  const ok = engine.applyCardEffects(G, '0', [{ resource: 'rank', value: 1 }], []);
  assert.equal(ok, true);
  assert.equal(G.ranks['0'], 'soldier');
});

test('applyCardEffects auto-replaces missing resources when no explicit replacement is provided', () => {
  const G = makeState();
  const ok = engine.applyCardEffects(
    G,
    '0',
    [{ resource: 'time', value: -2 }],
  );
  assert.equal(ok, true);
  assert.equal(G.resources['0'].time, 0);
  assert.equal(G.resources['0'].discipline, 1);
});

test('cancelLastScandalForPlayer reverts last scandal effects for the player', () => {
  const G = makeState();
  G.discard.push({
    id: 'scandal-x',
    title: 'Scandal X',
    category: 'SCANDAL',
    effects: [{ resource: 'documents', value: -1 }],
  });
  G.resources['0'].documents = 0;

  const result = engine.cancelLastScandalForPlayer(G, '0');

  assert.equal(result.canceledCard?.id, 'scandal-x');
  assert.equal(G.resources['0'].documents, 1);
  assert.equal(result.summary.resources.documents, 1);
});

test('cancelLastScandalForPlayer prefers exact applied effect log when available', () => {
  const G = makeState();
  G.resources['0'].documents = 0;
  appendAppliedEffectLog(G, {
    sourceCardId: 'scandal-logged',
    sourceCardTitle: 'Logged Scandal',
    sourceCategory: 'SCANDAL',
    sourcePlayerID: '1',
    targetPlayerID: '0',
    summary: { resources: { documents: -1 }, rank: 0 },
    createdAtTurn: 3,
  });

  const result = engine.cancelLastScandalForPlayer(G, '0');

  assert.equal(result.canceledCard?.id, 'scandal-logged');
  assert.equal(G.resources['0'].documents, 1);
  assert.equal(G.appliedEffectLog?.[0]?.canceled, true);
});
