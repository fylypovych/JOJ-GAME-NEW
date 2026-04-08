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
  dbExportBackupStatus: ReturnType<typeof useDbAdminTools>['dbExportBackupStatus'];
  dbExportBackupError: ReturnType<typeof useDbAdminTools>['dbExportBackupError'];
  dbExportBackupRunning: ReturnType<typeof useDbAdminTools>['dbExportBackupRunning'];
  dbRestoreBackupStatus: ReturnType<typeof useDbAdminTools>['dbRestoreBackupStatus'];
  dbRestoreBackupError: ReturnType<typeof useDbAdminTools>['dbRestoreBackupError'];
  dbRestoreBackupRunning: ReturnType<typeof useDbAdminTools>['dbRestoreBackupRunning'];
  saveDbConfigDraft: ReturnType<typeof useDbAdminTools>['saveDbConfigDraft'];
  testDbConnection: ReturnType<typeof useDbAdminTools>['testDbConnection'];
  exportDbSchema: ReturnType<typeof useDbAdminTools>['exportDbSchema'];
  importDbSchema: ReturnType<typeof useDbAdminTools>['importDbSchema'];
  importJsonConfigToDb: ReturnType<typeof useDbAdminTools>['importJsonConfigToDb'];
  exportDbBackup: ReturnType<typeof useDbAdminTools>['exportDbBackup'];
  restoreDbBackup: ReturnType<typeof useDbAdminTools>['restoreDbBackup'];
  ADMIN_STORAGE_MODE_STORAGE_KEY: ReturnType<typeof useDbAdminTools>['ADMIN_STORAGE_MODE_STORAGE_KEY'];
  LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY: ReturnType<typeof useDbAdminTools>['LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY'];
}

export const useAppAdminState = (args: UseAppAdminStateArgs): UseAppAdminStateResult => {
  const { serverUrl, lang, adminFetch, enabled } = args;

  return useDbAdminTools({
    lang,
    adminFetch,
    serverUrl,
    enabled,
  });
};
