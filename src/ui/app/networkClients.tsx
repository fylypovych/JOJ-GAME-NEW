import type { ComponentProps } from 'react';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { jojGame } from '../../game/jojGame';
import { BoardV4 } from '../BoardV4';
import { SERVER_URL } from './clientConfig';

export const NetworkClientV2 = Client({
  game: jojGame,
  board: BoardV4,
  debug: false,
  numPlayers: 6,
  multiplayer: SocketIO({ server: SERVER_URL }),
});

export const NetworkClientV1 = (props: ComponentProps<typeof NetworkClientV2>) => (
  <NetworkClientV2 {...props} uiTheme="v1" />
);
