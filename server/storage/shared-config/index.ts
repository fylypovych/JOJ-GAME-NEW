import { createPostgresSharedConfigStore } from './postgres';
import type { SharedConfigStore, SharedConfigStoreDeps } from './types';

export const createSharedConfigStore = (deps: SharedConfigStoreDeps): SharedConfigStore => {
  const storageMode = deps.storageMode ?? 'postgres';
  const databaseUrl = deps.databaseUrl ?? '';

  if (storageMode !== 'postgres' || !databaseUrl) {
    throw new Error('Shared config storage is postgres-only and requires DATABASE_URL');
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
    syncCurrentJsonToPostgres: postgresStore.syncCurrentJsonToPostgres,
    syncJsonToPostgresIncremental: postgresStore.syncJsonToPostgresIncremental,
  };
};

export type { SharedConfigStore, SharedConfigStoreDeps } from './types';
