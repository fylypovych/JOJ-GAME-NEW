import type { CardDefinition } from '../types';
import type { JojMovesDeps, MoveArgs } from '../moveTypes';
import { validateMoveAction } from '../actionRules';

export const discardFromHandHandler = (d: JojMovesDeps, args: MoveArgs, cardId: string) => {
  const playerID = args.playerID;
  if (!playerID) return d.INVALID_MOVE;
  if (!validateMoveAction(d, args, 'discard-from-hand')) return d.INVALID_MOVE;
  const hand = args.G.hands[playerID];
  if (hand.length <= d.HAND_LIMIT) return d.INVALID_MOVE;
  const idx = hand.findIndex((card: CardDefinition) => card.id === cardId);
  if (idx === -1) return d.INVALID_MOVE;
  const card = hand[idx];
  if (card.category === 'LYAP' || card.category === 'SCANDAL') return d.INVALID_MOVE;
  hand.splice(idx, 1);
  args.G.discard.push(card);
  d.syncPlayerState(args.G, playerID);
  d.resetNoPlayablePassStreak(args.G);
  d.resetEndGameVote(args.G);
  const seq = d.nextSystemMessageSeq(args.G);
  d.appendChat(args.G, {
    type: 'system',
    text: `🗂️ [${seq}] ${d.getPlayerLabel(args.G, playerID)} скидає «${card.title}» у скид, щоб вкластися в ліміт руки (${d.HAND_LIMIT}).`,
  });
  args.events?.setStage?.(d.PLAY_STAGE);
  return undefined;
};

export const promoteHandler = (d: JojMovesDeps, args: MoveArgs) => {
  const playerID = args.playerID;
  if (!playerID) return d.INVALID_MOVE;
  if (!validateMoveAction(d, args, 'promote')) return d.INVALID_MOVE;
  if (args.G.promotedThisTurn[playerID]) return d.INVALID_MOVE;
  const beforeResources = { ...args.G.resources[playerID] };
  const beforeResourcesGlobal = d.snapshotResourcesForStats(args.G);
  const beforeRankId = args.G.ranks[playerID];
  const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
  if (!d.promoteRank(args.G, playerID, playerCount)) return d.INVALID_MOVE;
  args.G.promotedThisTurn[playerID] = true;
  const afterRankId = args.G.ranks[playerID];
  const promotedRank = d.getActiveRanks().find((row) => row.id === afterRankId);
  const summary = d.summarizeAppliedDiff(beforeResources, args.G.resources[playerID], beforeRankId, afterRankId);
  const seq = d.nextSystemMessageSeq(args.G);
  d.appendChat(args.G, {
    type: 'system',
    text: d.buildPromotionSystemMessage(
      seq,
      d.getPlayerLabel(args.G, playerID),
      beforeRankId,
      afterRankId,
      promotedRank?.cost ?? {},
      promotedRank?.bonus ?? {},
      summary,
    ),
  });
  d.recordResourceFlowStats(args.G, beforeResourcesGlobal);
  d.resetNoPlayablePassStreak(args.G);
  d.resetEndGameVote(args.G);
  args.events?.setStage?.(d.END_STAGE);
  return undefined;
};

export const endTurnHandler = (d: JojMovesDeps, args: MoveArgs) => {
  const playerID = args.playerID;
  if (!playerID) return d.INVALID_MOVE;
  if (!validateMoveAction(d, args, 'end-turn')) return d.INVALID_MOVE;
  if ((args.G.hands[playerID]?.length ?? 0) > d.HAND_LIMIT) return d.INVALID_MOVE;
  d.incrementTurnsCompleted(args.G, playerID);
  d.resetNoPlayablePassStreak(args.G);
  d.resetEndGameVote(args.G);
  args.events?.endTurn?.();
  return undefined;
};

export const passHandler = (d: JojMovesDeps, args: MoveArgs) => {
  const playerID = args.playerID;
  if (!playerID) return d.INVALID_MOVE;
  if (!validateMoveAction(d, args, 'pass')) return d.INVALID_MOVE;
  if ((args.G.hands[playerID]?.length ?? 0) > d.HAND_LIMIT) return d.INVALID_MOVE;
  if ((args.G.deck?.length ?? 0) > 0) return d.INVALID_MOVE;
  if (d.hasPlayableCardsByInventory(args.G, playerID)) return d.INVALID_MOVE;
  d.incrementTurnsCompleted(args.G, playerID);
  if (d.shouldCountNoPlayablePass(args.G, playerID)) d.incrementNoPlayablePassStreak(args.G);
  else d.resetNoPlayablePassStreak(args.G);
  args.events?.endTurn?.();
  return undefined;
};
