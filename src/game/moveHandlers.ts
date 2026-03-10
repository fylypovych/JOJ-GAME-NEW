import type { CardDefinition, JojGameState, ResourceKey } from './types';
import type { JojMovesDeps, MoveArgs, ReplacementByTarget } from './moveTypes';
import { isCommandCategory } from './cardRules';
import { cloneGameState, restoreGameState } from './gameStateUtils';

export const isLegendaryDraftPending = (G: JojGameState) => {
  if (G.gameMode !== 'standard_plus') return false;
  const playerIDs = Object.keys(G.players ?? {});
  if (playerIDs.length === 0) return false;
  return playerIDs.some((pid) => G.legendaryDraftCompleted?.[pid] !== true);
};

export const isDrawAutoResolutionPending = (G: JojGameState) => Boolean(G.pendingDrawAutoResolution);

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

export const drawCardHandler = (d: JojMovesDeps, args: MoveArgs) => {
  const playerID = args.playerID;
  if (!playerID || args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
  if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
  if (isDrawAutoResolutionPending(args.G)) return d.INVALID_MOVE;
  if (args.ctx.activePlayers?.[playerID] !== d.DRAW_STAGE) return d.INVALID_MOVE;

  const beforeResources = d.snapshotResourcesForStats(args.G);
  const rollbackSnapshot = cloneGameState(args.G);
  const invalidMove = () => {
    restoreGameState(args.G, rollbackSnapshot);
    return d.INVALID_MOVE;
  };
  const hand = args.G.hands[playerID];
  let autoPlayed = false;
  let pendingAutoResolution = false;
  const card = args.G.deck.pop();
  if (card) {
    if (card.category === 'LYAP') {
      const protectedSelf = d.isProtectedFromLyapScandal(args.G, args.ctx, playerID);
      if (protectedSelf) {
        const seq = d.nextSystemMessageSeq(args.G);
        d.appendChat(args.G, {
          type: 'system',
          text: `🛡️ [${seq}] ${d.getPlayerLabel(args.G, playerID)} витягнув «${card.title}», але щит від Грамоти скасував ЛЯП.`,
        });
        args.G.discard.push(card);
        autoPlayed = true;
      } else {
        const requiredReplacementUnits = d.getReplacementUnitsForCard(args.G.resources[playerID], card);
        if (requiredReplacementUnits > 0) {
          args.G.pendingDrawAutoResolution = { kind: 'LYAP', sourcePlayerID: playerID, card: { ...card } };
          pendingAutoResolution = true;
        } else {
          const beforeTargetResources = { ...args.G.resources[playerID] };
          const beforeTargetRankId = args.G.ranks[playerID];
          try {
            const applied = d.applyCardEffects(args.G, playerID, card.effects, []);
            if (!applied) return invalidMove();
          } catch {
            return invalidMove();
          }
          const summary = d.summarizeAppliedDiff(beforeTargetResources, args.G.resources[playerID], beforeTargetRankId, args.G.ranks[playerID]);
          const seq = d.nextSystemMessageSeq(args.G);
          d.appendChat(args.G, {
            type: 'system',
            text: d.buildLyapSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, summary),
          });
          args.G.discard.push(card);
          autoPlayed = true;
        }
      }
    } else if (card.category === 'SCANDAL') {
      const targetIds = Object.keys(args.G.players);
      const hasAnyReplacementNeed = targetIds.some((pid) => {
        if (d.isProtectedFromLyapScandal(args.G, args.ctx, pid)) return false;
        return d.getReplacementUnitsForCard(args.G.resources[pid], card) > 0;
      });
      if (hasAnyReplacementNeed) {
        args.G.pendingDrawAutoResolution = { kind: 'SCANDAL', sourcePlayerID: playerID, card: { ...card } };
        pendingAutoResolution = true;
      } else {
        const targetSummaries: string[] = [];
        const resourceSnapshot = Object.fromEntries(
          targetIds.map((pid) => [pid, { ...args.G.resources[pid] }]),
        ) as Record<string, Record<ResourceKey, number>>;
        const rankSnapshot = Object.fromEntries(
          targetIds.map((pid) => [pid, args.G.ranks[pid]]),
        ) as Record<string, string>;
        const rankImageSnapshot = { ...(args.G.rankImageByPlayer ?? {}) };
        let invalidScandalAutoPlay = false;
        for (const pid of targetIds) {
          if (d.isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
            targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`);
          } else {
            const beforeTargetResources = { ...args.G.resources[pid] };
            const beforeTargetRankId = args.G.ranks[pid];
            try {
              const applied = d.applyCardEffects(args.G, pid, card.effects, []);
              if (!applied) {
                invalidScandalAutoPlay = true;
                break;
              }
            } catch {
              invalidScandalAutoPlay = true;
              break;
            }
            const summary = d.summarizeAppliedDiff(beforeTargetResources, args.G.resources[pid], beforeTargetRankId, args.G.ranks[pid]);
            targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`);
          }
          d.syncPlayerState(args.G, pid);
        }
        if (invalidScandalAutoPlay) {
          targetIds.forEach((pid) => {
            args.G.resources[pid] = { ...resourceSnapshot[pid] };
            args.G.ranks[pid] = rankSnapshot[pid];
            d.syncPlayerState(args.G, pid);
          });
          args.G.rankImageByPlayer = { ...rankImageSnapshot };
          return invalidMove();
        }
        d.triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
        const seq = d.nextSystemMessageSeq(args.G);
        d.appendChat(args.G, {
          type: 'system',
          text: d.buildScandalSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, targetSummaries),
        });
        args.G.discard.push(card);
        autoPlayed = true;
      }
    } else {
      hand.push(card);
    }
  }
  d.syncPlayerState(args.G, playerID);
  d.recordResourceFlowStats(args.G, beforeResources);
  d.resetNoPlayablePassStreak(args.G);
  d.resetEndGameVote(args.G);
  if (pendingAutoResolution) args.events?.setStage?.(d.DRAW_STAGE);
  else args.events?.setStage?.(autoPlayed ? d.END_STAGE : d.PLAY_STAGE);
  return undefined;
};

export const resolveDrawAutoCardHandler = (
  d: JojMovesDeps,
  args: MoveArgs,
  replacementResources: ResourceKey[] = [],
  replacementByTarget: ReplacementByTarget = {},
) => {
  const playerID = args.playerID;
  if (!playerID || args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
  if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
  if (args.ctx.activePlayers?.[playerID] !== d.DRAW_STAGE) return d.INVALID_MOVE;
  const pending = args.G.pendingDrawAutoResolution;
  if (!pending || pending.sourcePlayerID !== playerID) return d.INVALID_MOVE;
  const card = pending.card;
  const beforeResources = d.snapshotResourcesForStats(args.G);
  const rollbackSnapshot = cloneGameState(args.G);
  const invalidMove = () => {
    restoreGameState(args.G, rollbackSnapshot);
    return d.INVALID_MOVE;
  };
  if (pending.kind === 'LYAP') {
    const protectedSelf = d.isProtectedFromLyapScandal(args.G, args.ctx, playerID);
    if (protectedSelf) {
      const seq = d.nextSystemMessageSeq(args.G);
      d.appendChat(args.G, {
        type: 'system',
        text: `🛡️ [${seq}] ${d.getPlayerLabel(args.G, playerID)} витягнув «${card.title}», але щит від Грамоти скасував ЛЯП.`,
      });
    } else {
      const requiredReplacementUnits = d.getReplacementUnitsForCard(args.G.resources[playerID], card);
      if (requiredReplacementUnits > 0 && replacementResources.length !== requiredReplacementUnits) return invalidMove();
      const beforeTargetResources = { ...args.G.resources[playerID] };
      const beforeTargetRankId = args.G.ranks[playerID];
      try {
        const applied = d.applyCardEffects(args.G, playerID, card.effects, replacementResources);
        if (!applied) return invalidMove();
      } catch {
        return invalidMove();
      }
      const summary = d.summarizeAppliedDiff(beforeTargetResources, args.G.resources[playerID], beforeTargetRankId, args.G.ranks[playerID]);
      const seq = d.nextSystemMessageSeq(args.G);
      d.appendChat(args.G, {
        type: 'system',
        text: d.buildLyapSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, summary),
      });
    }
    args.G.discard.push(card);
    d.syncPlayerState(args.G, playerID);
    args.G.pendingDrawAutoResolution = null;
    d.recordResourceFlowStats(args.G, beforeResources);
    d.resetNoPlayablePassStreak(args.G);
    d.resetEndGameVote(args.G);
    args.events?.setStage?.(d.END_STAGE);
    return undefined;
  }
  if (pending.kind === 'SCANDAL') {
    const targetSummaries: string[] = [];
    let invalidScandalReplacement = false;
    Object.keys(args.G.players).forEach((pid) => {
      if (invalidScandalReplacement) return;
      if (d.isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
        targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`);
        return;
      }
      const replacementForTarget = replacementByTarget?.[pid] ?? [];
      const requiredReplacementUnits = d.getReplacementUnitsForCard(args.G.resources[pid], card);
      if (requiredReplacementUnits > 0 && replacementForTarget.length !== requiredReplacementUnits) {
        invalidScandalReplacement = true;
        return;
      }
      const beforeTargetResources = { ...args.G.resources[pid] };
      const beforeTargetRankId = args.G.ranks[pid];
      try {
        const applied = d.applyCardEffects(args.G, pid, card.effects, replacementForTarget);
        if (!applied) {
          invalidScandalReplacement = true;
          return;
        }
      } catch {
        invalidScandalReplacement = true;
        return;
      }
      const summary = d.summarizeAppliedDiff(beforeTargetResources, args.G.resources[pid], beforeTargetRankId, args.G.ranks[pid]);
      targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`);
      d.syncPlayerState(args.G, pid);
    });
    if (invalidScandalReplacement) return invalidMove();
    d.triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: d.buildScandalSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, targetSummaries),
    });
    args.G.discard.push(card);
    Object.keys(args.G.players).forEach((pid) => d.syncPlayerState(args.G, pid));
    args.G.pendingDrawAutoResolution = null;
    d.recordResourceFlowStats(args.G, beforeResources);
    d.resetNoPlayablePassStreak(args.G);
    d.resetEndGameVote(args.G);
    args.events?.setStage?.(d.END_STAGE);
    return undefined;
  }
  return d.INVALID_MOVE;
};

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
  const rollbackSnapshot = cloneGameState(args.G);
  const invalidMove = () => {
    restoreGameState(args.G, rollbackSnapshot);
    return d.INVALID_MOVE;
  };
  const card = hand[idx];
  const allPlayerIDs = Object.keys(args.G.players);
  const applySoftTo = (pid: string) => {
    const summary = d.applyCardEffectsSoft(args.G, pid, card.effects);
    d.syncPlayerState(args.G, pid);
    return summary;
  };

  if (card.category === 'LYAP') {
    if (!targetPlayerID || targetPlayerID === playerID || !(targetPlayerID in args.G.players)) return invalidMove();
    d.incrementLyapPlayedOnOthers(args.G);
    const protectedTarget = d.isProtectedFromLyapScandal(args.G, args.ctx, targetPlayerID);
    let summary = { resources: {}, rank: 0 };
    if (!protectedTarget) {
      const requiredReplacementUnits = d.getReplacementUnitsForCard(args.G.resources[targetPlayerID], card);
      if (requiredReplacementUnits > 0 && replacementResources.length !== requiredReplacementUnits) return invalidMove();
      const beforeTargetResources = { ...args.G.resources[targetPlayerID] };
      const beforeTargetRankId = args.G.ranks[targetPlayerID];
      try {
        const applied = d.applyCardEffects(args.G, targetPlayerID, card.effects, replacementResources);
        if (!applied) return invalidMove();
      } catch {
        return invalidMove();
      }
      summary = d.summarizeAppliedDiff(beforeTargetResources, args.G.resources[targetPlayerID], beforeTargetRankId, args.G.ranks[targetPlayerID]);
      d.syncPlayerState(args.G, targetPlayerID);
    }
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: protectedTarget
        ? `🛡️ [${seq}] ${d.getPlayerLabel(args.G, playerID)} розіграв ЛЯП «${card.title}» на ${d.getPlayerLabel(args.G, targetPlayerID)}, але щит від Грамоти скасував дію.`
        : d.buildPlayedLyapSystemMessage(seq, d.getPlayerLabel(args.G, playerID), d.getPlayerLabel(args.G, targetPlayerID), card, summary),
    });
  } else if (card.category === 'SCANDAL') {
    d.incrementScandalPlayedOnOthers(args.G);
    const targetSummaries: string[] = [];
    let invalidScandalReplacement = false;
    allPlayerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
      if (invalidScandalReplacement) return;
      if (d.isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
        targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`);
        return;
      }
      const replacementForTarget = replacementByTarget?.[pid] ?? [];
      const requiredReplacementUnits = d.getReplacementUnitsForCard(args.G.resources[pid], card);
      if (requiredReplacementUnits > 0 && replacementForTarget.length !== requiredReplacementUnits) {
        invalidScandalReplacement = true;
        return;
      }
      const beforeTargetResources = { ...args.G.resources[pid] };
      const beforeTargetRankId = args.G.ranks[pid];
      try {
        const applied = d.applyCardEffects(args.G, pid, card.effects, replacementForTarget);
        if (!applied) {
          invalidScandalReplacement = true;
          return;
        }
      } catch {
        invalidScandalReplacement = true;
        return;
      }
      const summary = d.summarizeAppliedDiff(beforeTargetResources, args.G.resources[pid], beforeTargetRankId, args.G.ranks[pid]);
      d.syncPlayerState(args.G, pid);
      targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`);
    });
    if (invalidScandalReplacement) return invalidMove();
    d.triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: d.buildPlayedScandalSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, targetSummaries),
    });
  } else if (card.category === 'SUPPORT') {
    const beforePlayerResources = { ...args.G.resources[playerID] };
    const beforeRankId = args.G.ranks[playerID];
    try {
      const applied = d.applyCardEffects(args.G, playerID, card.effects, replacementResources);
      if (!applied) return invalidMove();
    } catch {
      return invalidMove();
    }
    const summary = d.summarizeAppliedDiff(beforePlayerResources, args.G.resources[playerID], beforeRankId, args.G.ranks[playerID]);
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: d.buildSupportSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, summary),
    });
  } else if (isCommandCategory(card)) {
    const targetSummaries: string[] = [];
    let invalidDecisionReplacement = false;
    allPlayerIDs.forEach((pid) => {
      if (invalidDecisionReplacement) return;
      if (pid === playerID) {
        const beforePlayerResources = { ...args.G.resources[playerID] };
        const beforeRankId = args.G.ranks[playerID];
        try {
          const applied = d.applyCardEffects(args.G, playerID, card.effects, replacementResources);
          if (!applied) {
            invalidDecisionReplacement = true;
            return;
          }
        } catch {
          invalidDecisionReplacement = true;
          return;
        }
        const summary = d.summarizeAppliedDiff(beforePlayerResources, args.G.resources[playerID], beforeRankId, args.G.ranks[playerID]);
        targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`);
        d.syncPlayerState(args.G, pid);
        return;
      }
      const summary = applySoftTo(pid);
      targetSummaries.push(`${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`);
    });
    if (invalidDecisionReplacement) return invalidMove();
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: d.buildPlayedDecisionSystemMessage(seq, d.getPlayerLabel(args.G, playerID), card, targetSummaries),
    });
  } else if (card.category === 'VVNZ' && card.grantRank) {
    const beforePlayerResources = { ...args.G.resources[playerID] };
    const beforeRankId = args.G.ranks[playerID];
    const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
    const promoted = d.promoteToSpecificRank(args.G, playerID, card.grantRank, playerCount);
    if (!promoted.ok) return invalidMove();
    try {
      const applied = d.applyCardEffects(args.G, playerID, card.effects, []);
      if (!applied) return invalidMove();
    } catch {
      return invalidMove();
    }
    const afterRankId = args.G.ranks[playerID];
    const summary = d.summarizeAppliedDiff(beforePlayerResources, args.G.resources[playerID], beforeRankId, afterRankId);
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: d.buildVvnzRankSystemMessage(
        seq,
        d.getPlayerLabel(args.G, playerID),
        card,
        beforeRankId,
        afterRankId,
        promoted.rank?.cost ?? {},
        promoted.rank?.bonus ?? {},
        summary,
      ),
    });
  } else if (card.category === 'LEGENDARY') {
    const specialMessage = applyLegendaryCardEffects(d, args, card, playerID, targetPlayerID, replacementResources[0]);
    if (specialMessage === d.INVALID_MOVE) return invalidMove();
    try {
      const applied = d.applyCardEffects(args.G, playerID, card.effects, []);
      if (!applied) return invalidMove();
    } catch {
      return invalidMove();
    }
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      text: d.buildLegendaryPlayedMessageText({ seq, playerLabel: d.getPlayerLabel(args.G, playerID), cardTitle: card.title, specialMessage }),
    });
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
  const rollbackSnapshot = cloneGameState(args.G);
  const invalidMove = () => {
    restoreGameState(args.G, rollbackSnapshot);
    return d.INVALID_MOVE;
  };
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

export const discardFromHandHandler = (d: JojMovesDeps, args: MoveArgs, cardId: string) => {
  const playerID = args.playerID;
  if (!playerID || args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
  if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
  if (isDrawAutoResolutionPending(args.G)) return d.INVALID_MOVE;
  const stage = args.ctx.activePlayers?.[playerID];
  if (![d.PLAY_STAGE, d.END_STAGE].includes(stage as string)) return d.INVALID_MOVE;
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
  if (!playerID || args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
  if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
  if (isDrawAutoResolutionPending(args.G)) return d.INVALID_MOVE;
  if (![d.PLAY_STAGE, d.END_STAGE].includes(args.ctx.activePlayers?.[playerID] as string)) return d.INVALID_MOVE;
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
  return undefined;
};

export const passHandler = (d: JojMovesDeps, args: MoveArgs) => {
  const playerID = args.playerID;
  if (!playerID || args.ctx.currentPlayer !== playerID) return d.INVALID_MOVE;
  if (isLegendaryDraftPending(args.G)) return d.INVALID_MOVE;
  if (isDrawAutoResolutionPending(args.G)) return d.INVALID_MOVE;
  if (![d.PLAY_STAGE, d.END_STAGE].includes(args.ctx.activePlayers?.[playerID] as string)) return d.INVALID_MOVE;
  if ((args.G.hands[playerID]?.length ?? 0) > d.HAND_LIMIT) return d.INVALID_MOVE;
  if ((args.G.deck?.length ?? 0) === 0 && d.hasPlayableCardsByInventory(args.G, playerID)) return d.INVALID_MOVE;
  d.incrementTurnsCompleted(args.G);
  if (d.shouldCountNoPlayablePass(args.G, playerID)) d.incrementNoPlayablePassStreak(args.G);
  else d.resetNoPlayablePassStreak(args.G);
  args.events?.endTurn?.();
  return undefined;
};
