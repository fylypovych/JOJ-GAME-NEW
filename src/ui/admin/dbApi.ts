import type { Language } from '../i18n';
import type { AdminDbConfigDraft } from './types';

export const ADMIN_STORAGE_MODE_STORAGE_KEY = 'joj-admin-storage-mode';
export const LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY = 'joj-admin-storage-mode-v1';
export const ADMIN_DB_CONFIG_STORAGE_KEY = 'joj-admin-db-config';
export const LEGACY_ADMIN_DB_CONFIG_STORAGE_KEY = 'joj-admin-db-config-v1';

export const defaultAdminDbConfig = (): AdminDbConfigDraft => ({
  host: '127.0.0.1',
  port: '5432',
  database: 'joj_game',
  user: 'joj_user',
  password: '',
  sslMode: 'disable',
});

export const parseStoredAdminDbConfig = (raw: string | null): AdminDbConfigDraft => {
  if (!raw) return defaultAdminDbConfig();
  try {
    const parsed = JSON.parse(raw) as Partial<AdminDbConfigDraft>;
    const fallback = defaultAdminDbConfig();
    return {
      host: typeof parsed.host === 'string' ? parsed.host : fallback.host,
      port: typeof parsed.port === 'string' ? parsed.port : fallback.port,
      database: typeof parsed.database === 'string' ? parsed.database : fallback.database,
      user: typeof parsed.user === 'string' ? parsed.user : fallback.user,
      password: typeof parsed.password === 'string' ? parsed.password : fallback.password,
      sslMode: parsed.sslMode === 'require' ? 'require' : 'disable',
    };
  } catch {
    return defaultAdminDbConfig();
  }
};

export const createAdminDbApiUrls = (serverUrl: string) => ({
  uiConfig: `${serverUrl}/api/admin/db/ui-config`,
  testConnection: `${serverUrl}/api/admin/db/test-connection`,
  checkConfigSync: `${serverUrl}/api/admin/db/check-config-sync`,
  schema: `${serverUrl}/api/admin/db/schema`,
  importSchema: `${serverUrl}/api/admin/db/import-schema`,
  importJsonConfig: `${serverUrl}/api/admin/db/import-json-config`,
  exportBackup: `${serverUrl}/api/admin/db/export-backup`,
  restoreBackup: `${serverUrl}/api/admin/db/restore-backup`,
});

export const dbAdminText = (lang: Language) => ({
  localSave: lang === 'uk' ? 'Налаштування БД збережено локально у браузері.' : 'DB settings saved locally in the browser.',
  browserAndServerSave: lang === 'uk' ? 'Налаштування БД збережено (браузер + сервер).' : 'DB settings saved (browser + server).',
  connectionFailed: lang === 'uk' ? 'Не вдалося підключитися до БД.' : 'Failed to connect to database.',
  connectionOk: lang === 'uk' ? 'Підключення до БД успішне.' : 'Database connection successful.',
  syncCheckFailed: lang === 'uk' ? 'Не вдалося перевірити синхронізацію даних БД.' : 'Failed to verify DB config synchronization.',
  syncCheckOk: lang === 'uk' ? 'Перевірку синхронізації даних БД завершено.' : 'DB config synchronization check completed.',
  exportSchemaFailed: lang === 'uk' ? 'Не вдалося експортувати схему БД.' : 'Failed to export DB schema.',
  exportSchemaOk: lang === 'uk' ? 'Схему БД експортовано.' : 'DB schema exported.',
  importSchemaFailed: lang === 'uk' ? 'Не вдалося імпортувати db.sql.' : 'Failed to import db.sql.',
  importSchemaOk: lang === 'uk' ? 'Схему БД імпортовано.' : 'DB schema imported.',
  importJsonFailed: lang === 'uk' ? 'Не вдалося імпортувати JSON-дані в БД.' : 'Failed to import JSON data into DB.',
  importJsonOk: lang === 'uk' ? 'JSON-дані імпортовано в БД.' : 'JSON data imported into DB.',
  exportBackupFailed: lang === 'uk' ? 'Не вдалося експортувати резервну копію БД.' : 'Failed to export DB backup.',
  exportBackupOk: lang === 'uk' ? 'Резервну копію БД експортовано.' : 'DB backup exported.',
  chooseBackup: lang === 'uk' ? 'Оберіть .sql файл резервної копії.' : 'Choose a .sql backup file.',
  restoreBackupFailed: lang === 'uk' ? 'Не вдалося відновити резервну копію БД.' : 'Failed to restore DB backup.',
  restoreBackupOk: lang === 'uk' ? 'Резервну копію БД відновлено.' : 'DB backup restored.',
});
