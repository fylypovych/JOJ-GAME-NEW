import type { PostgresConnDraft } from '../../db/psql';

export type SharedConfigStoreDeps = {
  templatePath: string;
  ranksPath: string;
  exportSharedDeckTemplateJson: () => string;
  importSharedDeckTemplateJson: (text: string) => { ok: true } | { ok: false; error: string };
  getSharedRanks: () => unknown;
  setSharedRanks: (value: any) => boolean;
  resetSharedRanks: () => void;
  storageMode?: 'file' | 'postgres';
  databaseUrl?: string;
};

export type SharedConfigStore = {
  saveTemplate: () => Promise<void>;
  saveRanks: () => Promise<void>;
  loadTemplate: () => Promise<void>;
  loadRanks: () => Promise<void>;
  saveTemplateToDisk: () => Promise<void>;
  saveRanksToDisk: () => Promise<void>;
  loadTemplateFromDisk: () => Promise<void>;
  loadRanksFromDisk: () => Promise<void>;
  syncCurrentJsonToPostgres: (draft?: PostgresConnDraft) => Promise<void>;
};

export type SharedConfigCoreDeps = Pick<
  SharedConfigStoreDeps,
  'templatePath' | 'ranksPath' | 'exportSharedDeckTemplateJson' | 'importSharedDeckTemplateJson' | 'getSharedRanks' | 'setSharedRanks' | 'resetSharedRanks'
>;
