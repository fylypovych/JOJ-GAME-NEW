import { createPostgresSharedConfigStore } from './postgres';
import type { SharedConfigStore, SharedConfigStoreDeps } from './types';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const writeJsonMirror = async (rootDir: string | undefined, relativePath: string, content: string) => {
  if (!rootDir) return;
  const targetPath = path.resolve(rootDir, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${content.trimEnd()}\n`, 'utf8');
};

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
      await writeJsonMirror(appRootDir, path.join('database', 'shared-deck-template.json'), deps.exportSharedDeckTemplateJson());
    },
    saveRanks: async () => {
      await postgresStore.saveRanksToPostgresWithUrl(databaseUrl);
      await writeJsonMirror(appRootDir, path.join('database', 'shared-ranks.json'), deps.exportSharedRanksJson());
    },
    loadTemplate: async () => {
      const loadedFromPostgres = await postgresStore.loadTemplateFromPostgres();
      if (!loadedFromPostgres) {
        throw new Error('Failed to load shared deck template from PostgreSQL. Please ensure data exists in the database.');
      }
      await writeJsonMirror(appRootDir, path.join('database', 'shared-deck-template.json'), deps.exportSharedDeckTemplateJson());
    },
    loadRanks: async () => {
      const loadedFromPostgres = await postgresStore.loadRanksFromPostgres();
      if (!loadedFromPostgres) {
        throw new Error('Failed to load shared ranks from PostgreSQL. Please ensure data exists in the database.');
      }
      await writeJsonMirror(appRootDir, path.join('database', 'shared-ranks.json'), deps.exportSharedRanksJson());
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
    syncAdditionalPostgresConfigsToJson: async (targetUrl: string, rootDir?: string) => {
      return postgresStore.syncAdditionalPostgresConfigsToJson(targetUrl, rootDir || appRootDir);
    },
  };
};

export type { SharedConfigStore, SharedConfigStoreDeps, SyncAdditionalConfigsResult } from './types';
// Re-export SyncAdditionalConfigsResult for consumers that need it
