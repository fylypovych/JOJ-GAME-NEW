import type { CardDefinition, JojGameState, ResourceKey } from './types';
import { findLastAppliedEffect, markAppliedEffectCanceled, toLoggedCardDefinition } from './effectLog';

export type EffectSummary = {
  resources: Partial<Record<ResourceKey, number>>;
  rank: number;
  skipsNextTurn?: boolean;
};

type EffectsEngineDeps = {
  resourceKeys: readonly ResourceKey[];
  getActiveRanks: () => Array<{ id: string }>;
  onRankChanged?: (G: JojGameState, playerID: string, fromRankId: string, toRankId: string) => void;
};

export const createEffectsEngine = ({
  resourceKeys,
  getActiveRanks,
  onRankChanged,
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
    resources: Record<ResourceKey, number>,
    effects: CardDefinition['effects'],
  ): number => {
    if (!effects?.length) return 0;
    const tmp = { ...resources };
    let missingUnits = 0;
    effects.forEach((effect) => {
      if (effect.resource === 'rank' || effect.value >= 0) return;
      const need = Math.abs(effect.value);
      const have = Math.max(0, tmp[effect.resource] ?? 0);
      const direct = Math.min(have, need);
      tmp[effect.resource] = have - direct;
      missingUnits += (need - direct);
    });
    return missingUnits * 2;
  };

  const planReplacementResources = (
    resources: Record<ResourceKey, number>,
    effects: CardDefinition['effects'],
  ): ResourceKey[] | null => {
    if (!effects?.length) return [];
    const tmp = { ...resources };
    const plan: ResourceKey[] = [];
    for (const effect of effects) {
      if (effect.resource === 'rank' || effect.value >= 0) continue;
      const need = Math.abs(effect.value);
      const have = Math.max(0, tmp[effect.resource] ?? 0);
      const direct = Math.min(have, need);
      tmp[effect.resource] = have - direct;
      let missing = need - direct;
      while (missing > 0) {
        for (let i = 0; i < 2; i += 1) {
          const candidates = resourceKeys
            .filter((key) => key !== effect.resource && (tmp[key] ?? 0) > 0)
            .sort((a, b) => (tmp[b] ?? 0) - (tmp[a] ?? 0));
          const pick = candidates[0];
          if (!pick) return null;
          tmp[pick] = Math.max(0, (tmp[pick] ?? 0) - 1);
          plan.push(pick);
        }
        missing -= 1;
      }
    }
    return plan;
  };

  const getReplacementUnitsForCard = (
    resources: Record<ResourceKey, number>,
    card: CardDefinition,
  ): number => {
    const replacementUnits = replacementCostUnits(resources, card.effects);
    if (replacementUnits === 0) return 0;
    return planReplacementResources(resources, card.effects) ? replacementUnits : 0;
  };

  const shiftRank = (G: JojGameState, playerID: string, delta: number) => {
    if (delta === 0) return;
    const ranks = getActiveRanks();
    const currentRankId = G.ranks[playerID];
    const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
    const nextIdx = Math.max(0, Math.min(ranks.length - 1, currentRankIdx + delta));
    const nextRankId = ranks[nextIdx].id;
    G.ranks[playerID] = nextRankId;
    if (nextRankId !== currentRankId) onRankChanged?.(G, playerID, currentRankId, nextRankId);
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

  const revertSummary = (
    G: JojGameState,
    playerID: string,
    summary: EffectSummary,
  ) => {
    const resources = G.resources[playerID];
    resourceKeys.forEach((key) => {
      resources[key] = (resources[key] ?? 0) - (summary.resources[key] ?? 0);
    });
    if (summary.rank !== 0) shiftRank(G, playerID, summary.rank * -1);
    if (summary.skipsNextTurn && (G.skippedTurnCounts?.[playerID] ?? 0) > 0) {
      G.skippedTurnCounts![playerID] = Math.max(0, G.skippedTurnCounts![playerID] - 1);
    }
    clampNonNegativeResources(resources);
  };

  const applyCardEffects = (
    G: JojGameState,
    playerID: string,
    effects: CardDefinition['effects'],
    replacementResources: ResourceKey[] = [],
  ): boolean => {
    if (!effects?.length) return true;
    const playerResources = G.resources[playerID];
    const nextResources = { ...playerResources };
    const hasNegativeLoss = effects.some((effect) => effect.resource !== 'rank' && effect.value < 0);
    const autoPlan = hasNegativeLoss ? planReplacementResources(playerResources, effects) : [];
    const planned = replacementResources.length > 0
      ? [...replacementResources]
      : (autoPlan ?? []);
    let replacementIndex = 0;
    let interruptedByInsufficientLoss = false;
    const consumeReplacement = (forbidden: ResourceKey): boolean => {
      if (replacementResources.length > 0) {
        const key = planned[replacementIndex];
        if (!key) return false;
        replacementIndex += 1;
        if (key === forbidden || (nextResources[key] ?? 0) <= 0) return false;
        nextResources[key] = Math.max(0, (nextResources[key] ?? 0) - 1);
        return true;
      }
      const candidates = resourceKeys
        .filter((key) => key !== forbidden && (nextResources[key] ?? 0) > 0)
        .sort((a, b) => (nextResources[b] ?? 0) - (nextResources[a] ?? 0));
      const pick = candidates[0];
      if (!pick) return false;
      nextResources[pick] = Math.max(0, (nextResources[pick] ?? 0) - 1);
      return true;
    };

    for (const effect of effects) {
      if (effect.resource === 'rank') continue;
      if (effect.value >= 0) {
        nextResources[effect.resource] += effect.value;
        continue;
      }
      const need = Math.abs(effect.value);
      const have = Math.max(0, nextResources[effect.resource] ?? 0);
      const direct = Math.min(have, need);
      nextResources[effect.resource] = have - direct;
      let missing = need - direct;
      while (missing > 0) {
        const okFirst = consumeReplacement(effect.resource);
        const okSecond = okFirst ? consumeReplacement(effect.resource) : false;
        if (!okFirst || !okSecond) {
          if (replacementResources.length > 0) return false;
          interruptedByInsufficientLoss = true;
          break;
        }
        missing -= 1;
      }
    }

    resourceKeys.forEach((key) => {
      playerResources[key] = nextResources[key];
    });
    effects.forEach((effect) => {
      if (effect.resource === 'rank') {
        shiftRank(G, playerID, effect.value);
      }
    });
    if (interruptedByInsufficientLoss) {
      if (!G.skippedTurnCounts) G.skippedTurnCounts = {};
      G.skippedTurnCounts[playerID] = (G.skippedTurnCounts[playerID] ?? 0) + 1;
    }
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
    const beforeSkippedTurns = G.skippedTurnCounts?.[playerID] ?? 0;
    try {
      const applied = applyCardEffects(G, playerID, effects, []);
      if (applied) {
        const appliedSummary = summarizeAppliedDiff(beforeResources, G.resources[playerID], beforeRankId, G.ranks[playerID]);
        if ((G.skippedTurnCounts?.[playerID] ?? 0) > beforeSkippedTurns) appliedSummary.skipsNextTurn = true;
        return appliedSummary;
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
    const logged = findLastAppliedEffect(
      G,
      (entry) => entry.targetPlayerID === playerID && (entry.sourceCategory === 'LYAP' || entry.sourceCategory === 'SCANDAL'),
    );
    if (logged) {
      revertSummary(G, playerID, logged.summary);
      markAppliedEffectCanceled(G, logged.id);
      return { canceledCard: toLoggedCardDefinition(logged), summary: logged.summary };
    }
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
    const logged = findLastAppliedEffect(
      G,
      (entry) => entry.targetPlayerID === playerID && entry.sourceCategory === 'SCANDAL',
    );
    if (logged) {
      revertSummary(G, playerID, logged.summary);
      markAppliedEffectCanceled(G, logged.id);
      return { canceledCard: toLoggedCardDefinition(logged), summary: logged.summary };
    }
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
