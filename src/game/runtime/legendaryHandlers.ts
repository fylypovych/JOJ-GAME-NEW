import type { CardDefinition, ResourceKey } from '../types';
import type { JojMovesDeps, MoveArgs } from '../moveTypes';
import { isDrawAutoResolutionPending, isLegendaryDraftPending } from './drawHandlers';
import { createInvalidMoveRollback } from './runtimeHelpers';

export const applyLegendaryCardEffects = (
  d: JojMovesDeps,
  args: MoveArgs,
  card: CardDefinition,
  playerID: string,
  targetPlayerID?: string,
  selectedResource?: ResourceKey,
) => {
  const playerLabel = d.getPlayerLabel(args.G, playerID);
  if (card.id === 'legendary-02') {
    const canceled = d.cancelLastLyapOrScandalForPlayer(args.G, playerID);
    return canceled.canceledCard
      ? d.legendaryTexts.budanovCanceled(playerLabel, canceled.canceledCard.title, d.effectSummaryToText(canceled.summary))
      : d.legendaryTexts.budanovNoTarget();
  }
  if (card.id === 'legendary-08') {
    const canceled = d.cancelLastScandalForPlayer(args.G, playerID);
    return canceled.canceledCard
      ? d.legendaryTexts.starlinkCanceled(playerLabel, canceled.canceledCard.title, d.effectSummaryToText(canceled.summary))
      : d.legendaryTexts.starlinkNoTarget();
  }
  if (card.id === 'legendary-05') {
    const untilTurn = d.computeShieldUntilNextOwnTurn(args.ctx, playerID);
    args.G.sukhpayZsuWatchUntilTurn[playerID] = untilTurn;
    args.G.sukhpayZsuPendingBonus[playerID] = true;
    return d.legendaryTexts.sukhpayActivated(playerLabel);
  }
  if (card.id === 'legendary-12') {
    const untilTurn = d.computeShieldUntilNextOwnTurn(args.ctx, playerID);
    args.G.lyapScandalShieldUntilTurn[playerID] = untilTurn;
    return d.legendaryTexts.grammarShield(playerLabel);
  }
  if (card.id === 'legendary-03') {
    args.G.extraHandPlayTokens[playerID] = (args.G.extraHandPlayTokens[playerID] ?? 0) + 1;
    return d.legendaryTexts.posmishkaMalyuka(playerLabel);
  }
  if (card.id === 'legendary-06') {
    if (!selectedResource || !d.resourceKeys.includes(selectedResource)) return d.INVALID_MOVE;
    args.G.resources[playerID][selectedResource] = (args.G.resources[playerID][selectedResource] ?? 0) + 3;
    Object.keys(args.G.players).filter((pid) => pid !== playerID).forEach((pid) => {
      args.G.resources[pid].documents = (args.G.resources[pid].documents ?? 0) + 1;
      d.clampNonNegativeResources(args.G.resources[pid]);
      d.syncPlayerState(args.G, pid);
    });
    d.clampNonNegativeResources(args.G.resources[playerID]);
    d.syncPlayerState(args.G, playerID);
    return d.legendaryTexts.statueTor(playerLabel, d.resourceLabelsUk[selectedResource]);
  }
  if (card.id === 'legendary-07') {
    args.G.resources[playerID].time = (args.G.resources[playerID].time ?? 0) + 2;
    args.G.resources[playerID].reputation = (args.G.resources[playerID].reputation ?? 0) + 2;
    Object.keys(args.G.players).filter((pid) => pid !== playerID).forEach((pid) => {
      args.G.resources[pid].reputation = Math.max(0, (args.G.resources[pid].reputation ?? 0) - 1);
      d.clampNonNegativeResources(args.G.resources[pid]);
      d.syncPlayerState(args.G, pid);
    });
    d.clampNonNegativeResources(args.G.resources[playerID]);
    d.syncPlayerState(args.G, playerID);
    return d.legendaryTexts.churchLeadership(playerLabel);
  }
  if (card.id === 'legendary-09') {
    if (!selectedResource || !d.resourceKeys.includes(selectedResource)) return d.INVALID_MOVE;
    const before = args.G.resources[playerID][selectedResource] ?? 0;
    const after = Math.max(before, 3);
    args.G.resources[playerID][selectedResource] = after;
    d.syncPlayerState(args.G, playerID);
    return d.legendaryTexts.waterRestore(playerLabel, d.resourceLabelsUk[selectedResource], before, after);
  }
  if (card.id === 'legendary-13') {
    const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
    const granted = d.grantSpecificRankIgnoringRequirements(args.G, playerID, 'senior_lieutenant', playerCount);
    if (!granted.ok) return d.INVALID_MOVE;
    return granted.applied
      ? d.legendaryTexts.goodPressOfficerGranted(playerLabel, d.rankNameById('senior_lieutenant'), d.resourceDeltaToText(granted.rank.bonus ?? {}))
      : d.legendaryTexts.goodPressOfficerNoChange(playerLabel, d.rankNameById(args.G.ranks[playerID]));
  }
  if (card.id === 'legendary-10') {
    if (!targetPlayerID || !(targetPlayerID in args.G.players) || targetPlayerID === playerID) return d.INVALID_MOVE;
    const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
    const demoted = d.demoteByOneRankWithSeatCheck(args.G, targetPlayerID, playerCount);
    if (!demoted.ok) return d.INVALID_MOVE;
    return d.legendaryTexts.droidDemote(d.getPlayerLabel(args.G, targetPlayerID), d.rankNameById(demoted.fromRankId), d.rankNameById(demoted.toRankId));
  }
  return '';
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
  if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
  if (isDrawAutoResolutionPending(args.G)) return d.INVALID_MOVE;
  if (args.G.gameMode === 'simplified') return d.INVALID_MOVE;
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
    text: d.buildLegendaryPlayedMessageText({ seq, playerLabel, cardTitle: card.title, specialMessage }),
  });
  return undefined;
};
