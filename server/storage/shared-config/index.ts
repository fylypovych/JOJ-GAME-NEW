import { createPostgresSharedConfigStore } from './postgres';
import type { SharedConfigStore, SharedConfigStoreDeps, SyncAdditionalConfigsResult } from './types';
import path from 'node:path';

export const createSharedConfigStore = (deps: SharedConfigStoreDeps, appRootDir?: string): SharedConfigStore => {
  const storageMode = deps.storageMode ?? 'postgres';
  const databaseUrl = deps.databaseUrl ?? '';

  if (storageMode !== 'postgres') {
    throw new Error(`Unsupported shared config storage mode: ${storageMode}`);
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for shared config store.');
  }

  const postgresStore = createPostgresSharedConfigStore({ ...deps, databaseUrl });

  return {
    saveTemplate: async () => {
      await postgresStore.saveTemplateToPostgresWithUrl(databaseUrl);
    },
    saveRanks: async () => {
      await postgresStore.saveRanksToPostgresWithUrl(databaseUrl);
    },
    loadTemplate: async () => {
      const loadedFromPostgres = await postgresStore.loadTemplateFromPostgres();
      if (!loadedFromPostgres) {
        throw new Error('Failed to load shared deck template from PostgreSQL. Please ensure data exists in the database.');
      }
    },
    loadRanks: async () => {
      const loadedFromPostgres = await postgresStore.loadRanksFromPostgres();
      if (!loadedFromPostgres) {
        throw new Error('Failed to load shared ranks from PostgreSQL. Please ensure data exists in the database.');
      }
    },
    saveTemplateToDisk: async () => {
      await postgresStore.saveTemplateToPostgresWithUrl(databaseUrl);
    },
    saveRanksToDisk: async () => {
      await postgresStore.saveRanksToPostgresWithUrl(databaseUrl);
    },
    loadTemplateFromDisk: async () => {
      await postgresStore.loadTemplateFromPostgres();
    },
    loadRanksFromDisk: async () => {
      await postgresStore.loadRanksFromPostgres();
    },
    syncCurrentJsonToPostgres: async (draft?) => {
      await postgresStore.syncCurrentJsonToPostgres(draft, appRootDir);
    },
    syncJsonToPostgresIncremental: postgresStore.syncJsonToPostgresIncremental,
    syncAdditionalJsonConfigsToPostgres: async (targetUrl: string, rootDir?: string) => {
      return postgresStore.syncAdditionalJsonConfigsToPostgres(targetUrl, rootDir || appRootDir);
    },
  };
};

export type { SharedConfigStore, SharedConfigStoreDeps, SyncAdditionalConfigsResult } from './types';
