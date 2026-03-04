import test from 'node:test';
import assert from 'node:assert/strict';
import { runGameSimulationsWithDeps } from '../src/game/simulation';
import type { CardDefinition, JojGameState, ResourceKey } from '../src/game/types';

const resourceKeys: readonly ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

test('simulation ends by score after no-progress round when deck is empty', () => {
  const report = runGameSimulationsWithDeps({
    resourceKeys,
    shuffle: <T>(items: T[]) => [...items],
    cloneCard: (card: CardDefinition) => ({ ...card, effects: card.effects ? [...card.effects] : undefined }),
    getSharedDeckTemplate: () => ({ deck: [], legendaryDeck: [] }),
    getActiveRanks: () => [
      { id: 'recruit' },
      { id: 'soldier' },
    ],
    getTopRankId: () => 'soldier',
    drawCards: () => {},
    drawLegendaryCards: () => {},
    syncPlayerState: () => {},
    promoteRank: () => false,
    promoteToSpecificRank: () => ({ ok: false }),
    grantSpecificRankIgnoringRequirements: () => ({ ok: false }),
    demoteByOneRankWithSeatCheck: () => ({ ok: false }),
    triggerSukhpayZsuOnScandal: () => {},
    cancelLastLyapOrScandalForPlayer: () => ({ canceledCard: null }),
    cancelLastScandalForPlayer: () => ({ canceledCard: null }),
    applyCardEffects: () => true,
    applyCardEffectsSoft: () => ({ resources: {}, rank: 0 }),
    clampNonNegativeResources: () => {},
    planReplacementResources: () => [],
    getWinner: (_G: JojGameState) => undefined,
    startingHandSize: 0,
    startingLegendaryHandSize: 0,
  }, 2, 1, 600);

  assert.equal(report.summary.stalled, 0);
  assert.ok(report.summary.avgTurns <= 3, `expected quick finish, got ${report.summary.avgTurns}`);
  assert.equal(report.summary.scoreWins, 1);
});

test('simulation report stores deck mode flags', () => {
  const deps = {
    resourceKeys,
    shuffle: <T>(items: T[]) => [...items],
    cloneCard: (card: CardDefinition) => ({ ...card, effects: card.effects ? [...card.effects] : undefined }),
    getSharedDeckTemplate: () => ({
      deck: [{ id: 'support-x', title: 'S', category: 'SUPPORT', effects: [{ resource: 'time', value: 1 }] } as CardDefinition],
      legendaryDeck: [{ id: 'legendary-03', title: 'L', category: 'NEUTRAL', effects: [] } as CardDefinition],
    }),
    getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier', victory: true }],
    getTopRankId: () => 'soldier',
    drawCards: (G: JojGameState, pid: string, amount: number) => { for (let i = 0; i < amount && G.deck.length; i += 1) G.hands[pid].push(G.deck.pop() as CardDefinition); },
    drawLegendaryCards: (G: JojGameState, pid: string, amount: number) => { for (let i = 0; i < amount && G.legendaryDeck.length; i += 1) G.legendaryHands[pid].push(G.legendaryDeck.pop() as CardDefinition); },
    syncPlayerState: (G: JojGameState, pid: string) => { G.players[pid].hand = G.hands[pid]; G.players[pid].rankId = G.ranks[pid]; G.players[pid].resources = G.resources[pid]; },
    promoteRank: () => false,
    promoteToSpecificRank: () => ({ ok: false }),
    grantSpecificRankIgnoringRequirements: () => ({ ok: false }),
    demoteByOneRankWithSeatCheck: () => ({ ok: false }),
    triggerSukhpayZsuOnScandal: () => {},
    cancelLastLyapOrScandalForPlayer: () => ({ canceledCard: null }),
    cancelLastScandalForPlayer: () => ({ canceledCard: null }),
    applyCardEffects: () => true,
    applyCardEffectsSoft: () => ({ resources: {}, rank: 0 }),
    clampNonNegativeResources: () => {},
    planReplacementResources: () => [],
    getWinner: () => undefined,
    startingHandSize: 1,
    startingLegendaryHandSize: 1,
  };

  const mainOnly = runGameSimulationsWithDeps(deps as any, 2, 1, 40, { useMainDeck: true, useLegendaryDeck: false });
  assert.equal(mainOnly.input.useMainDeck, true);
  assert.equal(mainOnly.input.useLegendaryDeck, false);
  assert.equal(mainOnly.input.gameMode, 'simplified');

  const bothOff = runGameSimulationsWithDeps(deps as any, 2, 1, 40, { useMainDeck: false, useLegendaryDeck: false });
  assert.equal(bothOff.input.useMainDeck, false);
  assert.equal(bothOff.input.useLegendaryDeck, false);
  assert.equal(bothOff.input.gameMode, 'simplified');
  assert.equal(bothOff.summary.stalled, 0);

  const standardPlus = runGameSimulationsWithDeps(deps as any, 2, 1, 40, { gameMode: 'standard_plus' });
  assert.equal(standardPlus.input.gameMode, 'standard_plus');
  assert.equal(standardPlus.input.useMainDeck, true);
  assert.equal(standardPlus.input.useLegendaryDeck, true);
});
