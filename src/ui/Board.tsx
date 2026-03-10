import { BoardV2 } from './BoardV2';
import type { LocalizedBoardProps } from './board/types';

// Keep the legacy board entrypoint as a thin compatibility wrapper.
export const Board = (props: LocalizedBoardProps) => <BoardV2 {...props} />;
