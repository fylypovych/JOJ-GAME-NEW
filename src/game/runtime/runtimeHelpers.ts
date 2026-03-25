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
  const beforeSkippedTurns = G.skippedTurnCounts?.[playerID] ?? 0;
  const applied = d.applyCardEffects(G, playerID, card.effects, replacementResources);
  if (!applied) return null;
  const summary = d.summarizeAppliedDiff(beforeResources, G.resources[playerID], beforeRankId, G.ranks[playerID]);
  if ((G.skippedTurnCounts?.[playerID] ?? 0) > beforeSkippedTurns) summary.skipsNextTurn = true;
  return summary;
};

export const consumeImmediateSkipForCurrentPlayer = (
  G: JojGameState,
  currentPlayerID: string | undefined,
  playerID: string,
  skippedTurnsBeforeMove: number,
) => {
  if (!currentPlayerID || currentPlayerID !== playerID) return false;
  const skippedTurnsNow = G.skippedTurnCounts?.[playerID] ?? 0;
  if (skippedTurnsNow <= skippedTurnsBeforeMove) return false;
  if (!G.skippedTurnCounts) G.skippedTurnCounts = {};
  G.skippedTurnCounts[playerID] = Math.max(0, skippedTurnsNow - 1);
  return true;
};
