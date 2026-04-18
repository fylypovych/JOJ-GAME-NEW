import type { CardDefinition, GameMode, JojGameState, ResourceKey } from './types';

const createBaseResourceRow = (): Record<ResourceKey, number> => ({
  time: 1,
  reputation: 1,
  discipline: 1,
  documents: 1,
  tech: 1,
});

const createZeroResourceRow = (): Record<ResourceKey, number> => ({
  time: 0,
  reputation: 0,
  discipline: 0,
  documents: 0,
  tech: 0,
});

const createBasePlayerGameStats = () => ({
  resourcesGainedTotal: 0,
  resourcesLostTotal: 0,
  lyapsPlayedOnOthers: 0,
  scandalsPlayedOnOthers: 0,
  turnsTaken: 0,
});

export const createEmptyGameState = (args: {
  gameMode: GameMode;
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  deckBackImage?: string;
}): JojGameState => ({
  gameMode: args.gameMode,
  deck: args.deck,
  discard: [],
  legendaryDeck: args.legendaryDeck,
  legendaryDiscard: [],
  legendaryDraftCompleted: {},
  deckBackImage: args.deckBackImage,
  systemMessageSeq: 0,
  playerNames: {},
  botPlayers: {},
  chat: [],
  players: {},
  hands: {},
  legendaryHands: {},
  ranks: {},
  rankImageByPlayer: {},
  resources: {},
  promotedThisTurn: {},
  lyapScandalShieldUntilTurn: {},
  extraHandPlayTokens: {},
  sukhpayZsuWatchUntilTurn: {},
  sukhpayZsuPendingBonus: {},
  ignoreSeatLimitForPromotionUntilTurn: {},
  gameStats: {
    turnsCompleted: 0,
    resourcesGainedTotal: 0,
    resourcesLostTotal: 0,
    resourcesGainedByType: createZeroResourceRow(),
    resourcesLostByType: createZeroResourceRow(),
    lyapsPlayedOnOthers: 0,
    scandalsPlayedOnOthers: 0,
  },
  playerGameStats: {},
  noPlayablePassStreak: 0,
  skippedTurnCounts: {},
  endGameVote: {
    active: false,
    requestedBy: null,
    votes: {},
  },
  pendingDrawAutoResolution: null,
  appliedEffectLog: [],
});

export const initializePlayerInGameState = (args: {
  G: JojGameState;
  playerID: string;
  playerIndex: number;
  startingRankId: string;
  startingHandSize: number;
  startingLegendaryHandSize: number;
  legendaryDraftCompleted: boolean;
  playerName: string;
  drawCards: (G: JojGameState, playerID: string, amount: number) => void;
  drawLegendaryCards?: (G: JojGameState, playerID: string, amount: number, sourceCards?: CardDefinition[]) => void;
  legendarySourceCards?: CardDefinition[];
  syncPlayerState: (G: JojGameState, playerID: string) => void;
  onBeforeSync?: (G: JojGameState, playerID: string) => void;
}) => {
  const {
    G,
    playerID,
    playerIndex,
    startingRankId,
    startingHandSize,
    startingLegendaryHandSize,
    legendaryDraftCompleted,
    playerName,
    drawCards,
    drawLegendaryCards,
    legendarySourceCards,
    syncPlayerState,
    onBeforeSync,
  } = args;

  G.hands[playerID] = [];
  G.legendaryHands[playerID] = [];
  G.ranks[playerID] = startingRankId;
  G.resources[playerID] = createBaseResourceRow();
  G.players[playerID] = { hand: G.hands[playerID], rankId: G.ranks[playerID], resources: G.resources[playerID] };
  G.playerNames[playerID] = playerName || `P${playerIndex + 1}`;
  G.promotedThisTurn[playerID] = false;
  G.lyapScandalShieldUntilTurn[playerID] = 0;
  G.extraHandPlayTokens[playerID] = 0;
  G.sukhpayZsuWatchUntilTurn[playerID] = 0;
  G.sukhpayZsuPendingBonus[playerID] = false;
  G.ignoreSeatLimitForPromotionUntilTurn[playerID] = 0;
  G.legendaryDraftCompleted[playerID] = legendaryDraftCompleted;
  G.playerGameStats[playerID] = createBasePlayerGameStats();
  if (!G.skippedTurnCounts) G.skippedTurnCounts = {};
  G.skippedTurnCounts[playerID] = 0;

  drawCards(G, playerID, startingHandSize);
  if (drawLegendaryCards && legendarySourceCards && legendarySourceCards.length > 0) {
    drawLegendaryCards(G, playerID, startingLegendaryHandSize, legendarySourceCards);
  }

  onBeforeSync?.(G, playerID);
  syncPlayerState(G, playerID);
};
