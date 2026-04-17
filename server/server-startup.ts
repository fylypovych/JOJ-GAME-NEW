import type { LogLine } from './file-logger';
import type { isPortAvailable } from './bootstrap-config';

export interface ServerStartupConfig {
  port: number;
}

export interface ServerStartupDeps {
  logLine: LogLine;
  isPortAvailable: typeof isPortAvailable;
  server: { run: (port: number, callback?: () => void) => void };
  sharedConfigStore: {
    loadTemplate: () => Promise<void>;
    loadRanks: () => Promise<void>;
    saveTemplate: () => Promise<void>;
    saveRanks: () => Promise<void>;
  };
  gameAdapter: {
    repairGeneratedRankVisualData: () => { ranksChanged: boolean; templateChanged: boolean };
  };
  userStore: unknown;
}

export const startServer = async (
  config: ServerStartupConfig,
  deps: ServerStartupDeps,
) => {
  const { port } = config;
  const { logLine, isPortAvailable, server, sharedConfigStore, gameAdapter, userStore } = deps;

  await sharedConfigStore.loadTemplate();
  await sharedConfigStore.loadRanks();
  {
    const repair = gameAdapter.repairGeneratedRankVisualData();
    if (repair.ranksChanged) {
      await sharedConfigStore.saveRanks();
      await logLine('INFO', 'shared-ranks repaired with generated rank image bindings');
    }
    if (repair.templateChanged) {
      await sharedConfigStore.saveTemplate();
      await logLine('INFO', 'shared-deck-template repaired with generated rank track sets');
    }
  }
  await logLine(
    userStore ? 'INFO' : 'WARN',
    userStore
      ? 'admin auth enabled (administrator session required)'
      : 'admin auth disabled (user module unavailable)',
  );
  await logLine('INFO', `shared config storage mode=${'postgres'}`);
  const portFree = await isPortAvailable(port);
  if (!portFree) {
    await logLine('ERROR', `server port ${port} is already in use; stop the other process or change PORT`);
    return;
  }
  server.run(port, () => {
    void logLine('INFO', `boardgame.io server running at http://localhost:${port}`);
  });
};
