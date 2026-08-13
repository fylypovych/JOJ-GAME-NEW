import type { CardDefinition, ResourceKey } from '../types';
import type { JojMovesDeps, MoveArgs } from '../moveTypes';
import { applyLegendaryAbility } from '../legendaryAbilities';
import { validateMoveAction } from '../actionRules';
import { createInvalidMoveRollback } from './runtimeHelpers';

export const applyLegendaryCardEffects = (
  d: JojMovesDeps,
  args: MoveArgs,
  card: CardDefinition,
  playerID: string,
  targetPlayerID?: string,
  selectedResource?: ResourceKey,
) => {
  return applyLegendaryAbility({
    d,
    G: args.G,
    ctx: args.ctx,
    card,
    playerID,
    targetPlayerID,
    selectedResource,
  });
};

export const playLegendaryCardHandler = (
  d: JojMovesDeps,
  args: MoveArgs,
  cardId: string,
  targetPlayerID?: string,
  selectedResource?: ResourceKey,
) => {
  const playerID = args.playerID;
  if (!playerID) return d.INVALID_MOVE;
  if (!validateMoveAction(d, args, 'play-legendary')) return d.INVALID_MOVE;
  const stage = args.ctx.activePlayers?.[playerID];
  const hand = args.G.legendaryHands[playerID] ?? [];
  const idx = hand.findIndex((card: CardDefinition) => card.id === cardId);
  if (idx === -1) return d.INVALID_MOVE;
  const beforeResources = d.snapshotResourcesForStats(args.G);
  const invalidMove = createInvalidMoveRollback(d, args.G);
  const card = hand[idx];
  const playerLabel = d.getPlayerLabel(args.G, playerID);
  const specialMessage = applyLegendaryCardEffects(d, args, card, playerID, targetPlayerID, selectedResource);
  if (specialMessage === d.INVALID_MOVE) return invalidMove();
  try {
    const applied = d.applyCardEffects(args.G, playerID, card.effects, []);
    if (!applied) return invalidMove();
  } catch {
    return invalidMove();
  }
  hand.splice(idx, 1);
  args.G.legendaryDiscard.push(card);
  d.syncPlayerState(args.G, playerID);
  d.recordResourceFlowStats(args.G, beforeResources);
  d.resetNoPlayablePassStreak(args.G);
  d.resetEndGameVote(args.G);
  const seq = d.nextSystemMessageSeq(args.G);
  d.appendChat(args.G, {
    type: 'system',
    eventKind: 'legendary',
    text: d.buildLegendaryPlayedMessageText({ seq, playerLabel, cardTitle: card.title, specialMessage }),
  });
  if (stage) args.events?.setStage?.(stage);
  return undefined;
};
