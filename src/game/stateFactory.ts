import type { CardDefinition, GameMode, JojGameState, ResourceKey } from './types';

const createBaseResourceRow = (): Record<ResourceKey, number> => ({
  time: 1,
  reputation: 1,
  discipline: 1,
  documents: 1,
  tech: 1,
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
  gameStats: {
    turnsCompleted: 0,
    resourcesGainedTotal: 0,
    resourcesLostTotal: 0,
    resourcesGainedByType: createBaseResourceRow(),
    resourcesLostByType: createBaseResourceRow(),
    lyapsPlayedOnOthers: 0,
    scandalsPlayedOnOthers: 0,
  },
  noPlayablePassStreak: 0,
  endGameVote: {
    active: false,
    requestedBy: null,
    votes: {},
  },
  pendingDrawAutoResolution: null,
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
  G.legendaryDraftCompleted[playerID] = legendaryDraftCompleted;

  drawCards(G, playerID, startingHandSize);
  if (drawLegendaryCards && legendarySourceCards && legendarySourceCards.length > 0) {
    drawLegendaryCards(G, playerID, startingLegendaryHandSize, legendarySourceCards);
  }

  onBeforeSync?.(G, playerID);
  syncPlayerState(G, playerID);
};
