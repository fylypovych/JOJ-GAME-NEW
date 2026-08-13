import type { ResourceKey } from '../types';
import type { JojMovesDeps, MoveArgs, ReplacementByTarget } from '../moveTypes';
import { validateMoveAction } from '../actionRules';
import { appendAppliedEffectLog } from '../effectLog';
import {
  consumeImmediateSkipForCurrentPlayer,
  createInvalidMoveRollback,
  summarizeCardEffectForPlayer,
} from './runtimeHelpers';

export {
  isLegendaryDraftPending,
  isDrawAutoResolutionPending,
} from '../actionRules';

export const drawCardHandler = (d: JojMovesDeps, args: MoveArgs) => {
  const playerID = args.playerID;
  if (!playerID) return d.INVALID_MOVE;
  if (!validateMoveAction(d, args, 'draw-card')) return d.INVALID_MOVE;

  const beforeResources = d.snapshotResourcesForStats(args.G);
  const skippedTurnsBeforeMove = args.G.skippedTurnCounts?.[playerID] ?? 0;
  const invalidMove = createInvalidMoveRollback(d, args.G);
  const hand = args.G.hands[playerID];
  let autoPlayed = false;
  let pendingAutoResolution = false;
  const card = args.G.deck.pop();
  if (card) {
    if (card.category === 'LYAP') {
      const protectedSelf = d.isProtectedFromLyapScandal(
        args.G,
        args.ctx,
        playerID,
      );
      if (protectedSelf) {
        const seq = d.nextSystemMessageSeq(args.G);
        d.appendChat(args.G, {
          type: 'system',
          playerID,
          eventKind: 'protection',
          text: `🛡️ [${seq}] ${d.getPlayerLabel(args.G, playerID)} витягнув «${card.title}», але щит від Грамоти скасував ЛЯП.`,
        });
        args.G.discard.push(card);
        autoPlayed = true;
      } else {
        const requiredReplacementUnits = d.getReplacementUnitsForCard(
          args.G.resources[playerID],
          card,
        );
        if (requiredReplacementUnits > 0) {
          args.G.pendingDrawAutoResolution = {
            kind: 'LYAP',
            sourcePlayerID: playerID,
            card: { ...card },
          };
          pendingAutoResolution = true;
        } else {
          try {
            const summary = summarizeCardEffectForPlayer(
              d,
              args.G,
              playerID,
              card,
              [],
            );
            if (!summary) return invalidMove();
            appendAppliedEffectLog(args.G, {
              sourceCardId: card.id,
              sourceCardTitle: card.title,
              sourceCategory: 'LYAP',
              sourcePlayerID: playerID,
              targetPlayerID: playerID,
              summary,
              createdAtTurn: args.ctx.turn,
            });
            const seq = d.nextSystemMessageSeq(args.G);
            d.appendChat(args.G, {
              type: 'system',
              playerID,
              eventKind: 'lyap',
              text: d.buildLyapSystemMessage(
                seq,
                d.getPlayerLabel(args.G, playerID),
                card,
                summary,
              ),
            });
          } catch {
            return invalidMove();
          }
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
        args.G.pendingDrawAutoResolution = {
          kind: 'SCANDAL',
          sourcePlayerID: playerID,
          card: { ...card },
        };
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
            targetSummaries.push(
              `${d.getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`,
            );
          } else {
            try {
              const summary = summarizeCardEffectForPlayer(
                d,
                args.G,
                pid,
                card,
                [],
              );
              if (!summary) {
                invalidScandalAutoPlay = true;
                break;
              }
              appendAppliedEffectLog(args.G, {
                sourceCardId: card.id,
                sourceCardTitle: card.title,
                sourceCategory: 'SCANDAL',
                sourcePlayerID: playerID,
                targetPlayerID: pid,
                summary,
                createdAtTurn: args.ctx.turn,
              });
              targetSummaries.push(
                `${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`,
              );
            } catch {
              invalidScandalAutoPlay = true;
              break;
            }
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
          playerID,
          eventKind: 'scandal',
          text: d.buildScandalSystemMessage(
            seq,
            d.getPlayerLabel(args.G, playerID),
            card,
            targetSummaries,
          ),
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
  if (
    consumeImmediateSkipForCurrentPlayer(
      args.G,
      args.ctx.currentPlayer,
      playerID,
      skippedTurnsBeforeMove,
    )
  ) {
    d.incrementTurnsCompleted(args.G, playerID);
    args.events?.endTurn?.();
    return undefined;
  }
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
  if (!playerID) return d.INVALID_MOVE;
  if (!validateMoveAction(d, args, 'resolve-draw-auto')) return d.INVALID_MOVE;
  const pending = args.G.pendingDrawAutoResolution;
  if (!pending || pending.sourcePlayerID !== playerID) return d.INVALID_MOVE;
  const card = pending.card;
  const beforeResources = d.snapshotResourcesForStats(args.G);
  const skippedTurnsBeforeMove = args.G.skippedTurnCounts?.[playerID] ?? 0;
  const invalidMove = createInvalidMoveRollback(d, args.G);
  if (pending.kind === 'LYAP') {
    const protectedSelf = d.isProtectedFromLyapScandal(
      args.G,
      args.ctx,
      playerID,
    );
    if (protectedSelf) {
      const seq = d.nextSystemMessageSeq(args.G);
      d.appendChat(args.G, {
        type: 'system',
        playerID,
        eventKind: 'protection',
        text: `🛡️ [${seq}] ${d.getPlayerLabel(args.G, playerID)} витягнув «${card.title}», але щит від Грамоти скасував ЛЯП.`,
      });
    } else {
      const requiredReplacementUnits = d.getReplacementUnitsForCard(
        args.G.resources[playerID],
        card,
      );
      if (
        requiredReplacementUnits > 0 &&
        replacementResources.length !== requiredReplacementUnits
      )
        return invalidMove();
      try {
        const summary = summarizeCardEffectForPlayer(
          d,
          args.G,
          playerID,
          card,
          replacementResources,
        );
        if (!summary) return invalidMove();
        appendAppliedEffectLog(args.G, {
          sourceCardId: card.id,
          sourceCardTitle: card.title,
          sourceCategory: 'LYAP',
          sourcePlayerID: playerID,
          targetPlayerID: playerID,
          summary,
          createdAtTurn: args.ctx.turn,
        });
        const seq = d.nextSystemMessageSeq(args.G);
        d.appendChat(args.G, {
          type: 'system',
          playerID,
          eventKind: 'lyap',
          text: d.buildLyapSystemMessage(
            seq,
            d.getPlayerLabel(args.G, playerID),
            card,
            summary,
          ),
        });
      } catch {
        return invalidMove();
      }
    }
    args.G.discard.push(card);
    d.syncPlayerState(args.G, playerID);
    args.G.pendingDrawAutoResolution = null;
    d.recordResourceFlowStats(args.G, beforeResources);
    d.resetNoPlayablePassStreak(args.G);
    d.resetEndGameVote(args.G);
    if (
      consumeImmediateSkipForCurrentPlayer(
        args.G,
        args.ctx.currentPlayer,
        playerID,
        skippedTurnsBeforeMove,
      )
    ) {
      d.incrementTurnsCompleted(args.G, playerID);
      args.events?.endTurn?.();
      return undefined;
    }
    args.events?.setStage?.(d.END_STAGE);
    return undefined;
  }
  if (pending.kind === 'SCANDAL') {
    const targetSummaries: string[] = [];
    let invalidScandalReplacement = false;
    Object.keys(args.G.players).forEach((pid) => {
      if (invalidScandalReplacement) return;
      if (d.isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
        targetSummaries.push(
          `${d.getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`,
        );
        return;
      }
      const replacementForTarget = replacementByTarget?.[pid] ?? [];
      const requiredReplacementUnits = d.getReplacementUnitsForCard(
        args.G.resources[pid],
        card,
      );
      if (
        requiredReplacementUnits > 0 &&
        replacementForTarget.length !== requiredReplacementUnits
      ) {
        invalidScandalReplacement = true;
        return;
      }
      try {
        const summary = summarizeCardEffectForPlayer(
          d,
          args.G,
          pid,
          card,
          replacementForTarget,
        );
        if (!summary) {
          invalidScandalReplacement = true;
          return;
        }
        appendAppliedEffectLog(args.G, {
          sourceCardId: card.id,
          sourceCardTitle: card.title,
          sourceCategory: 'SCANDAL',
          sourcePlayerID: playerID,
          targetPlayerID: pid,
          summary,
          createdAtTurn: args.ctx.turn,
        });
        targetSummaries.push(
          `${d.getPlayerLabel(args.G, pid)}: ${d.effectSummaryToText(summary)}`,
        );
      } catch {
        invalidScandalReplacement = true;
        return;
      }
      d.syncPlayerState(args.G, pid);
    });
    if (invalidScandalReplacement) return invalidMove();
    d.triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
    const seq = d.nextSystemMessageSeq(args.G);
    d.appendChat(args.G, {
      type: 'system',
      playerID,
      eventKind: 'scandal',
      text: d.buildScandalSystemMessage(
        seq,
        d.getPlayerLabel(args.G, playerID),
        card,
        targetSummaries,
      ),
    });
    args.G.discard.push(card);
    Object.keys(args.G.players).forEach((pid) =>
      d.syncPlayerState(args.G, pid),
    );
    args.G.pendingDrawAutoResolution = null;
    d.recordResourceFlowStats(args.G, beforeResources);
    d.resetNoPlayablePassStreak(args.G);
    d.resetEndGameVote(args.G);
    if (
      consumeImmediateSkipForCurrentPlayer(
        args.G,
        args.ctx.currentPlayer,
        playerID,
        skippedTurnsBeforeMove,
      )
    ) {
      d.incrementTurnsCompleted(args.G, playerID);
      args.events?.endTurn?.();
      return undefined;
    }
    args.events?.setStage?.(d.END_STAGE);
    return undefined;
  }
  return d.INVALID_MOVE;
};
