import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { jojGame } from '../../game/jojGame';
import { Board } from '../Board';
import { BoardV2 } from '../BoardV2';
import { getConfiguredServerUrl } from './model';

export const SERVER_URL = getConfiguredServerUrl();
export const GAME_UI_VARIANT_STORAGE_KEY = 'joj-game-ui-variant-v1';
export const ADMIN_UI_VARIANT_STORAGE_KEY = 'joj-admin-ui-variant-v1';

export const NetworkClientV1 = Client({
  game: jojGame,
  board: Board,
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
