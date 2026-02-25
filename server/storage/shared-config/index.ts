import { createFileSharedConfigStore } from './file';
import { createPostgresSharedConfigStore } from './postgres';
import type { SharedConfigStore, SharedConfigStoreDeps } from './types';

export const createSharedConfigStore = (deps: SharedConfigStoreDeps): SharedConfigStore => {
  const fileStore = createFileSharedConfigStore(deps);
  const storageMode = deps.storageMode ?? 'file';
  const databaseUrl = deps.databaseUrl ?? '';

  if (storageMode !== 'postgres') {
    return {
      saveTemplate: fileStore.saveTemplateToDisk,
      saveRanks: fileStore.saveRanksToDisk,
      loadTemplate: fileStore.loadTemplateFromDisk,
      loadRanks: fileStore.loadRanksFromDisk,
      ...fileStore,
      syncCurrentJsonToPostgres: async () => {
        throw new Error('Shared config storage mode is not postgres');
      },
    };
  }

  const postgresStore = createPostgresSharedConfigStore({ ...deps, databaseUrl });

  return {
    saveTemplate: async () => {
      await postgresStore.saveTemplateToPostgresWithUrl(databaseUrl);
      await fileStore.saveTemplateToDisk();
    },
    saveRanks: async () => {
      await postgresStore.saveRanksToPostgresWithUrl(databaseUrl);
      await fileStore.saveRanksToDisk();
    },
    loadTemplate: async () => {
      try {
        await postgresStore.loadTemplateFromPostgres();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[template] postgres load failed, fallback to disk: ${String(error)}`);
        await fileStore.loadTemplateFromDisk();
        await postgresStore.saveTemplateToPostgresWithUrl(databaseUrl).catch(() => undefined);
      }
    },
    loadRanks: async () => {
      try {
        await postgresStore.loadRanksFromPostgres();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[ranks] postgres load failed, fallback to disk: ${String(error)}`);
        await fileStore.loadRanksFromDisk();
        await postgresStore.saveRanksToPostgresWithUrl(databaseUrl).catch(() => undefined);
      }
    },
    saveTemplateToDisk: async () => {
      await postgresStore.saveTemplateToPostgresWithUrl(databaseUrl);
      await fileStore.saveTemplateToDisk();
    },
    saveRanksToDisk: async () => {
      await postgresStore.saveRanksToPostgresWithUrl(databaseUrl);
      await fileStore.saveRanksToDisk();
    },
    loadTemplateFromDisk: async () => {
      try {
        await postgresStore.loadTemplateFromPostgres();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[template] postgres load failed, fallback to disk: ${String(error)}`);
        await fileStore.loadTemplateFromDisk();
        await postgresStore.saveTemplateToPostgresWithUrl(databaseUrl).catch(() => undefined);
      }
    },
    loadRanksFromDisk: async () => {
      try {
        await postgresStore.loadRanksFromPostgres();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[ranks] postgres load failed, fallback to disk: ${String(error)}`);
        await fileStore.loadRanksFromDisk();
        await postgresStore.saveRanksToPostgresWithUrl(databaseUrl).catch(() => undefined);
      }
    },
    syncCurrentJsonToPostgres: postgresStore.syncCurrentJsonToPostgres,
  };
};

export type { SharedConfigStore, SharedConfigStoreDeps } from './types';
