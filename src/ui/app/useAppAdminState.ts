import { useDbAdminTools } from '../admin/useDbAdminTools';
import type { Language } from '../i18n';

export interface UseAppAdminStateArgs {
  serverUrl: string;
  lang: Language;
  adminFetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  enabled: boolean;
}

export interface UseAppAdminStateResult {
  adminStorageMode: ReturnType<typeof useDbAdminTools>['adminStorageMode'];
  setAdminStorageMode: ReturnType<typeof useDbAdminTools>['setAdminStorageMode'];
  adminDbConfigDraft: ReturnType<typeof useDbAdminTools>['adminDbConfigDraft'];
  setAdminDbConfigDraft: ReturnType<typeof useDbAdminTools>['setAdminDbConfigDraft'];
  dbConfigSaveStatus: ReturnType<typeof useDbAdminTools>['dbConfigSaveStatus'];
  dbConnectionTestStatus: ReturnType<typeof useDbAdminTools>['dbConnectionTestStatus'];
  dbConnectionTestError: ReturnType<typeof useDbAdminTools>['dbConnectionTestError'];
  dbConnectionTestRunning: ReturnType<typeof useDbAdminTools>['dbConnectionTestRunning'];
  dbExportSchemaStatus: ReturnType<typeof useDbAdminTools>['dbExportSchemaStatus'];
  dbExportSchemaError: ReturnType<typeof useDbAdminTools>['dbExportSchemaError'];
  dbExportSchemaRunning: ReturnType<typeof useDbAdminTools>['dbExportSchemaRunning'];
  dbImportSchemaStatus: ReturnType<typeof useDbAdminTools>['dbImportSchemaStatus'];
  dbImportSchemaError: ReturnType<typeof useDbAdminTools>['dbImportSchemaError'];
  dbImportSchemaRunning: ReturnType<typeof useDbAdminTools>['dbImportSchemaRunning'];
  dbImportJsonConfigStatus: ReturnType<typeof useDbAdminTools>['dbImportJsonConfigStatus'];
  dbImportJsonConfigError: ReturnType<typeof useDbAdminTools>['dbImportJsonConfigError'];
  dbImportJsonConfigRunning: ReturnType<typeof useDbAdminTools>['dbImportJsonConfigRunning'];
  dbCheckSyncStatus: ReturnType<typeof useDbAdminTools>['dbCheckSyncStatus'];
  dbCheckSyncError: ReturnType<typeof useDbAdminTools>['dbCheckSyncError'];
  dbCheckSyncRunning: ReturnType<typeof useDbAdminTools>['dbCheckSyncRunning'];
  dbExportBackupStatus: ReturnType<typeof useDbAdminTools>['dbExportBackupStatus'];
  dbExportBackupError: ReturnType<typeof useDbAdminTools>['dbExportBackupError'];
  dbExportBackupRunning: ReturnType<typeof useDbAdminTools>['dbExportBackupRunning'];
  dbRestoreBackupStatus: ReturnType<typeof useDbAdminTools>['dbRestoreBackupStatus'];
  dbRestoreBackupError: ReturnType<typeof useDbAdminTools>['dbRestoreBackupError'];
  dbRestoreBackupRunning: ReturnType<typeof useDbAdminTools>['dbRestoreBackupRunning'];
  dbSyncMigrationsStatus: ReturnType<typeof useDbAdminTools>['dbSyncMigrationsStatus'];
  dbSyncMigrationsError: ReturnType<typeof useDbAdminTools>['dbSyncMigrationsError'];
  dbSyncMigrationsRunning: ReturnType<typeof useDbAdminTools>['dbSyncMigrationsRunning'];
  saveDbConfigDraft: ReturnType<typeof useDbAdminTools>['saveDbConfigDraft'];
  testDbConnection: ReturnType<typeof useDbAdminTools>['testDbConnection'];
  exportDbSchema: ReturnType<typeof useDbAdminTools>['exportDbSchema'];
  importDbSchema: ReturnType<typeof useDbAdminTools>['importDbSchema'];
  importJsonConfigToDb: ReturnType<typeof useDbAdminTools>['importJsonConfigToDb'];
  syncJsonToPostgresIncremental: ReturnType<typeof useDbAdminTools>['syncJsonToPostgresIncremental'];
  loadFromPostgres: ReturnType<typeof useDbAdminTools>['loadFromPostgres'];
  saveTemplateToPostgres: ReturnType<typeof useDbAdminTools>['saveTemplateToPostgres'];
  checkDbConfigSync: ReturnType<typeof useDbAdminTools>['checkDbConfigSync'];
  exportDbBackup: ReturnType<typeof useDbAdminTools>['exportDbBackup'];
  restoreDbBackup: ReturnType<typeof useDbAdminTools>['restoreDbBackup'];
  syncDbMigrations: ReturnType<typeof useDbAdminTools>['syncDbMigrations'];
  ADMIN_STORAGE_MODE_STORAGE_KEY: ReturnType<typeof useDbAdminTools>['ADMIN_STORAGE_MODE_STORAGE_KEY'];
  LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY: ReturnType<typeof useDbAdminTools>['LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY'];
}

export const useAppAdminState = (args: UseAppAdminStateArgs): UseAppAdminStateResult => {
  const { serverUrl, lang, adminFetch, enabled } = args;

  const result = useDbAdminTools({
    lang,
    serverUrl,
    adminFetch,
    enabled,
  });

  return {
    ...result,
    dbSyncMigrationsStatus: result.dbSyncMigrationsStatus,
    dbSyncMigrationsError: result.dbSyncMigrationsError,
    dbSyncMigrationsRunning: result.dbSyncMigrationsRunning,
    syncDbMigrations: result.syncDbMigrations,
    syncJsonToPostgresIncremental: result.syncJsonToPostgresIncremental,
    loadFromPostgres: result.loadFromPostgres,
    saveTemplateToPostgres: result.saveTemplateToPostgres,
    checkDbConfigSync: result.checkDbConfigSync,
  };
};
