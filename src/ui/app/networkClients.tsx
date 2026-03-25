import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { jojGame } from '../../game/jojGame';
import { BoardV2 } from '../BoardV2';
import { SERVER_URL } from './clientConfig';
import type { LocalizedBoardProps } from '../board/types';

const BoardV2Client = (props: LocalizedBoardProps) => <BoardV2 {...props} uiVariant="v2" />;
const BoardV3Client = (props: LocalizedBoardProps) => <BoardV2 {...props} uiVariant="v3" />;

export const NetworkClientV1 = Client({
  game: jojGame,
  board: BoardV2,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

export const NetworkClientV2 = Client({
  game: jojGame,
  board: BoardV2Client,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

export const NetworkClientV3 = Client({
  game: jojGame,
  board: BoardV3Client,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});
