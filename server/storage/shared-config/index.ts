import { createPostgresSharedConfigStore } from './postgres';
import type { SharedConfigStore, SharedConfigStoreDeps } from './types';
import { readFile, writeFile } from 'node:fs/promises';

export const createSharedConfigStore = (deps: SharedConfigStoreDeps): SharedConfigStore => {
  const storageMode = deps.storageMode ?? 'postgres';
  const databaseUrl = deps.databaseUrl ?? '';

  // File mode fallback for local development
  if (storageMode === 'file' || !databaseUrl) {
    const saveTemplateToDisk = async () => {
      const json = deps.exportSharedDeckTemplateJson();
      await writeFile(deps.templatePath, json, 'utf8');
    };

    const saveRanksToDisk = async () => {
      const json = deps.exportSharedRanksJson();
      await writeFile(deps.ranksPath, json, 'utf8');
    };

    const loadTemplateFromDisk = async () => {
      try {
        const json = await readFile(deps.templatePath, 'utf8');
        const result = deps.importSharedDeckTemplateJson(json);
        if (!result.ok) {
          console.warn(`Failed to load template from disk: ${result.error}`);
        }
      } catch (error) {
        console.warn(`Error loading template from disk: ${error}`);
      }
    };

    const loadRanksFromDisk = async () => {
      try {
        const json = await readFile(deps.ranksPath, 'utf8');
        const result = deps.importSharedRanksJson(json);
        if (!result.ok) {
          console.warn(`Failed to load ranks from disk: ${result.error}`);
        }
      } catch (error) {
        console.warn(`Error loading ranks from disk: ${error}`);
      }
    };

    return {
      saveTemplate: async () => {
        await saveTemplateToDisk();
      },
      saveRanks: async () => {
        await saveRanksToDisk();
      },
      loadTemplate: async () => {
        await loadTemplateFromDisk();
      },
      loadRanks: async () => {
        await loadRanksFromDisk();
      },
      saveTemplateToDisk,
      saveRanksToDisk,
      loadTemplateFromDisk,
      loadRanksFromDisk,
      syncCurrentJsonToPostgres: async () => {
        // No-op in file mode
      },
      syncJsonToPostgresIncremental: async () => {
        // No-op in file mode
      },
    };
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
