import { buildDeckModulesFromTemplate } from './sharedConfig';
import type { CardDefinition, GameMode, JojGameState, ResourceKey } from './types';
import type { SharedGameSetup } from './sharedConfig';

type SetupDeps = {
  shuffle: <T>(items: T[]) => T[];
  cloneCard: (card: CardDefinition) => CardDefinition;
  getSharedDeckTemplate: () => {
    deck: CardDefinition[];
    legendaryDeck: CardDefinition[];
    rankTrack: CardDefinition[];
    deckBackImage?: string;
    modules: Array<{
      id: string;
      name: string;
      moduleType: 'MAIN_DECK_MODULE' | 'SEPARATE_DECK_MODULE' | 'SYSTEM_MODULE' | 'VISUAL_TRACK_MODULE';
      category: 'LYAP' | 'SCANDAL' | 'SUPPORT' | 'COMMAND' | 'LEGENDARY' | 'VVNZ' | 'RANK';
      cardCount: number;
      enabled: boolean;
      target: 'deck' | 'legendaryDeck' | 'rankTrack';
      cardIds: string[];
      defaultCategory?: CardDefinition['category'];
      deckBackImage?: string;
    }>;
    gameSetup: {
      lyapModuleId?: string;
      scandalModuleId?: string;
      supportModuleId?: string;
      commandModuleId?: string;
      optionalMainDeckModuleIds: string[];
      legendaryModuleId?: string;
      rankModuleId?: string;
      legendaryDeckMode: 'separate' | 'merged';
    };
  };
  getActiveRanks: () => Array<{ id: string }>;
  drawCards: (G: JojGameState, playerID: string, amount: number) => void;
  drawLegendaryCards: (G: JojGameState, playerID: string, amount: number, sourceCards?: CardDefinition[]) => void;
  syncPlayerState: (G: JojGameState, playerID: string) => void;
  startingHandSize: number;
  startingLegendaryHandSize: number;
};

export const createSimulationState = (
  deps: SetupDeps,
  playerIDs: string[],
  options: { useMainDeck: boolean; useLegendaryDeck: boolean; gameMode?: GameMode; gameSetup?: Partial<SharedGameSetup> },
): JojGameState => {
  const sharedDeckTemplate = deps.getSharedDeckTemplate();
  const requestedMode = options.gameMode ?? null;
  const build = buildDeckModulesFromTemplate(sharedDeckTemplate, options.gameSetup);
  const legendaryDeckModeMerged = build.gameSetup.legendaryDeckMode === 'merged';
  const mode = requestedMode && legendaryDeckModeMerged ? 'simplified' as const : requestedMode;

  const mainDeckCards = build.mainDeck.map(deps.cloneCard);
  const legendaryCards = options.useLegendaryDeck ? build.legendaryDeck.map(deps.cloneCard) : [];

  const shouldMergeLegendary = mode === 'simplified' || legendaryDeckModeMerged;
  const deck = shouldMergeLegendary
    ? deps.shuffle([...mainDeckCards, ...legendaryCards])
    : (options.useMainDeck ? deps.shuffle(mainDeckCards) : []);
  const legendaryDeck = shouldMergeLegendary
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
    pendingDrawAutoResolution: null,
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
    G.legendaryDraftCompleted[pid] = mode !== 'standard_plus' || legendaryCards.length === 0;
    if (G.deck.length > 0) deps.drawCards(G, pid, deps.startingHandSize);
    if (legendaryCards.length > 0 && (mode === 'standard' || (!mode && options.useLegendaryDeck))) {
      deps.drawLegendaryCards(G, pid, deps.startingLegendaryHandSize, legendaryCards);
    }
    deps.syncPlayerState(G, pid);
  });

  return G;
};
