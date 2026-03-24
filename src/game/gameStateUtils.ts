import type { CardDefinition, JojGameState } from './types';

export const HIDDEN_CARD: Pick<CardDefinition, 'id' | 'title' | 'category'> = {
  id: 'hidden',
  title: 'Hidden',
  category: 'SUPPORT',
};

export const cloneGameState = <T,>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // boardgame.io client state can carry non-cloneable internals during optimistic updates
      // while the game state itself remains JSON-safe.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const replaceObjectContents = <T extends object>(target: T, next: T) => {
  Object.keys(target).forEach((key) => {
    if (!(key in next)) delete (target as Record<string, unknown>)[key];
  });
  Object.assign(target, cloneGameState(next));
};

export const restoreGameState = (target: JojGameState, snapshot: JojGameState) => {
  replaceObjectContents(target, snapshot);
};

export const withGameStateTransaction = <T,>(
  G: JojGameState,
  run: () => T,
  shouldRollback: (result: T) => boolean,
): T => {
  const snapshot = cloneGameState(G);
  try {
    const result = run();
    if (shouldRollback(result)) restoreGameState(G, snapshot);
    return result;
  } catch (error) {
    restoreGameState(G, snapshot);
    throw error;
  }
};

const maskHiddenCards = (cards: CardDefinition[]) => cards.map(() => ({ ...HIDDEN_CARD }));
export const SECRET_PLAYER_COLLECTIONS = ['hands', 'legendaryHands'] as const;
export const SECRET_DECK_COLLECTIONS = ['deck', 'legendaryDeck'] as const;

export const createSanitizedPlayerView = (
  G: JojGameState,
  ctx: { gameover?: unknown },
  playerID?: string,
): JojGameState => {
  const revealLegendaryDraftPool =
    G.gameMode === 'standard_plus'
    && Object.keys(G.players ?? {}).some((pid) => G.legendaryDraftCompleted?.[pid] !== true);
  const filteredHands: JojGameState['hands'] = {};
  const filteredLegendaryHands: JojGameState['legendaryHands'] = {};
  Object.entries(G.hands as Record<string, CardDefinition[]>).forEach(([pid, cards]) => {
    filteredHands[pid] = pid === playerID ? cards : maskHiddenCards(cards);
  });
  Object.entries(G.legendaryHands as Record<string, CardDefinition[]>).forEach(([pid, cards]) => {
    filteredLegendaryHands[pid] = pid === playerID ? cards : maskHiddenCards(cards);
  });
  const filteredPlayers: JojGameState['players'] = {};
  Object.entries(G.players).forEach(([pid, state]) => {
    filteredPlayers[pid] = {
      ...state,
      hand: filteredHands[pid],
    };
  });

  return {
    ...G,
    players: filteredPlayers,
    hands: filteredHands,
    legendaryHands: filteredLegendaryHands,
    deck: ctx.gameover ? G.deck : new Array(G.deck.length).fill({ ...HIDDEN_CARD }),
    legendaryDeck: ctx.gameover || revealLegendaryDraftPool
      ? G.legendaryDeck
      : new Array(G.legendaryDeck.length).fill({ ...HIDDEN_CARD }),
  };
};
