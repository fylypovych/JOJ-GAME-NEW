import type { CardDefinition, GameMode, JojGameState, ResourceKey } from './types';

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

const CORE_MODULE_COUNTS = {
  SCANDAL: 20,
  LYAP: 20,
  SUPPORT: 30,
  DECISION: 30,
} as const;

const takeFixedCount = (
  cards: CardDefinition[],
  count: number,
  shuffle: <T>(items: T[]) => T[],
  cloneCard: (card: CardDefinition) => CardDefinition,
): CardDefinition[] => {
  const normalized = cards.map(cloneCard);
  if (count <= 0 || normalized.length === 0) return [];
  const shuffled = shuffle(normalized);
  if (shuffled.length >= count) return shuffled.slice(0, count).map(cloneCard);
  const out: CardDefinition[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(cloneCard(shuffled[i % shuffled.length]));
  }
  return out;
};

const composeMainDeckModules = (
  cards: CardDefinition[],
  deps: Pick<SetupDeps, 'shuffle' | 'cloneCard'>,
): { baseDeck: CardDefinition[]; vvnzModule: CardDefinition[] } => {
  const byCategory = {
    SCANDAL: cards.filter((card) => card.category === 'SCANDAL'),
    LYAP: cards.filter((card) => card.category === 'LYAP'),
    SUPPORT: cards.filter((card) => card.category === 'SUPPORT'),
    DECISION: cards.filter((card) => card.category === 'DECISION'),
    VVNZ: cards.filter((card) => card.category === 'VVNZ'),
  } as const;

  return {
    baseDeck: [
      ...takeFixedCount(byCategory.SCANDAL, CORE_MODULE_COUNTS.SCANDAL, deps.shuffle, deps.cloneCard),
      ...takeFixedCount(byCategory.LYAP, CORE_MODULE_COUNTS.LYAP, deps.shuffle, deps.cloneCard),
      ...takeFixedCount(byCategory.SUPPORT, CORE_MODULE_COUNTS.SUPPORT, deps.shuffle, deps.cloneCard),
      ...takeFixedCount(byCategory.DECISION, CORE_MODULE_COUNTS.DECISION, deps.shuffle, deps.cloneCard),
    ],
    vvnzModule: byCategory.VVNZ.map(deps.cloneCard),
  };
};

export const createSimulationState = (
  deps: SetupDeps,
  playerIDs: string[],
  options: { useMainDeck: boolean; useLegendaryDeck: boolean; gameMode?: GameMode },
): JojGameState => {
  const sharedDeckTemplate = deps.getSharedDeckTemplate();
  const mode = options.gameMode ?? null;
  const modules = composeMainDeckModules(sharedDeckTemplate.deck, deps);
  const mainDeckCards = [...modules.baseDeck.map(deps.cloneCard), ...modules.vvnzModule.map(deps.cloneCard)];
  const legendaryCards = sharedDeckTemplate.legendaryDeck.map(deps.cloneCard);
  const deck = mode === 'simplified'
    ? deps.shuffle([...mainDeckCards, ...legendaryCards])
    : (options.useMainDeck ? deps.shuffle(mainDeckCards) : []);
  const legendaryDeck = mode === 'simplified'
    ? []
    : mode === 'standard_plus'
      ? legendaryCards
      : (options.useLegendaryDeck ? deps.shuffle(legendaryCards) : []);

  const G: JojGameState = {
    gameMode: mode ?? 'standard',
    deck,
    discard: [],
    legendaryDeck,
    legendaryDiscard: [],
    legendaryDraftCompleted: {},
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
    gameStats: {
      turnsCompleted: 0,
      resourcesGainedTotal: 0,
      resourcesLostTotal: 0,
      resourcesGainedByType: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
      resourcesLostByType: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
      lyapsPlayedOnOthers: 0,
      scandalsPlayedOnOthers: 0,
    },
    noPlayablePassStreak: 0,
    endGameVote: {
      active: false,
      requestedBy: null,
      votes: {},
    },
  };

  playerIDs.forEach((pid, index) => {
    G.hands[pid] = [];
    G.legendaryHands[pid] = [];
    G.ranks[pid] = deps.getActiveRanks()[0]?.id ?? 'cadet';
    G.resources[pid] = { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 } satisfies Record<ResourceKey, number>;
    G.players[pid] = { hand: G.hands[pid], rankId: G.ranks[pid], resources: G.resources[pid] };
    G.playerNames[pid] = `P${index + 1}`;
    G.promotedThisTurn[pid] = false;
    G.lyapScandalShieldUntilTurn[pid] = 0;
    G.extraHandPlayTokens[pid] = 0;
    G.sukhpayZsuWatchUntilTurn[pid] = 0;
    G.sukhpayZsuPendingBonus[pid] = false;
    G.legendaryDraftCompleted[pid] = mode !== 'standard_plus';
    if (G.deck.length > 0) deps.drawCards(G, pid, deps.startingHandSize);
    if (mode === 'standard' || (!mode && options.useLegendaryDeck)) {
      deps.drawLegendaryCards(G, pid, deps.startingLegendaryHandSize);
    }
    deps.syncPlayerState(G, pid);
  });

  return G;
};
