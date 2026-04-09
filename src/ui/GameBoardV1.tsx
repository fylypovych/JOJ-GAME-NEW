import type { LocalizedBoardProps } from './board/types';
import { GameBoardV2 } from './GameBoardV2';

// Compatibility shell: the legacy v1 entry point now renders the shared board
// implementation with the v1 theme preset.
export const GameBoardV1 = (props: LocalizedBoardProps) => (
  <GameBoardV2 {...props} uiTheme="v1" />
);
