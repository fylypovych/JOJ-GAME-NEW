import type { CardDefinition, JojGameState, ResourceKey } from '../types';
import type { JojMovesDeps } from '../moveTypes';
import { cloneGameState, restoreGameState } from '../gameStateUtils';

export const createInvalidMoveRollback = (
  d: JojMovesDeps,
  G: JojGameState,
) => {
  const rollbackSnapshot = cloneGameState(G);
  return () => {
    restoreGameState(G, rollbackSnapshot);
    return d.INVALID_MOVE;
  };
};

export const summarizeCardEffectForPlayer = (
  d: JojMovesDeps,
  G: JojGameState,
  playerID: string,
  card: CardDefinition,
  replacementResources: ResourceKey[] = [],
) => {
  const beforeResources = { ...G.resources[playerID] };
  const beforeRankId = G.ranks[playerID];
  const applied = d.applyCardEffects(G, playerID, card.effects, replacementResources);
  if (!applied) return null;
  return d.summarizeAppliedDiff(beforeResources, G.resources[playerID], beforeRankId, G.ranks[playerID]);
};
