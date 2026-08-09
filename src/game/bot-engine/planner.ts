import { isCommandCategory } from '../cardRules';
import type { CardDefinition, JojGameState, ResourceKey } from '../types';
import type { BotDifficulty, BotProfile } from '../types';
import { selectVvnzPaymentResources } from '../vvnzCost';

export type BotPlan =
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

export type BotPlannerDeps = {
  resourceKeys: readonly ResourceKey[];
  getActiveRanks: () => Array<{ id: string; cost?: Partial<Record<ResourceKey, number>> }>;
  planReplacementResources: (
    resources: Record<ResourceKey, number>,
    effects: { resource: ResourceKey | 'rank'; value: number }[] | undefined,
  ) => ResourceKey[] | null;
  hasPlayableCardsByInventory: (G: JojGameState, playerID: string) => boolean;
};

const getRankIndex = (deps: BotPlannerDeps, rankId: string) =>
  Math.max(0, deps.getActiveRanks().findIndex((rank) => rank.id === rankId));

const getPlayerScore = (deps: BotPlannerDeps, G: JojGameState, playerID: string) =>
  deps.resourceKeys.reduce((sum, key) => sum + (G.resources[playerID]?.[key] ?? 0), 0) + getRankIndex(deps, G.ranks[playerID]) * 4;

export const getOpponentsSorted = (deps: BotPlannerDeps, G: JojGameState, playerID: string) =>
  Object.keys(G.players ?? {})
    .filter((pid) => pid !== playerID)
    .sort((a, b) => getPlayerScore(deps, G, b) - getPlayerScore(deps, G, a));

export const chooseStrategicResource = (deps: BotPlannerDeps, G: JojGameState, playerID: string): ResourceKey => {
  const currentRankIndex = getRankIndex(deps, G.ranks[playerID]);
  const nextRank = deps.getActiveRanks()[currentRankIndex + 1];
  const deficits = deps.resourceKeys
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

const getProfileAdjustments = (profile: BotProfile) => ({
  aggressiveAttackBonus: profile === 'aggressive' ? 12 : profile === 'control' ? -4 : 0,
  aggressiveRankBonus: profile === 'aggressive' ? 6 : profile === 'control' ? -2 : 0,
  controlCommandBonus: profile === 'control' ? 10 : profile === 'aggressive' ? -2 : 0,
  supportBonus: profile === 'control' ? 6 : 0,
});

const buildCardPlans = (deps: BotPlannerDeps, G: JojGameState, playerID: string, difficulty: BotDifficulty, profile: BotProfile): BotPlan[] => {
  const opponents = getOpponentsSorted(deps, G, playerID);
  const hand = G.hands[playerID] ?? [];
  const currentRankIndex = getRankIndex(deps, G.ranks[playerID]);
  const profileAdjustments = getProfileAdjustments(profile);
  const actionPlans = hand.flatMap<BotPlan>((card, index) => {
    const baseScore = scoreCardEffects(card) + Math.max(0, hand.length - index);
    if (card.category === 'LYAP') {
      return opponents.map((targetPlayerID, targetIndex) => ({
        kind: 'play-card',
        cardId: card.id,
        targetPlayerID,
        replacementResources: [],
        score: baseScore + (difficulty === 'hard' ? 35 : 20) + profileAdjustments.aggressiveAttackBonus - targetIndex,
      }));
    }
    if (card.category === 'SCANDAL') {
      const replacementByTarget = Object.fromEntries(
        Object.keys(G.players ?? {}).map((pid) => [
          pid,
          deps.planReplacementResources(G.resources[pid], card.effects) ?? [],
        ]),
      );
      return [{
        kind: 'play-card',
        cardId: card.id,
        replacementByTarget,
        score: baseScore + (difficulty === 'hard' ? 34 : 18) + profileAdjustments.aggressiveAttackBonus + profileAdjustments.controlCommandBonus,
      }];
    }
    if (card.category === 'SUPPORT' || isCommandCategory(card)) {
      const replacementResources = deps.planReplacementResources(G.resources[playerID], card.effects) ?? [];
      return [{
        kind: 'play-card',
        cardId: card.id,
        replacementResources,
        score: baseScore + (card.category === 'SUPPORT' ? 24 + profileAdjustments.supportBonus : 16 + profileAdjustments.controlCommandBonus),
      }];
    }
    if (card.category === 'VVNZ') {
      const rankBoost = card.grantRank ? Math.max(0, getRankIndex(deps, card.grantRank) - currentRankIndex) : 0;
      const replacementResources = selectVvnzPaymentResources(G.resources[playerID]) ?? [];
      return [{
        kind: 'play-card',
        cardId: card.id,
        replacementResources,
        score: baseScore + rankBoost * (difficulty === 'hard' ? 30 : 18) + 12 + profileAdjustments.aggressiveRankBonus,
      }];
    }
    if (card.category === 'LEGENDARY') {
      if (card.id === 'legendary-10') {
        const targetPlayerID = opponents[0];
        return targetPlayerID ? [{ kind: 'play-card', cardId: card.id, targetPlayerID, score: baseScore + 45 }] : [];
      }
      if (['legendary-06', 'legendary-09', 'legendary-17'].includes(card.id)) {
        return [{
          kind: 'play-card',
          cardId: card.id,
          replacementResources: [chooseStrategicResource(deps, G, playerID)],
          score: baseScore + 30,
        }];
      }
      return [{
        kind: 'play-card',
        cardId: card.id,
        replacementResources: deps.planReplacementResources(G.resources[playerID], card.effects) ?? [],
        score: baseScore + 10,
      }];
    }
    return [{
      kind: 'play-card',
      cardId: card.id,
      replacementResources: deps.planReplacementResources(G.resources[playerID], card.effects) ?? [],
      score: baseScore + 8,
    }];
  });

  return actionPlans.sort((a, b) => b.score - a.score);
};

const buildLegendaryPlans = (deps: BotPlannerDeps, G: JojGameState, playerID: string, difficulty: BotDifficulty, profile: BotProfile): BotPlan[] => {
  const opponents = getOpponentsSorted(deps, G, playerID);
  const hand = G.legendaryHands[playerID] ?? [];
  const profileAdjustments = getProfileAdjustments(profile);
  return hand
    .map<BotPlan | null>((card, index) => {
      const base = 20 + Math.max(0, hand.length - index);
      if (card.id === 'legendary-10') {
        const targetPlayerID = opponents[0];
        if (!targetPlayerID) return null;
        return { kind: 'play-legendary', cardId: card.id, targetPlayerID, score: base + 35 + profileAdjustments.aggressiveAttackBonus };
      }
      if (['legendary-06', 'legendary-09', 'legendary-17'].includes(card.id)) {
        return {
          kind: 'play-legendary',
          cardId: card.id,
          selectedResource: chooseStrategicResource(deps, G, playerID),
          score: base + 24,
        };
      }
      if (card.id === 'legendary-03') return { kind: 'play-legendary', cardId: card.id, score: base + 28 };
      if (card.id === 'legendary-12') return { kind: 'play-legendary', cardId: card.id, score: base + 18 };
      return { kind: 'play-legendary', cardId: card.id, score: base + (difficulty === 'hard' ? 16 : 10) };
    })
    .filter((plan): plan is BotPlan => Boolean(plan))
    .sort((a, b) => b.score - a.score);
};

export const buildDrawResolutionPlan = (deps: BotPlannerDeps, G: JojGameState, playerID: string): {
  replacementResources: ResourceKey[];
  replacementByTarget: Record<string, ResourceKey[]>;
} => {
  const pending = G.pendingDrawAutoResolution;
  if (!pending) return { replacementResources: [], replacementByTarget: {} };
  if (pending.kind === 'LYAP') {
    return {
      replacementResources: deps.planReplacementResources(G.resources[playerID], pending.card.effects) ?? [],
      replacementByTarget: {},
    };
  }
  return {
    replacementResources: [],
    replacementByTarget: Object.fromEntries(
      Object.keys(G.players ?? {}).map((pid) => [pid, deps.planReplacementResources(G.resources[pid], pending.card.effects) ?? []]),
    ),
  };
};

export const buildBotPlans = (deps: BotPlannerDeps, G: JojGameState, playerID: string, difficulty: BotDifficulty, profile: BotProfile = 'balanced'): BotPlan[] => {
  const plans: BotPlan[] = [];
  if (!G.promotedThisTurn[playerID]) {
    const profileBonus = profile === 'aggressive' ? 8 : profile === 'control' ? -4 : 0;
    plans.push({ kind: 'promote', score: (difficulty === 'hard' ? 90 : difficulty === 'normal' ? 70 : 45) + profileBonus });
  }
  if (G.gameMode !== 'simplified') {
    plans.push(...buildLegendaryPlans(deps, G, playerID, difficulty, profile));
  }
  plans.push(...buildCardPlans(deps, G, playerID, difficulty, profile));
  if ((G.deck?.length ?? 0) === 0 && !deps.hasPlayableCardsByInventory(G, playerID)) {
    plans.push({ kind: 'pass', score: 1 });
  }
  if (difficulty === 'easy') return plans;
  return plans.sort((a, b) => b.score - a.score);
};
