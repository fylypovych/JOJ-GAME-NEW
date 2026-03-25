import type { BoardProps } from 'boardgame.io/react';
import type { JojGameState, RankDefinition, ResourceKey } from '../../game/types';
import type { Language } from '../i18n';

export type ReplacementByTarget = Record<string, ResourceKey[]>;

export type JojMoveApi = {
  syncPlayerNames?: (names: Record<string, string>) => void;
  setPlayerName?: (name: string) => void;
  selectLegendaryLoadout?: (cardIds: string[]) => void;
  requestEndGameVote?: () => void;
  respondEndGameVote?: (agree: boolean) => void;
  sendChat?: (text: string) => void;
  drawCard: () => void;
  resolveDrawAutoCard?: (replacementResources?: ResourceKey[], replacementByTarget?: ReplacementByTarget) => void;
  playCard: (
    cardId: string,
    replacementResources?: ResourceKey[],
    targetPlayerID?: string,
    replacementByTarget?: ReplacementByTarget,
  ) => void;
  playLegendaryCard?: (cardId: string, targetPlayerID?: string, selectedResource?: ResourceKey) => void;
  discardFromHand?: (cardId: string) => void;
  promote: () => void;
  endTurn?: () => void;
  pass: () => void;
};

export type LocalizedBoardProps = Omit<BoardProps<JojGameState>, 'moves'> & {
  moves: JojMoveApi;
  lang?: Language;
  uiVariant?: 'v2' | 'v3';
  playerName?: string;
  knownPlayerNames?: Record<string, string>;
  sharedRanks?: RankDefinition[];
  cardImageById?: Record<string, string>;
  roomMeta?: {
    matchID: string;
    playerID?: string;
  };
  onLeaveRoom?: () => void;
  onStateChange?: (payload: {
    G: JojGameState;
    ctx: unknown;
  }) => void;
};
