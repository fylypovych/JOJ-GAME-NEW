import type { MoveArgs } from '../moveTypes';
import type { JojGameState } from '../types';
import { BOT_DIFFICULTIES, createBotPlayerName, getBotSeatIds } from './config';
import type { BotDifficulty, BotPlayerConfig } from '../types';
import type { BotEngineDeps, BotSetup, BotTurnContext } from './types';
import { buildBotPlans, buildDrawResolutionPlan, type BotPlan } from './planner';
import { executeBotPlanSequence } from './execution';

const INVALID_MOVE = 'INVALID_MOVE' as const;

const forceResolvePendingForBot = (d: BotEngineDeps, G: JojGameState, playerID: string, ctx: BotTurnContext['ctx']) => {
  const pending = G.pendingDrawAutoResolution;
  if (!pending || pending.sourcePlayerID !== playerID) return false;
  const beforeResources = d.snapshotResourcesForStats(G);
  const card = pending.card;
  if (pending.kind === 'LYAP') {
    const summary = d.isProtectedFromLyapScandal(G, ctx, playerID)
      ? { resources: {}, rank: 0 }
      : d.applyCardEffectsSoft(G, playerID, card.effects);
    const seq = d.nextSystemMessageSeq(G);
    d.appendChat(G, {
      type: 'system',
      text: d.buildLyapSystemMessage(seq, d.getPlayerLabel(G, playerID), card, summary),
    });
    d.syncPlayerState(G, playerID);
    G.discard.push(card);
    G.pendingDrawAutoResolution = null;
    d.recordResourceFlowStats(G, beforeResources);
    d.resetNoPlayablePassStreak(G);
    d.resetEndGameVote(G);
    return true;
  }
  const targetSummaries: string[] = [];
  Object.keys(G.players ?? {}).forEach((pid) => {
    if (d.isProtectedFromLyapScandal(G, ctx, pid)) {
      targetSummaries.push(`${d.getPlayerLabel(G, pid)}: щит від Грамоти (без змін)`);
      return;
    }
    const summary = d.applyCardEffectsSoft(G, pid, card.effects);
    targetSummaries.push(`${d.getPlayerLabel(G, pid)}: ${d.effectSummaryToText(summary)}`);
    d.syncPlayerState(G, pid);
  });
  d.triggerSukhpayZsuOnScandal(G, ctx, playerID);
  const seq = d.nextSystemMessageSeq(G);
  d.appendChat(G, {
    type: 'system',
    text: d.buildScandalSystemMessage(seq, d.getPlayerLabel(G, playerID), card, targetSummaries),
  });
  G.discard.push(card);
  G.pendingDrawAutoResolution = null;
  d.recordResourceFlowStats(G, beforeResources);
  d.resetNoPlayablePassStreak(G);
  d.resetEndGameVote(G);
  return true;
};

const executePlan = (
  d: BotEngineDeps,
  plan: BotPlan,
  makeArgs: () => MoveArgs,
): boolean => {
  const args = makeArgs();
  if (plan.kind === 'promote') return d.promoteHandler(d, args) !== INVALID_MOVE;
  if (plan.kind === 'play-legendary') {
    return d.playLegendaryCardHandler(d, args, plan.cardId, plan.targetPlayerID, plan.selectedResource) !== INVALID_MOVE;
  }
  if (plan.kind === 'play-card') {
    return d.playCardHandler(
      d,
      args,
      plan.cardId,
      plan.replacementResources ?? [],
      plan.targetPlayerID,
      plan.replacementByTarget ?? {},
    ) !== INVALID_MOVE;
  }
  if (plan.kind === 'pass') return d.passHandler(d, args) !== INVALID_MOVE;
  return false;
};

const getBotDifficulty = (G: JojGameState, playerID: string): BotDifficulty =>
  G.botPlayers?.[playerID]?.difficulty && BOT_DIFFICULTIES.includes(G.botPlayers[playerID].difficulty)
    ? G.botPlayers[playerID].difficulty
    : 'easy';

export const isBotPlayer = (G: JojGameState, playerID?: string | null) =>
  Boolean(playerID && G.botPlayers?.[playerID]);

export const attachBotsToGameState = (args: {
  G: JojGameState;
  totalPlayers: number;
  botSetup: BotSetup | null;
}) => {
  const { G, totalPlayers, botSetup } = args;
  G.botPlayers = {};
  if (!botSetup) return;
  getBotSeatIds(totalPlayers, botSetup.count).forEach((playerID, index) => {
    const config: BotPlayerConfig = {
      difficulty: botSetup.difficulty,
      name: createBotPlayerName({ difficulty: botSetup.difficulty, seatIndex: index + 1 }),
    };
    G.botPlayers[playerID] = config;
    G.playerNames[playerID] = config.name;
  });
};

export const createBotEngine = (d: BotEngineDeps) => ({
  playTurn: ({ G, ctx, playerID, initialStage }: BotTurnContext): boolean => {
    if (!isBotPlayer(G, playerID)) return false;
    let stage = initialStage;
    let endedTurn = false;
    const localEvents = {
      setStage: (nextStage: string) => {
        stage = nextStage;
      },
      endTurn: () => {
        endedTurn = true;
      },
    };
    const makeArgs = (): MoveArgs => ({
      G,
      ctx: {
        ...ctx,
        activePlayers: {
          ...(ctx.activePlayers ?? {}),
          [playerID]: stage,
        },
      },
      playerID,
      events: localEvents,
    });

    const tryResolvePending = () => {
      if (!G.pendingDrawAutoResolution || G.pendingDrawAutoResolution.sourcePlayerID !== playerID) return false;
      const { replacementResources, replacementByTarget } = buildDrawResolutionPlan(d, G, playerID);
      return d.resolveDrawAutoCardHandler(d, makeArgs(), replacementResources, replacementByTarget) !== INVALID_MOVE;
    };

    if (stage === d.DRAW_STAGE) {
      d.drawCardHandler(d, makeArgs());
      if (G.pendingDrawAutoResolution?.sourcePlayerID === playerID) {
        tryResolvePending();
      }
    } else if (G.pendingDrawAutoResolution?.sourcePlayerID === playerID) {
      tryResolvePending();
    }

    const executionResult = executeBotPlanSequence({
      getPlans: () => buildBotPlans(d, G, playerID, getBotDifficulty(G, playerID)),
      executePlan: (plan) => executePlan(d, plan, makeArgs),
      maxIterations: 16,
      shouldStop: () => endedTurn,
      onExecuted: () => {
        if (G.pendingDrawAutoResolution?.sourcePlayerID === playerID) {
          tryResolvePending();
        }
        if (stage === d.END_STAGE && (G.extraHandPlayTokens[playerID] ?? 0) <= 0 && !G.pendingDrawAutoResolution) {
          endedTurn = true;
        }
      },
    });

    if (!endedTurn) {
      if (!executionResult.acted && (stage === d.END_STAGE || stage === d.PLAY_STAGE)) {
        endedTurn = true;
      }
      if (G.pendingDrawAutoResolution?.sourcePlayerID === playerID) {
        tryResolvePending();
      }
      if (stage === d.END_STAGE && (G.extraHandPlayTokens[playerID] ?? 0) <= 0 && !G.pendingDrawAutoResolution) {
        endedTurn = true;
      }
    }

    if (G.pendingDrawAutoResolution?.sourcePlayerID === playerID) {
      forceResolvePendingForBot(d, G, playerID, ctx);
      endedTurn = true;
    }

    return true;
  },
});
