import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { jojGame } from '../../game/jojGame';
import { BoardV2 } from '../BoardV2';
import { BoardV3 } from '../BoardV3';
import { BoardV4 } from '../BoardV4';
import { SERVER_URL } from './clientConfig';

export const NetworkClientV1 = Client({
  game: jojGame,
  board: BoardV2,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

export const NetworkClientV2 = Client({
  game: jojGame,
  board: BoardV2,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

export const NetworkClientV3 = Client({
  game: jojGame,
  board: BoardV3,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

export const NetworkClientV4 = Client({
  game: jojGame,
  board: BoardV4,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});
