import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from './types';
import type { legendaryTexts as LegendaryTexts } from './systemMessages';

export type MoveCtx = {
  currentPlayer: string;
  activePlayers?: Record<string, string> | null;
  numPlayers?: number;
  playOrder?: string[];
  turn?: number;
};

export type MoveEvents = {
  setStage?: (stage: string) => void;
  endTurn?: () => void;
};

export type MoveArgs = {
  G: JojGameState;
  ctx: MoveCtx;
  playerID?: string;
  events?: MoveEvents;
};

export type ReplacementByTarget = Record<string, ResourceKey[]>;
export type EffectSummary = { resources: Partial<Record<ResourceKey, number>>; rank: number; skipsNextTurn?: boolean };
export type PromotionRankSnapshot = { cost?: Partial<Record<ResourceKey, number>>; bonus?: Partial<Record<ResourceKey, number>> };

export type JojMovesDeps = {
  INVALID_MOVE: 'INVALID_MOVE';
  DRAW_STAGE: string;
  PLAY_STAGE: string;
  END_STAGE: string;
  HAND_LIMIT: number;
  resourceKeys: readonly ResourceKey[];
  resourceLabelsUk: Record<ResourceKey, string>;
  canPlayHandCardAtStage: (args: {
    isCurrentPlayer: boolean;
    stage?: string;
    extraHandPlayTokens: number;
  }) => boolean;
  appendChat: (G: JojGameState, entry: { type: 'player' | 'system'; text: string; playerID?: string }) => void;
  nextSystemMessageSeq: (G: JojGameState) => number;
  getPlayerLabel: (G: JojGameState, playerID: string) => string;
  syncPlayerState: (G: JojGameState, playerID: string) => void;
  isProtectedFromLyapScandal: (G: JojGameState, ctx: Pick<MoveCtx, 'currentPlayer'> & { turn?: number }, playerID: string) => boolean;
  triggerSukhpayZsuOnScandal: (G: JojGameState, ctx: { turn?: number }, sourcePlayerID: string) => void;
  applyCardEffects: (
    G: JojGameState,
    playerID: string,
    effects: CardDefinition['effects'],
    replacementResources?: ResourceKey[],
  ) => boolean;
  applyCardEffectsSoft: (G: JojGameState, playerID: string, effects: CardDefinition['effects']) => EffectSummary;
  planReplacementResources: (
    resources: Record<ResourceKey, number>,
    effects: CardDefinition['effects'],
  ) => ResourceKey[] | null;
  getReplacementUnitsForCard: (resources: Record<ResourceKey, number>, card: CardDefinition) => number;
  summarizeAppliedDiff: (
    beforeResources: Record<ResourceKey, number>,
    afterResources: Record<ResourceKey, number>,
    beforeRankId: string,
    afterRankId: string,
  ) => EffectSummary;
  effectSummaryToText: (summary: EffectSummary) => string;
  resourceDeltaToText: (delta: Partial<Record<ResourceKey, number>>) => string;
  categoryLabelUk: (category: CardDefinition['category']) => string;
  cardFlavorSnippet: (card: CardDefinition) => string;
  rankNameById: (rankId: string) => string;
  buildLyapSystemMessage: (seq: number, playerLabel: string, card: CardDefinition, summary: EffectSummary) => string;
  buildScandalSystemMessage: (seq: number, playerLabel: string, card: CardDefinition, targetSummaries: string[]) => string;
  buildSupportSystemMessage: (seq: number, playerLabel: string, card: CardDefinition, summary: EffectSummary) => string;
  buildPlayedLyapSystemMessage: (
    seq: number,
    sourcePlayerLabel: string,
    targetPlayerLabel: string,
    card: CardDefinition,
    summary: EffectSummary,
  ) => string;
  buildPlayedScandalSystemMessage: (seq: number, sourcePlayerLabel: string, card: CardDefinition, targetSummaries: string[]) => string;
  buildPlayedDecisionSystemMessage: (seq: number, sourcePlayerLabel: string, card: CardDefinition, targetSummaries: string[]) => string;
  buildVvnzRankSystemMessage: (
    seq: number,
    playerLabel: string,
    card: CardDefinition,
    fromRankId: string,
    toRankId: string,
    cost: Partial<Record<ResourceKey, number>>,
    bonus: Partial<Record<ResourceKey, number>>,
    summary: EffectSummary,
  ) => string;
  buildPromotionSystemMessage: (
    seq: number,
    playerLabel: string,
    fromRankId: string,
    toRankId: string,
    cost: Partial<Record<ResourceKey, number>>,
    bonus: Partial<Record<ResourceKey, number>>,
    summary: EffectSummary,
  ) => string;
  buildLegendaryPlayedMessageText: (args: {
    seq: number;
    playerLabel: string;
    cardTitle: string;
    specialMessage: string;
  }) => string;
  legendaryTexts: typeof LegendaryTexts;
  clampNonNegativeResources: (resources: Record<ResourceKey, number>) => void;
  snapshotResourcesForStats: (G: JojGameState) => Record<string, Record<ResourceKey, number>>;
  recordResourceFlowStats: (
    G: JojGameState,
    before: Record<string, Record<ResourceKey, number>>,
  ) => void;
  resetNoPlayablePassStreak: (G: JojGameState) => void;
  shouldCountNoPlayablePass: (G: JojGameState, playerID: string) => boolean;
  hasPlayableCardsByInventory: (G: JojGameState, playerID: string) => boolean;
  incrementNoPlayablePassStreak: (G: JojGameState) => void;
  incrementTurnsCompleted: (G: JojGameState, playerID: string) => void;
  incrementLyapPlayedOnOthers: (G: JojGameState, playerID: string) => void;
  incrementScandalPlayedOnOthers: (G: JojGameState, playerID: string) => void;
  resetEndGameVote: (G: JojGameState) => void;
  computeShieldUntilNextOwnTurn: (ctx: Pick<MoveCtx, 'currentPlayer' | 'playOrder' | 'turn'>, playerID: string) => number;
  cancelLastLyapOrScandalForPlayer: (G: JojGameState, playerID: string) => { canceledCard?: CardDefinition | null; summary: EffectSummary };
  cancelLastScandalForPlayer: (G: JojGameState, playerID: string) => { canceledCard?: CardDefinition | null; summary: EffectSummary };
  promoteToSpecificRank: (G: JojGameState, playerID: string, rankId: string, playerCount: number) => { ok: boolean; rank?: PromotionRankSnapshot };
  grantSpecificRankIgnoringRequirements: (
    G: JojGameState,
    playerID: string,
    rankId: string,
    playerCount: number,
  ) => { ok: true; applied: boolean; rank: PromotionRankSnapshot } | { ok: false; reason: string };
  demoteByOneRankWithSeatCheck: (
    G: JojGameState,
    playerID: string,
    playerCount: number,
  ) => { ok: true; fromRankId: string; toRankId: string } | { ok: false; reason: string };
  promoteRank: (G: JojGameState, playerID: string, playerCount: number) => boolean;
  getActiveRanks: () => RankDefinition[];
};
