import { isCommandCategory } from '../cardRules';
import type { MoveArgs } from '../moveTypes';
import type { CardDefinition, JojGameState, ResourceKey } from '../types';
import { BOT_DIFFICULTIES, createBotPlayerName, getBotSeatIds } from './config';
import type { BotDifficulty, BotPlayerConfig } from '../types';
import type { BotEngineDeps, BotSetup, BotTurnContext } from './types';

const INVALID_MOVE = 'INVALID_MOVE' as const;

type BotPlan =
  | { kind: 'promote'; score: number }
  | {
    kind: 'play-card';
    cardId: string;
    score: number;
    targetPlayerID?: string;
    replacementResources?: ResourceKey[];
    replacementByTarget?: Record<string, ResourceKey[]>;
  }
  | {
    kind: 'play-legendary';
    cardId: string;
    score: number;
    targetPlayerID?: string;
    selectedResource?: ResourceKey;
  }
  | { kind: 'pass'; score: number };

const getRankIndex = (d: BotEngineDeps, rankId: string) =>
  Math.max(0, d.getActiveRanks().findIndex((rank) => rank.id === rankId));

const getPlayerScore = (d: BotEngineDeps, G: JojGameState, playerID: string) =>
  d.resourceKeys.reduce((sum, key) => sum + (G.resources[playerID]?.[key] ?? 0), 0) + getRankIndex(d, G.ranks[playerID]) * 4;

const getOpponentsSorted = (d: BotEngineDeps, G: JojGameState, playerID: string) =>
  Object.keys(G.players ?? {})
    .filter((pid) => pid !== playerID)
    .sort((a, b) => getPlayerScore(d, G, b) - getPlayerScore(d, G, a));

const chooseStrategicResource = (d: BotEngineDeps, G: JojGameState, playerID: string): ResourceKey => {
  const currentRankIndex = getRankIndex(d, G.ranks[playerID]);
  const nextRank = d.getActiveRanks()[currentRankIndex + 1];
  const deficits = d.resourceKeys
    .map((key) => ({
      key,
      deficit: Math.max(0, (nextRank?.cost?.[key] ?? 0) - (G.resources[playerID]?.[key] ?? 0)),
      current: G.resources[playerID]?.[key] ?? 0,
    }))
    .sort((a, b) => b.deficit - a.deficit || a.current - b.current);
  return deficits[0]?.key ?? 'time';
};

const scoreCardEffects = (card: CardDefinition) =>
  (card.effects ?? []).reduce((sum, effect) => {
    if (effect.resource === 'rank') return sum + effect.value * 8;
    return sum + effect.value * 3;
  }, 0);

const buildCardPlans = (d: BotEngineDeps, G: JojGameState, playerID: string, difficulty: BotDifficulty): BotPlan[] => {
  const opponents = getOpponentsSorted(d, G, playerID);
  const hand = G.hands[playerID] ?? [];
  const currentRankIndex = getRankIndex(d, G.ranks[playerID]);
  const actionPlans = hand.flatMap<BotPlan>((card, index) => {
    const baseScore = scoreCardEffects(card) + Math.max(0, hand.length - index);
    if (card.category === 'LYAP') {
      return opponents.map((targetPlayerID, targetIndex) => ({
        kind: 'play-card',
        cardId: card.id,
        targetPlayerID,
        replacementResources: [],
        score: baseScore + (difficulty === 'hard' ? 35 : 20) - targetIndex,
      }));
    }
    if (card.category === 'SCANDAL') {
      const replacementByTarget = Object.fromEntries(
        Object.keys(G.players ?? {}).map((pid) => [
          pid,
          d.planReplacementResources(G.resources[pid], card.effects) ?? [],
        ]),
      );
      return [{
        kind: 'play-card',
        cardId: card.id,
        replacementByTarget,
        score: baseScore + (difficulty === 'hard' ? 34 : 18),
      }];
    }
    if (card.category === 'SUPPORT' || isCommandCategory(card)) {
      const replacementResources = d.planReplacementResources(G.resources[playerID], card.effects) ?? [];
      return [{
        kind: 'play-card',
        cardId: card.id,
        replacementResources,
        score: baseScore + (card.category === 'SUPPORT' ? 24 : 16),
      }];
    }
    if (card.category === 'VVNZ') {
      const rankBoost = card.grantRank ? Math.max(0, getRankIndex(d, card.grantRank) - currentRankIndex) : 0;
      return [{
        kind: 'play-card',
        cardId: card.id,
        score: baseScore + rankBoost * (difficulty === 'hard' ? 30 : 18) + 12,
      }];
    }
    if (card.category === 'LEGENDARY') {
      return [{
        kind: 'play-card',
        cardId: card.id,
        replacementResources: d.planReplacementResources(G.resources[playerID], card.effects) ?? [],
        score: baseScore + 10,
      }];
    }
    return [{
      kind: 'play-card',
      cardId: card.id,
      replacementResources: d.planReplacementResources(G.resources[playerID], card.effects) ?? [],
      score: baseScore + 8,
    }];
  });

  return actionPlans.sort((a, b) => b.score - a.score);
};

const buildLegendaryPlans = (d: BotEngineDeps, G: JojGameState, playerID: string, difficulty: BotDifficulty): BotPlan[] => {
  const opponents = getOpponentsSorted(d, G, playerID);
  const hand = G.legendaryHands[playerID] ?? [];
  return hand
    .map<BotPlan | null>((card, index) => {
      const base = 20 + Math.max(0, hand.length - index);
      if (card.id === 'legendary-10') {
        const targetPlayerID = opponents[0];
        if (!targetPlayerID) return null;
        return { kind: 'play-legendary', cardId: card.id, targetPlayerID, score: base + 35 };
      }
      if (card.id === 'legendary-06' || card.id === 'legendary-09') {
        return {
          kind: 'play-legendary',
          cardId: card.id,
          selectedResource: chooseStrategicResource(d, G, playerID),
          score: base + 24,
        };
      }
      if (card.id === 'legendary-13') return { kind: 'play-legendary', cardId: card.id, score: base + 40 };
      if (card.id === 'legendary-03') return { kind: 'play-legendary', cardId: card.id, score: base + 28 };
      if (card.id === 'legendary-12') return { kind: 'play-legendary', cardId: card.id, score: base + 18 };
      return { kind: 'play-legendary', cardId: card.id, score: base + (difficulty === 'hard' ? 16 : 10) };
    })
    .filter((plan): plan is BotPlan => Boolean(plan))
    .sort((a, b) => b.score - a.score);
};

const buildDrawResolutionPlan = (d: BotEngineDeps, G: JojGameState, playerID: string): {
  replacementResources: ResourceKey[];
  replacementByTarget: Record<string, ResourceKey[]>;
} => {
  const pending = G.pendingDrawAutoResolution;
  if (!pending) return { replacementResources: [], replacementByTarget: {} };
  if (pending.kind === 'LYAP') {
    return {
      replacementResources: d.planReplacementResources(G.resources[playerID], pending.card.effects) ?? [],
      replacementByTarget: {},
    };
  }
  return {
    replacementResources: [],
    replacementByTarget: Object.fromEntries(
      Object.keys(G.players ?? {}).map((pid) => [pid, d.planReplacementResources(G.resources[pid], pending.card.effects) ?? []]),
    ),
  };
};

const buildBotPlans = (d: BotEngineDeps, G: JojGameState, playerID: string, difficulty: BotDifficulty): BotPlan[] => {
  const plans: BotPlan[] = [];
  if (!G.promotedThisTurn[playerID]) {
    plans.push({ kind: 'promote', score: difficulty === 'hard' ? 90 : difficulty === 'normal' ? 70 : 45 });
  }
  if (G.gameMode !== 'simplified') {
    plans.push(...buildLegendaryPlans(d, G, playerID, difficulty));
  }
  plans.push(...buildCardPlans(d, G, playerID, difficulty));
  if ((G.deck?.length ?? 0) === 0 && !d.hasPlayableCardsByInventory(G, playerID)) {
    plans.push({ kind: 'pass', score: 1 });
  }
  if (difficulty === 'easy') return plans;
  return plans.sort((a, b) => b.score - a.score);
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

    let guard = 0;
    while (!endedTurn && guard < 16) {
      guard += 1;
      const currentPlans = buildBotPlans(d, G, playerID, getBotDifficulty(G, playerID));
      const acted = currentPlans.some((plan) => executePlan(d, plan, makeArgs));
      if (!acted) {
        if (stage === d.END_STAGE || stage === d.PLAY_STAGE) {
          endedTurn = true;
          break;
        }
      }
      if (G.pendingDrawAutoResolution?.sourcePlayerID === playerID) {
        tryResolvePending();
      }
      if (stage === d.END_STAGE && (G.extraHandPlayTokens[playerID] ?? 0) <= 0 && !G.pendingDrawAutoResolution) {
        endedTurn = true;
      }
    }

    return true;
  },
});
