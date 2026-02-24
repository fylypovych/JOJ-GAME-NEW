import type { CardDefinition, JojGameState, ResourceKey } from './types';

type SetupDeps = {
  shuffle: <T>(items: T[]) => T[];
  cloneCard: (card: CardDefinition) => CardDefinition;
  getSharedDeckTemplate: () => {
    deck: CardDefinition[];
    legendaryDeck: CardDefinition[];
    deckBackImage?: string;
  };
  getActiveRanks: () => Array<{ id: string }>;
  drawCards: (G: JojGameState, playerID: string, amount: number) => void;
  drawLegendaryCards: (G: JojGameState, playerID: string, amount: number) => void;
  syncPlayerState: (G: JojGameState, playerID: string) => void;
  startingHandSize: number;
  startingLegendaryHandSize: number;
};

export const createSimulationState = (
  deps: SetupDeps,
  playerIDs: string[],
  options: { useMainDeck: boolean; useLegendaryDeck: boolean },
): JojGameState => {
  const sharedDeckTemplate = deps.getSharedDeckTemplate();
  const G: JojGameState = {
    deck: options.useMainDeck ? deps.shuffle(sharedDeckTemplate.deck.map(deps.cloneCard)) : [],
    discard: [],
    legendaryDeck: options.useLegendaryDeck ? deps.shuffle(sharedDeckTemplate.legendaryDeck.map(deps.cloneCard)) : [],
    legendaryDiscard: [],
    deckBackImage: sharedDeckTemplate.deckBackImage,
    systemMessageSeq: 0,
    playerNames: {},
    chat: [],
    players: {},
    hands: {},
    legendaryHands: {},
    ranks: {},
    resources: {},
    promotedThisTurn: {},
    lyapScandalShieldUntilTurn: {},
    extraHandPlayTokens: {},
    sukhpayZsuWatchUntilTurn: {},
    sukhpayZsuPendingBonus: {},
  };

  playerIDs.forEach((pid, index) => {
    G.hands[pid] = [];
    G.legendaryHands[pid] = [];
    G.ranks[pid] = deps.getActiveRanks()[0]?.id ?? 'cadet';
    G.resources[pid] = { time: 2, reputation: 2, discipline: 2, documents: 2, tech: 2 } satisfies Record<ResourceKey, number>;
    G.players[pid] = { hand: G.hands[pid], rankId: G.ranks[pid], resources: G.resources[pid] };
    G.playerNames[pid] = `P${index + 1}`;
    G.promotedThisTurn[pid] = false;
    G.lyapScandalShieldUntilTurn[pid] = 0;
    G.extraHandPlayTokens[pid] = 0;
    G.sukhpayZsuWatchUntilTurn[pid] = 0;
    G.sukhpayZsuPendingBonus[pid] = false;
    if (options.useMainDeck) deps.drawCards(G, pid, deps.startingHandSize);
    if (options.useLegendaryDeck) deps.drawLegendaryCards(G, pid, deps.startingLegendaryHandSize);
    deps.syncPlayerState(G, pid);
  });

  return G;
};
