import type { PostgresConnDraft } from '../../db/psql';

export type SharedConfigStoreDeps = {
  exportSharedDeckTemplateJson: () => string;
  exportSharedRanksJson: () => string;
  getCardCatalog: () => unknown[];
  importSharedDeckTemplateJson: (text: string) => { ok: true } | { ok: false; error: string };
  importSharedRanksJson: (text: string) => { ok: true } | { ok: false; error: string };
  resetSharedRanks: () => void;
  storageMode?: 'file' | 'postgres';
  databaseUrl?: string;
};

export type SyncAdditionalConfigsResult = {
  game_ui_config?: boolean;
  bug_report_ui_config?: boolean;
  simulation_baselines?: boolean;
  admin_db_ui_config?: boolean;
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
  syncCurrentJsonToPostgres: (draft?: PostgresConnDraft, appRootDir?: string) => Promise<void>;
  syncJsonToPostgresIncremental: (draft?: PostgresConnDraft) => Promise<void>;
  syncAdditionalJsonConfigsToPostgres?: (targetUrl: string, appRootDir?: string) => Promise<SyncAdditionalConfigsResult>;
};

export type SharedConfigCoreDeps = Pick<
  SharedConfigStoreDeps,
  'exportSharedDeckTemplateJson' | 'exportSharedRanksJson' | 'getCardCatalog' | 'importSharedDeckTemplateJson' | 'importSharedRanksJson' | 'resetSharedRanks'
>;
