import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { jojGame } from '../../game/jojGame';
import { GameBoardV2WithContext } from '../board/GameBoardV2WithContext';
import { SERVER_URL } from './clientConfig';

export const NetworkClientV2 = Client({
  game: jojGame,
  board: GameBoardV2WithContext,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

export const NetworkClientV1 = Client({
  game: jojGame,
  board: GameBoardV2WithContext,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});
