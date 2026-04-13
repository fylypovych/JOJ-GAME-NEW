import { buildDeckModulesFromTemplate } from './sharedConfig';
import { createEmptyGameState, initializePlayerInGameState } from './stateFactory';
import type { CardDefinition, GameMode, JojGameState } from './types';
import type { SharedGameSetup } from './sharedConfig';

type SetupDeps = {
  shuffle: <T>(items: T[]) => T[];
  cloneCard: (card: CardDefinition) => CardDefinition;
  getSharedDeckTemplate: () => {
    deck: CardDefinition[];
    legendaryDeck: CardDefinition[];
    rankTrack: CardDefinition[];
    extraCatalog: CardDefinition[];
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

  const G = createEmptyGameState({
    gameMode: mode ?? 'standard',
    deck,
    legendaryDeck,
    deckBackImage: sharedDeckTemplate.deckBackImage,
  });

  playerIDs.forEach((pid, index) => {
    initializePlayerInGameState({
      G,
      playerID: pid,
      playerIndex: index,
      startingRankId: deps.getActiveRanks()[0]?.id ?? 'cadet',
      startingHandSize: G.deck.length > 0 ? deps.startingHandSize : 0,
      startingLegendaryHandSize: deps.startingLegendaryHandSize,
      legendaryDraftCompleted: mode !== 'standard_plus' || legendaryCards.length === 0,
      playerName: `P${index + 1}`,
      drawCards: deps.drawCards,
      drawLegendaryCards: legendaryCards.length > 0 && (mode === 'standard' || (!mode && options.useLegendaryDeck))
        ? deps.drawLegendaryCards
        : undefined,
      legendarySourceCards: legendaryCards.length > 0 && (mode === 'standard' || (!mode && options.useLegendaryDeck))
        ? legendaryCards
        : undefined,
      syncPlayerState: deps.syncPlayerState,
    });
  });

  return G;
};

export const calculateSimulationTurnLimit = (G: JojGameState, playerCount: number): number => {
  const totalCards =
    (G.deck?.length ?? 0)
    + (G.legendaryDeck?.length ?? 0)
    + Object.values(G.hands ?? {}).reduce((sum, hand) => sum + (hand?.length ?? 0), 0)
    + Object.values(G.legendaryHands ?? {}).reduce((sum, hand) => sum + (hand?.length ?? 0), 0)
    + (G.discard?.length ?? 0)
    + (G.legendaryDiscard?.length ?? 0);
  const clampedPlayers = Math.max(1, playerCount);
  const roundLimit = Math.ceil(totalCards / clampedPlayers) + 13;
  return Math.max(clampedPlayers, roundLimit * clampedPlayers);
};
