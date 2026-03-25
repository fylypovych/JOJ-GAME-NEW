import type { CardDefinition, ResourceKey } from '../types';
import type { JojMovesDeps, MoveArgs, ReplacementByTarget } from '../moveTypes';
import { validateMoveAction } from '../actionRules';
import {
  executeHandCardByBehavior,
} from './playCardCategoryHandlers';
import { consumeImmediateSkipForCurrentPlayer, createInvalidMoveRollback } from './runtimeHelpers';

export const playCardHandler = (
  d: JojMovesDeps,
  args: MoveArgs,
  cardId: string,
  replacementResources: ResourceKey[] = [],
  targetPlayerID?: string,
  replacementByTarget: ReplacementByTarget = {},
) => {
  const playerID = args.playerID;
  if (!playerID) return d.INVALID_MOVE;
  if (!validateMoveAction(d, args, 'play-hand-card')) return d.INVALID_MOVE;
  const stage = args.ctx.activePlayers?.[playerID] as string | undefined;
  const usingExtraToken = (args.G.extraHandPlayTokens[playerID] ?? 0) > 0 && stage === d.END_STAGE;

  const hand = args.G.hands[playerID];
  const idx = hand.findIndex((card: CardDefinition) => card.id === cardId);
  if (idx === -1) return d.INVALID_MOVE;
  const beforeResources = d.snapshotResourcesForStats(args.G);
  const skippedTurnsBeforeMove = args.G.skippedTurnCounts?.[playerID] ?? 0;
  const invalidMove = createInvalidMoveRollback(d, args.G);
  const card = hand[idx];
  const allPlayerIDs = Object.keys(args.G.players);
  const result = executeHandCardByBehavior({
    d,
    moveArgs: args,
    playerID,
    card,
    replacementResources,
    targetPlayerID,
    replacementByTarget,
    allPlayerIDs,
    invalidMove,
  });
  if (result === d.INVALID_MOVE) return result;

  hand.splice(idx, 1);
  args.G.discard.push(card);
  d.syncPlayerState(args.G, playerID);
  d.recordResourceFlowStats(args.G, beforeResources);
  d.resetNoPlayablePassStreak(args.G);
  d.resetEndGameVote(args.G);
  if (consumeImmediateSkipForCurrentPlayer(args.G, args.ctx.currentPlayer, playerID, skippedTurnsBeforeMove)) {
    d.incrementTurnsCompleted(args.G, playerID);
    args.events?.endTurn?.();
    return undefined;
  }
  if (usingExtraToken) args.G.extraHandPlayTokens[playerID] = Math.max(0, (args.G.extraHandPlayTokens[playerID] ?? 0) - 1);
  else args.events?.setStage?.(d.END_STAGE);
  return undefined;
};
