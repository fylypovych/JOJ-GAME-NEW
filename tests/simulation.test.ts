import test from 'node:test';
import assert from 'node:assert/strict';
import { runGameSimulationsWithDeps } from '../src/game/simulation';
import { calculateSimulationTurnLimit } from '../src/game/simulationSetup';
import type { SimulationDeps } from '../src/game/simulation';
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
    hasPlayableCardsByInventory: () => false,
    getWinner: (_G: JojGameState) => undefined,
    startingHandSize: 0,
    startingLegendaryHandSize: 0,
  }, 2, 1, 600);

  assert.equal(report.summary.stalled, 0);
  assert.ok(report.summary.avgTurns <= 3, `expected quick finish, got ${report.summary.avgTurns}`);
  assert.equal(report.summary.scoreWins, 1);
});

test('simulation report stores deck mode flags', () => {
  const deps: SimulationDeps = {
    resourceKeys,
    shuffle: <T>(items: T[]) => [...items],
    cloneCard: (card: CardDefinition) => ({ ...card, effects: card.effects ? [...card.effects] : undefined }),
    getSharedDeckTemplate: () => ({
      deck: [{ id: 'support-x', title: 'S', category: 'SUPPORT', effects: [{ resource: 'time', value: 1 }] } as CardDefinition],
      legendaryDeck: [{ id: 'legendary-03', title: 'L', category: 'LEGENDARY', effects: [] }],
      rankTrack: [],
      modules: [],
      gameSetup: {
        optionalMainDeckModuleIds: [],
        legendaryDeckMode: 'separate',
      },
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
    hasPlayableCardsByInventory: () => false,
    getWinner: () => undefined,
    startingHandSize: 1,
    startingLegendaryHandSize: 1,
  };

  const mainOnly = runGameSimulationsWithDeps(deps, 2, 1, 40, { useMainDeck: true, useLegendaryDeck: false });
  assert.equal(mainOnly.input.useMainDeck, true);
  assert.equal(mainOnly.input.useLegendaryDeck, false);
  assert.equal(mainOnly.input.gameMode, 'simplified');

  const bothOff = runGameSimulationsWithDeps(deps, 2, 1, 40, { useMainDeck: false, useLegendaryDeck: false });
  assert.equal(bothOff.input.useMainDeck, false);
  assert.equal(bothOff.input.useLegendaryDeck, false);
  assert.equal(bothOff.input.gameMode, 'simplified');
  assert.equal(bothOff.summary.stalled, 0);

  const standardPlus = runGameSimulationsWithDeps(deps, 2, 1, 40, { gameMode: 'standard_plus' });
  assert.equal(standardPlus.input.gameMode, 'standard_plus');
  assert.equal(standardPlus.input.useMainDeck, true);
  assert.equal(standardPlus.input.useLegendaryDeck, true);
});

test('simulation forces simplified mode when legendary deck mode is merged', () => {
  const deps: SimulationDeps = {
    resourceKeys,
    shuffle: <T>(items: T[]) => [...items],
    cloneCard: (card: CardDefinition) => ({ ...card, effects: card.effects ? [...card.effects] : undefined }),
    getSharedDeckTemplate: () => ({
      deck: [{ id: 'support-x', title: 'S', category: 'SUPPORT', effects: [{ resource: 'time', value: 1 }] } as CardDefinition],
      legendaryDeck: [{ id: 'legendary-03', title: 'L', category: 'LEGENDARY', effects: [] }],
      rankTrack: [],
      modules: [],
      gameSetup: {
        optionalMainDeckModuleIds: [],
        legendaryDeckMode: 'merged',
      },
    }),
    getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier', victory: true }],
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
    hasPlayableCardsByInventory: () => false,
    getWinner: () => undefined,
    startingHandSize: 0,
    startingLegendaryHandSize: 0,
  };

  const report = runGameSimulationsWithDeps(deps, 2, 1, 40, {
    gameMode: 'standard_plus',
    gameSetup: { legendaryDeckMode: 'merged' },
  });

  assert.equal(report.input.gameMode, 'simplified');
  assert.equal(report.input.useMainDeck, true);
  assert.equal(report.input.useLegendaryDeck, false);
});

test('simulation reports seat bias issue when win rates diverge strongly', () => {
  const deps: SimulationDeps = {
    resourceKeys,
    shuffle: <T>(items: T[]) => [...items],
    cloneCard: (card: CardDefinition) => ({ ...card, effects: card.effects ? [...card.effects] : undefined }),
    getSharedDeckTemplate: () => ({ deck: [], legendaryDeck: [] }),
    getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier', victory: true }],
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
    hasPlayableCardsByInventory: () => false,
    getWinner: (G: JojGameState) => Object.keys(G.players)[0],
    startingHandSize: 0,
    startingLegendaryHandSize: 0,
  };

  const report = runGameSimulationsWithDeps(deps, 2, 10, 40);

  assert.ok(report.issues.some((line) => line.includes('перевага порядку ходу')));
});

test('simulation reports missing rank wins when nobody can reach top rank', () => {
  const deps: SimulationDeps = {
    resourceKeys,
    shuffle: <T>(items: T[]) => [...items],
    cloneCard: (card: CardDefinition) => ({ ...card, effects: card.effects ? [...card.effects] : undefined }),
    getSharedDeckTemplate: () => ({ deck: [], legendaryDeck: [] }),
    getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier', victory: true }],
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
    hasPlayableCardsByInventory: () => false,
    getWinner: (G: JojGameState) => Object.keys(G.players)[0],
    startingHandSize: 0,
    startingLegendaryHandSize: 0,
  };

  const report = runGameSimulationsWithDeps(deps, 2, 3, 40);

  assert.equal(report.summary.rankWins, 0);
  assert.ok(report.issues.some((line) => line.includes('не зафіксовано перемог')));
});

test('simulation tracks average passes when no hand plays happen', () => {
  const deps: SimulationDeps = {
    resourceKeys,
    shuffle: <T>(items: T[]) => [...items],
    cloneCard: (card: CardDefinition) => ({ ...card, effects: card.effects ? [...card.effects] : undefined }),
    getSharedDeckTemplate: () => ({ deck: [], legendaryDeck: [] }),
    getActiveRanks: () => [{ id: 'recruit' }, { id: 'soldier', victory: true }],
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
    hasPlayableCardsByInventory: () => false,
    getWinner: () => undefined,
    startingHandSize: 0,
    startingLegendaryHandSize: 0,
  };

  const report = runGameSimulationsWithDeps(deps, 2, 1, 40);

  assert.ok(report.summary.avgPassesPerGame >= 1);
});

test('calculateSimulationTurnLimit uses round-based cap plus 13 rounds', () => {
  const G = {
    deck: Array.from({ length: 100 }, (_, i) => ({ id: `d${i}` })),
    legendaryDeck: Array.from({ length: 15 }, (_, i) => ({ id: `l${i}` })),
    hands: {
      '0': [{ id: 'h0' }, { id: 'h1' }],
      '1': [{ id: 'h2' }, { id: 'h3' }],
      '2': [{ id: 'h4' }, { id: 'h5' }],
      '3': [{ id: 'h6' }, { id: 'h7' }],
      '4': [{ id: 'h8' }, { id: 'h9' }],
      '5': [{ id: 'h10' }, { id: 'h11' }],
    },
    legendaryHands: {},
    discard: [],
    legendaryDiscard: [],
  } as unknown as JojGameState;

  const totalCards = 127;
  const expectedRounds = Math.ceil(totalCards / 6) + 13;
  assert.equal(calculateSimulationTurnLimit(G, 6), expectedRounds * 6);
});
