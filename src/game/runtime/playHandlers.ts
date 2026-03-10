import type { CardDefinition, ResourceKey } from '../types';
import type { JojMovesDeps, MoveArgs, ReplacementByTarget } from '../moveTypes';
import { isDrawAutoResolutionPending, isLegendaryDraftPending } from './drawHandlers';
import {
  handleCommandPlay,
  handleLegendaryPlayFromHand,
  handleLyapPlay,
  handleScandalPlay,
  handleSupportPlay,
  handleVvnzPlay,
  isCommandPlay,
} from './playCardCategoryHandlers';
import { createInvalidMoveRollback } from './runtimeHelpers';

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
  if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
  if (isDrawAutoResolutionPending(args.G)) return d.INVALID_MOVE;
  if (args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
  const stage = args.ctx.activePlayers?.[playerID] as string | undefined;
  const usingExtraToken = (args.G.extraHandPlayTokens[playerID] ?? 0) > 0 && stage === d.END_STAGE;
  if (!d.canPlayHandCardAtStage({
    isCurrentPlayer: args.ctx.currentPlayer === playerID,
    stage,
    extraHandPlayTokens: args.G.extraHandPlayTokens[playerID] ?? 0,
  })) return d.INVALID_MOVE;

  const hand = args.G.hands[playerID];
  const idx = hand.findIndex((card: CardDefinition) => card.id === cardId);
  if (idx === -1) return d.INVALID_MOVE;
  const beforeResources = d.snapshotResourcesForStats(args.G);
  const invalidMove = createInvalidMoveRollback(d, args.G);
  const card = hand[idx];
  const allPlayerIDs = Object.keys(args.G.players);

  if (card.category === 'LYAP') {
    const result = handleLyapPlay({ d, moveArgs: args, playerID, card, targetPlayerID, replacementResources, invalidMove });
    if (result === d.INVALID_MOVE) return result;
  } else if (card.category === 'SCANDAL') {
    const result = handleScandalPlay({ d, moveArgs: args, playerID, card, replacementByTarget, allPlayerIDs, invalidMove });
    if (result === d.INVALID_MOVE) return result;
  } else if (card.category === 'SUPPORT') {
    const result = handleSupportPlay({ d, moveArgs: args, playerID, card, replacementResources, invalidMove });
    if (result === d.INVALID_MOVE) return result;
  } else if (isCommandPlay(card)) {
    const result = handleCommandPlay({ d, moveArgs: args, playerID, card, replacementResources, allPlayerIDs, invalidMove });
    if (result === d.INVALID_MOVE) return result;
  } else if (card.category === 'VVNZ' && card.grantRank) {
    const result = handleVvnzPlay({ d, moveArgs: args, playerID, card, invalidMove });
    if (result === d.INVALID_MOVE) return result;
  } else if (card.category === 'LEGENDARY') {
    const result = handleLegendaryPlayFromHand({ d, moveArgs: args, playerID, card, targetPlayerID, replacementResources, invalidMove });
    if (result === d.INVALID_MOVE) return result;
  } else {
    try {
      const applied = d.applyCardEffects(args.G, playerID, card.effects, replacementResources);
      if (!applied) return invalidMove();
    } catch {
      return invalidMove();
    }
  }

  hand.splice(idx, 1);
  args.G.discard.push(card);
  d.syncPlayerState(args.G, playerID);
  d.recordResourceFlowStats(args.G, beforeResources);
  d.resetNoPlayablePassStreak(args.G);
  d.resetEndGameVote(args.G);
  if (usingExtraToken) args.G.extraHandPlayTokens[playerID] = Math.max(0, (args.G.extraHandPlayTokens[playerID] ?? 0) - 1);
  else args.events?.setStage?.(d.END_STAGE);
  return undefined;
};
