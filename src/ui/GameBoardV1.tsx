import type { LocalizedBoardProps } from './board/types';
import { GameBoardV2 } from './GameBoardV2';

export const GameBoardV1 = (props: LocalizedBoardProps) => (
  <GameBoardV2 {...props} uiTheme="v1" />
);
