import type { BoardProps } from 'boardgame.io/react';
import type { JojGameState, RankDefinition } from '../../game/types';
import type { Language } from '../i18n';

export type LocalizedBoardProps = BoardProps<JojGameState> & {
  lang?: Language;
  playerName?: string;
  knownPlayerNames?: Record<string, string>;
  sharedRanks?: RankDefinition[];
  onStateChange?: (payload: {
    G: JojGameState;
    ctx: unknown;
  }) => void;
};

