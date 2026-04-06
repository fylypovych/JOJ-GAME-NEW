import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { jojGame } from '../../game/jojGame';
import { GameBoardV1 } from '../GameBoardV1';
import { GameBoardV2 } from '../GameBoardV2';
import { SERVER_URL } from './clientConfig';

export const NetworkClientV2 = Client({
  game: jojGame,
  board: GameBoardV2,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

export const NetworkClientV1 = Client({
  game: jojGame,
  board: GameBoardV1,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});
