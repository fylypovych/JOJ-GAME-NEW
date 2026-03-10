import type { CardDefinition, ResourceKey } from '../types';
import type { JojMovesDeps, MoveArgs, ReplacementByTarget } from '../moveTypes';
import { isCommandCategory } from '../cardRules';
import { applyLegendaryCardEffects } from './legendaryHandlers';
import { summarizeCardEffectForPlayer } from './runtimeHelpers';

export const handleLyapPlay = (args: {
  d: JojMovesDeps;
  moveArgs: MoveArgs;
  playerID: string;
  card: CardDefinition;
  targetPlayerID?: string;
  replacementResources: ResourceKey[];
  invalidMove: () => 'INVALID_MOVE';
}) => {
  const { d, moveArgs, playerID, card, targetPlayerID, replacementResources, invalidMove } = args;
  if (!targetPlayerID || targetPlayerID === playerID || !(targetPlayerID in moveArgs.G.players)) return invalidMove();
  d.incrementLyapPlayedOnOthers(moveArgs.G, playerID);
  const protectedTarget = d.isProtectedFromLyapScandal(moveArgs.G, moveArgs.ctx, targetPlayerID);
  let summary = { resources: {}, rank: 0 };
  if (!protectedTarget) {
    const requiredReplacementUnits = d.getReplacementUnitsForCard(moveArgs.G.resources[targetPlayerID], card);
    if (requiredReplacementUnits > 0 && replacementResources.length !== requiredReplacementUnits) return invalidMove();
    try {
      const nextSummary = summarizeCardEffectForPlayer(d, moveArgs.G, targetPlayerID, card, replacementResources);
      if (!nextSummary) return invalidMove();
      summary = nextSummary;
    } catch {
      return invalidMove();
    }
    d.syncPlayerState(moveArgs.G, targetPlayerID);
  }
  const seq = d.nextSystemMessageSeq(moveArgs.G);
  d.appendChat(moveArgs.G, {
    type: 'system',
    text: protectedTarget
      ? `🛡️ [${seq}] ${d.getPlayerLabel(moveArgs.G, playerID)} розіграв ЛЯП «${card.title}» на ${d.getPlayerLabel(moveArgs.G, targetPlayerID)}, але щит від Грамоти скасував дію.`
      : d.buildPlayedLyapSystemMessage(seq, d.getPlayerLabel(moveArgs.G, playerID), d.getPlayerLabel(moveArgs.G, targetPlayerID), card, summary),
  });
  return undefined;
};

export const handleScandalPlay = (args: {
  d: JojMovesDeps;
  moveArgs: MoveArgs;
  playerID: string;
  card: CardDefinition;
  replacementByTarget: ReplacementByTarget;
  allPlayerIDs: string[];
  invalidMove: () => 'INVALID_MOVE';
}) => {
  const { d, moveArgs, playerID, card, replacementByTarget, allPlayerIDs, invalidMove } = args;
  d.incrementScandalPlayedOnOthers(moveArgs.G, playerID);
  const targetSummaries: string[] = [];
  let invalidScandalReplacement = false;
  allPlayerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
    if (invalidScandalReplacement) return;
    if (d.isProtectedFromLyapScandal(moveArgs.G, moveArgs.ctx, pid)) {
      targetSummaries.push(`${d.getPlayerLabel(moveArgs.G, pid)}: щит від Грамоти (без змін)`);
      return;
    }
    const replacementForTarget = replacementByTarget?.[pid] ?? [];
    const requiredReplacementUnits = d.getReplacementUnitsForCard(moveArgs.G.resources[pid], card);
    if (requiredReplacementUnits > 0 && replacementForTarget.length !== requiredReplacementUnits) {
      invalidScandalReplacement = true;
      return;
    }
    try {
      const summary = summarizeCardEffectForPlayer(d, moveArgs.G, pid, card, replacementForTarget);
      if (!summary) {
        invalidScandalReplacement = true;
        return;
      }
      d.syncPlayerState(moveArgs.G, pid);
      targetSummaries.push(`${d.getPlayerLabel(moveArgs.G, pid)}: ${d.effectSummaryToText(summary)}`);
    } catch {
      invalidScandalReplacement = true;
    }
  });
  if (invalidScandalReplacement) return invalidMove();
  d.triggerSukhpayZsuOnScandal(moveArgs.G, moveArgs.ctx, playerID);
  const seq = d.nextSystemMessageSeq(moveArgs.G);
  d.appendChat(moveArgs.G, {
    type: 'system',
    text: d.buildPlayedScandalSystemMessage(seq, d.getPlayerLabel(moveArgs.G, playerID), card, targetSummaries),
  });
  return undefined;
};

export const handleSupportPlay = (args: {
  d: JojMovesDeps;
  moveArgs: MoveArgs;
  playerID: string;
  card: CardDefinition;
  replacementResources: ResourceKey[];
  invalidMove: () => 'INVALID_MOVE';
}) => {
  const { d, moveArgs, playerID, card, replacementResources, invalidMove } = args;
  try {
    const summary = summarizeCardEffectForPlayer(d, moveArgs.G, playerID, card, replacementResources);
    if (!summary) return invalidMove();
    const seq = d.nextSystemMessageSeq(moveArgs.G);
    d.appendChat(moveArgs.G, {
      type: 'system',
      text: d.buildSupportSystemMessage(seq, d.getPlayerLabel(moveArgs.G, playerID), card, summary),
    });
    return undefined;
  } catch {
    return invalidMove();
  }
};

export const handleCommandPlay = (args: {
  d: JojMovesDeps;
  moveArgs: MoveArgs;
  playerID: string;
  card: CardDefinition;
  replacementResources: ResourceKey[];
  allPlayerIDs: string[];
  invalidMove: () => 'INVALID_MOVE';
}) => {
  const { d, moveArgs, playerID, card, replacementResources, allPlayerIDs, invalidMove } = args;
  const targetSummaries: string[] = [];
  let invalidDecisionReplacement = false;
  allPlayerIDs.forEach((pid) => {
    if (invalidDecisionReplacement) return;
    if (pid === playerID) {
      try {
        const summary = summarizeCardEffectForPlayer(d, moveArgs.G, playerID, card, replacementResources);
        if (!summary) {
          invalidDecisionReplacement = true;
          return;
        }
        targetSummaries.push(`${d.getPlayerLabel(moveArgs.G, pid)}: ${d.effectSummaryToText(summary)}`);
        d.syncPlayerState(moveArgs.G, pid);
      } catch {
        invalidDecisionReplacement = true;
      }
      return;
    }
    const summary = d.applyCardEffectsSoft(moveArgs.G, pid, card.effects);
    d.syncPlayerState(moveArgs.G, pid);
    targetSummaries.push(`${d.getPlayerLabel(moveArgs.G, pid)}: ${d.effectSummaryToText(summary)}`);
  });
  if (invalidDecisionReplacement) return invalidMove();
  const seq = d.nextSystemMessageSeq(moveArgs.G);
  d.appendChat(moveArgs.G, {
    type: 'system',
    text: d.buildPlayedDecisionSystemMessage(seq, d.getPlayerLabel(moveArgs.G, playerID), card, targetSummaries),
  });
  return undefined;
};

export const handleVvnzPlay = (args: {
  d: JojMovesDeps;
  moveArgs: MoveArgs;
  playerID: string;
  card: CardDefinition;
  invalidMove: () => 'INVALID_MOVE';
}) => {
  const { d, moveArgs, playerID, card, invalidMove } = args;
  const beforeRankId = moveArgs.G.ranks[playerID];
  const playerCount = Object.keys(moveArgs.G.players).length || Number(moveArgs.ctx.numPlayers ?? 0) || 2;
  const promoted = d.promoteToSpecificRank(moveArgs.G, playerID, card.grantRank!, playerCount);
  if (!promoted.ok) return invalidMove();
  try {
    const summary = summarizeCardEffectForPlayer(d, moveArgs.G, playerID, card, []);
    if (!summary) return invalidMove();
    const afterRankId = moveArgs.G.ranks[playerID];
    const seq = d.nextSystemMessageSeq(moveArgs.G);
    d.appendChat(moveArgs.G, {
      type: 'system',
      text: d.buildVvnzRankSystemMessage(
        seq,
        d.getPlayerLabel(moveArgs.G, playerID),
        card,
        beforeRankId,
        afterRankId,
        promoted.rank?.cost ?? {},
        promoted.rank?.bonus ?? {},
        summary,
      ),
    });
    return undefined;
  } catch {
    return invalidMove();
  }
};

export const handleLegendaryPlayFromHand = (args: {
  d: JojMovesDeps;
  moveArgs: MoveArgs;
  playerID: string;
  card: CardDefinition;
  targetPlayerID?: string;
  replacementResources: ResourceKey[];
  invalidMove: () => 'INVALID_MOVE';
}) => {
  const { d, moveArgs, playerID, card, targetPlayerID, replacementResources, invalidMove } = args;
  const specialMessage = applyLegendaryCardEffects(d, moveArgs, card, playerID, targetPlayerID, replacementResources[0]);
  if (specialMessage === d.INVALID_MOVE) return invalidMove();
  try {
    const applied = d.applyCardEffects(moveArgs.G, playerID, card.effects, []);
    if (!applied) return invalidMove();
  } catch {
    return invalidMove();
  }
  const seq = d.nextSystemMessageSeq(moveArgs.G);
  d.appendChat(moveArgs.G, {
    type: 'system',
    text: d.buildLegendaryPlayedMessageText({ seq, playerLabel: d.getPlayerLabel(moveArgs.G, playerID), cardTitle: card.title, specialMessage }),
  });
  return undefined;
};

export const isCommandPlay = (card: CardDefinition) => isCommandCategory(card);
