import type { CardDefinition, JojGameState, ResourceKey } from './types';

export type EffectSummary = {
  resources: Partial<Record<ResourceKey, number>>;
  rank: number;
};

type EffectsEngineDeps = {
  resourceKeys: readonly ResourceKey[];
  getActiveRanks: () => Array<{ id: string }>;
};

export const createEffectsEngine = ({
  resourceKeys,
  getActiveRanks,
}: EffectsEngineDeps) => {
  const hasResources = (resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>): boolean =>
    resourceKeys.every((key) => (resources[key] ?? 0) >= (cost[key] ?? 0));

  const spendResources = (resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>) => {
    resourceKeys.forEach((key) => {
      const value = Math.max(0, cost[key] ?? 0);
      if (value > 0) resources[key] -= value;
    });
  };

  const applyResourceDelta = (
    resources: Record<ResourceKey, number>,
    delta: Partial<Record<ResourceKey, number>>,
  ) => {
    resourceKeys.forEach((key) => {
      resources[key] += delta[key] ?? 0;
    });
  };

  const clampNonNegativeResources = (resources: Record<ResourceKey, number>) => {
    resourceKeys.forEach((key) => {
      if (resources[key] < 0) resources[key] = 0;
    });
  };

  const replacementCostUnits = (
    _resources: Record<ResourceKey, number>,
    _effects: CardDefinition['effects'],
  ): number => {
    void _resources;
    void _effects;
    return 0;
  };

  const planReplacementResources = (
    resources: Record<ResourceKey, number>,
    effects: CardDefinition['effects'],
  ): ResourceKey[] | null => {
    void resources;
    void effects;
    return [];
  };

  const getReplacementUnitsForCard = (
    resources: Record<ResourceKey, number>,
    card: CardDefinition,
  ): number => replacementCostUnits(resources, card.effects);

  const shiftRank = (G: JojGameState, playerID: string, delta: number) => {
    if (delta === 0) return;
    const ranks = getActiveRanks();
    const currentRankId = G.ranks[playerID];
    const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
    const nextIdx = Math.max(0, Math.min(ranks.length - 1, currentRankIdx + delta));
    G.ranks[playerID] = ranks[nextIdx].id;
  };

  const summarizeAppliedDiff = (
    beforeResources: Record<ResourceKey, number>,
    afterResources: Record<ResourceKey, number>,
    beforeRankId: string,
    afterRankId: string,
  ): EffectSummary => {
    const summary: EffectSummary = { resources: {}, rank: 0 };
    resourceKeys.forEach((key) => {
      const delta = (afterResources[key] ?? 0) - (beforeResources[key] ?? 0);
      if (delta !== 0) summary.resources[key] = delta;
    });
    const ranks = getActiveRanks();
    const from = ranks.findIndex((row) => row.id === beforeRankId);
    const to = ranks.findIndex((row) => row.id === afterRankId);
    if (from >= 0 && to >= 0) summary.rank = to - from;
    return summary;
  };

  const applyCardEffects = (
    G: JojGameState,
    playerID: string,
    effects: CardDefinition['effects'],
    replacementResources: ResourceKey[] = [],
  ): boolean => {
    if (!effects?.length) return true;
    const playerResources = G.resources[playerID];
    if (replacementResources.length !== 0) {
      return false;
    }

    effects.forEach((effect) => {
      if (effect.resource === 'rank') return;
      if (effect.value < 0) {
        playerResources[effect.resource] = Math.max(0, playerResources[effect.resource] + effect.value);
        return;
      }
      playerResources[effect.resource] += effect.value;
    });
    effects.forEach((effect) => {
      if (effect.resource === 'rank') {
        shiftRank(G, playerID, effect.value);
      }
    });
    clampNonNegativeResources(playerResources);
    return true;
  };

  const applyCardEffectsSoft = (
    G: JojGameState,
    playerID: string,
    effects: CardDefinition['effects'],
  ): EffectSummary => {
    const summary: EffectSummary = { resources: {}, rank: 0 };
    if (!effects?.length) return summary;
    const beforeResources = { ...G.resources[playerID] };
    const beforeRankId = G.ranks[playerID];
    try {
      const applied = applyCardEffects(G, playerID, effects, []);
      if (applied) {
        return summarizeAppliedDiff(beforeResources, G.resources[playerID], beforeRankId, G.ranks[playerID]);
      }
    } catch {
      // fallback to safe clamp below
    }

    const resources = G.resources[playerID];
    effects.forEach((effect) => {
      if (effect.resource === 'rank') return;
      if (effect.value < 0) {
        const next = Math.max(0, resources[effect.resource] + effect.value);
        const delta = next - resources[effect.resource];
        resources[effect.resource] = next;
        summary.resources[effect.resource] = (summary.resources[effect.resource] ?? 0) + delta;
        return;
      }
      resources[effect.resource] += effect.value;
      summary.resources[effect.resource] = (summary.resources[effect.resource] ?? 0) + effect.value;
    });
    effects.forEach((effect) => {
      if (effect.resource === 'rank') {
        shiftRank(G, playerID, effect.value);
        summary.rank += effect.value;
      }
    });
    clampNonNegativeResources(resources);
    return summary;
  };

  const invertEffectsForCancellation = (
    effects: CardDefinition['effects'],
  ): NonNullable<CardDefinition['effects']> => (effects ?? []).map((effect) => ({
    ...effect,
    value: effect.value * -1,
  }));

  const cancelLastLyapOrScandalForPlayer = (
    G: JojGameState,
    playerID: string,
  ): { canceledCard: CardDefinition | null; summary: EffectSummary } => {
    for (let i = G.discard.length - 1; i >= 0; i -= 1) {
      const card = G.discard[i];
      if (!card || (card.category !== 'LYAP' && card.category !== 'SCANDAL')) continue;
      const beforeResources = { ...G.resources[playerID] };
      const beforeRankId = G.ranks[playerID];
      try {
        const applied = applyCardEffects(G, playerID, invertEffectsForCancellation(card.effects), []);
        if (!applied) return { canceledCard: null, summary: { resources: {}, rank: 0 } };
      } catch {
        return { canceledCard: null, summary: { resources: {}, rank: 0 } };
      }
      const summary = summarizeAppliedDiff(beforeResources, G.resources[playerID], beforeRankId, G.ranks[playerID]);
      return { canceledCard: card, summary };
    }
    return { canceledCard: null, summary: { resources: {}, rank: 0 } };
  };

  const cancelLastScandalForPlayer = (
    G: JojGameState,
    playerID: string,
  ): { canceledCard: CardDefinition | null; summary: EffectSummary } => {
    for (let i = G.discard.length - 1; i >= 0; i -= 1) {
      const card = G.discard[i];
      if (!card || card.category !== 'SCANDAL') continue;
      const beforeResources = { ...G.resources[playerID] };
      const beforeRankId = G.ranks[playerID];
      try {
        const applied = applyCardEffects(G, playerID, invertEffectsForCancellation(card.effects), []);
        if (!applied) return { canceledCard: null, summary: { resources: {}, rank: 0 } };
      } catch {
        return { canceledCard: null, summary: { resources: {}, rank: 0 } };
      }
      const summary = summarizeAppliedDiff(beforeResources, G.resources[playerID], beforeRankId, G.ranks[playerID]);
      return { canceledCard: card, summary };
    }
    return { canceledCard: null, summary: { resources: {}, rank: 0 } };
  };

  return {
    hasResources,
    spendResources,
    applyResourceDelta,
    clampNonNegativeResources,
    planReplacementResources,
    getReplacementUnitsForCard,
    applyCardEffects,
    applyCardEffectsSoft,
    cancelLastLyapOrScandalForPlayer,
    cancelLastScandalForPlayer,
    summarizeAppliedDiff,
  };
};
