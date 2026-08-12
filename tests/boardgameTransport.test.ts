import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { Server } = require('boardgame.io/server') as {
  Server: (options: { games: unknown[]; origins: string[] }) => {
    run: (port: number) => Promise<{
      appServer: {
        address: () => { port: number } | string | null;
        close: () => void;
      };
    }>;
    kill: (servers: { appServer: { close: () => void } }) => void;
  };
};
const { io } = require('socket.io-client') as {
  io: (
    url: string,
    options: Record<string, unknown>,
  ) => {
    connected: boolean;
    once: (event: string, listener: (error?: Error) => void) => void;
    close: () => void;
  };
};

test('boardgame transport accepts a websocket connection with patched dependencies', async () => {
  const server = Server({
    games: [{ name: 'transport-smoke', setup: () => ({}) }],
    origins: ['http://localhost'],
  });
  const servers = await server.run(0);
  const address = servers.appServer.address();
  assert.ok(address && typeof address !== 'string');

  const socket = io(`http://127.0.0.1:${address.port}`, {
    transports: ['websocket'],
    extraHeaders: { Origin: 'http://localhost' },
    reconnection: false,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Socket.IO connection timed out')),
        5_000,
      );
      socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    assert.equal(socket.connected, true);
  } finally {
    socket.close();
    server.kill(servers);
  }
});
