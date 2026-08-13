export type ResourceKey = 'time' | 'reputation' | 'discipline' | 'documents' | 'tech';
export type EffectResource = ResourceKey | 'rank';

export type CardCategory =
  | 'LYAP'
  | 'SCANDAL'
  | 'SUPPORT'
  | 'COMMAND'
  | 'VVNZ'
  | 'LEGENDARY';

export type GameMode = 'standard' | 'standard_plus' | 'simplified';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type BotProfile = 'balanced' | 'aggressive' | 'control';
export type SystemEventKind = 'event' | 'legendary' | 'scandal' | 'lyap' | 'rank' | 'protection' | 'skip';

export type ChatEntry = {
  id: string;
  type: 'player' | 'system';
  text: string;
  playerID?: string;
  eventKind?: SystemEventKind;
  createdAt: number;
};

export type ChatEntryInput = Omit<ChatEntry, 'id' | 'createdAt'>;

export interface BotPlayerConfig {
  difficulty: BotDifficulty;
  profile: BotProfile;
  name: string;
}

export interface PlayerState {
  hand: Card[];
  rankId: string;
  resources: Record<ResourceKey, number>;
}

export interface Card {
  id: string;
  title: string;
  titleEn?: string;
  category: CardCategory;
  cost?: Partial<Record<ResourceKey, number>>;
  image?: string;
  grantRank?: string;
  effects?: Array<{
    resource: EffectResource;
    value: number;
  }>;
  flavor?: string;
  flavorEn?: string;
}

export interface Rank {
  id: string;
  name: string;
  requirement: Partial<Record<ResourceKey, number>>;
  cost: Partial<Record<ResourceKey, number>>;
  bonus: Partial<Record<ResourceKey, number>>;
  image?: string;
  imageVariants?: string[];
  victory?: boolean;
  flavor?: string;
}

export interface JOJState {
  gameMode: GameMode;
  deck: Card[];
  discard: Card[];
  legendaryDeck: Card[];
  legendaryDiscard: Card[];
  legendaryDraftCompleted: Record<string, boolean>;
  deckBackImage?: string;
  systemMessageSeq: number;
  playerNames: Record<string, string>;
  botPlayers: Record<string, BotPlayerConfig>;
  chat: ChatEntry[];
  players: Record<string, PlayerState>;
  hands: Record<string, Card[]>;
  legendaryHands: Record<string, Card[]>;
  ranks: Record<string, string>;
  rankImageByPlayer: Record<string, string>;
  resources: Record<string, Record<ResourceKey, number>>;
  promotedThisTurn: Record<string, boolean>;
  lyapScandalShieldUntilTurn: Record<string, number>;
  extraHandPlayTokens: Record<string, number>;
  handCardsPlayedThisTurn?: Record<string, number>;
  sukhpayZsuWatchUntilTurn: Record<string, number>;
  sukhpayZsuPendingBonus: Record<string, boolean>;
  ignoreSeatLimitForPromotionUntilTurn: Record<string, number>;
  gameStats: {
    turnsCompleted: number;
    resourcesGainedTotal: number;
    resourcesLostTotal: number;
    resourcesGainedByType: Record<ResourceKey, number>;
    resourcesLostByType: Record<ResourceKey, number>;
    lyapsPlayedOnOthers: number;
    scandalsPlayedOnOthers: number;
  };
  playerGameStats: Record<string, {
    resourcesGainedTotal: number;
    resourcesLostTotal: number;
    lyapsPlayedOnOthers: number;
    scandalsPlayedOnOthers: number;
    turnsTaken: number;
  }>;
  noPlayablePassStreak: number;
  skippedTurnCounts?: Record<string, number>;
  vvnzSkippedTurnCounts?: Record<string, number>;
  endGameVote: {
    active: boolean;
    requestedBy: string | null;
    votes: Record<string, boolean>;
  };
  pendingDrawAutoResolution?: {
    kind: 'LYAP' | 'SCANDAL';
    sourcePlayerID: string;
    card: Card;
  } | null;
  appliedEffectLog?: Array<{
    id: string;
    sourceCardId: string;
    sourceCardTitle: string;
    sourceCategory: 'LYAP' | 'SCANDAL';
    sourcePlayerID: string;
    targetPlayerID: string;
    summary: {
      resources: Partial<Record<ResourceKey, number>>;
      rank: number;
    };
    createdAtTurn?: number;
    canceled?: boolean;
  }>;
}

// Backward-compatible aliases for existing code.
export type CardDefinition = Card;
export type RankDefinition = Rank;
export type JojGameState = JOJState;
