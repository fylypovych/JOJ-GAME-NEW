import { useState } from 'react';
import type { AdminDbConfigDraft, AdminStorageMode } from './types';
import type { Language } from '../i18n';

const ADMIN_STORAGE_MODE_STORAGE_KEY = 'joj-admin-storage-mode-v1';
const ADMIN_DB_CONFIG_STORAGE_KEY = 'joj-admin-db-config-v1';

type AdminFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type Args = {
  lang: Language;
  adminFetch: AdminFetch;
  serverUrl: string;
};

export const useDbAdminTools = ({ lang, adminFetch, serverUrl }: Args) => {
  const ADMIN_DB_TEST_CONNECTION_API = `${serverUrl}/api/admin/db/test-connection`;
  const ADMIN_DB_SCHEMA_API = `${serverUrl}/api/admin/db/schema`;
  const ADMIN_DB_IMPORT_SCHEMA_API = `${serverUrl}/api/admin/db/import-schema`;
  const ADMIN_DB_IMPORT_JSON_CONFIG_API = `${serverUrl}/api/admin/db/import-json-config`;
  const ADMIN_DB_EXPORT_BACKUP_API = `${serverUrl}/api/admin/db/export-backup`;
  const ADMIN_DB_RESTORE_BACKUP_API = `${serverUrl}/api/admin/db/restore-backup`;

  const [adminStorageMode, setAdminStorageMode] = useState<AdminStorageMode>(() => {
    const raw = window.localStorage.getItem(ADMIN_STORAGE_MODE_STORAGE_KEY);
    return raw === 'db' ? 'db' : 'file';
  });
  const [adminDbConfigDraft, setAdminDbConfigDraft] = useState<AdminDbConfigDraft>(() => {
    try {
      const raw = window.localStorage.getItem(ADMIN_DB_CONFIG_STORAGE_KEY);
      if (!raw) {
        return { host: '127.0.0.1', port: '5432', database: 'joj_game', user: 'joj_user', password: '', sslMode: 'disable' };
      }
      const parsed = JSON.parse(raw) as Partial<AdminDbConfigDraft>;
      return {
        host: typeof parsed.host === 'string' ? parsed.host : '127.0.0.1',
        port: typeof parsed.port === 'string' ? parsed.port : '5432',
        database: typeof parsed.database === 'string' ? parsed.database : 'joj_game',
        user: typeof parsed.user === 'string' ? parsed.user : 'joj_user',
        password: typeof parsed.password === 'string' ? parsed.password : '',
        sslMode: parsed.sslMode === 'require' ? 'require' : 'disable',
      };
    } catch {
      return { host: '127.0.0.1', port: '5432', database: 'joj_game', user: 'joj_user', password: '', sslMode: 'disable' };
    }
  });

  const [dbConfigSaveStatus, setDbConfigSaveStatus] = useState<string>('');
  const [dbConnectionTestStatus, setDbConnectionTestStatus] = useState<string>('');
  const [dbConnectionTestError, setDbConnectionTestError] = useState<string>('');
  const [dbConnectionTestRunning, setDbConnectionTestRunning] = useState<boolean>(false);
  const [dbExportSchemaStatus, setDbExportSchemaStatus] = useState<string>('');
  const [dbExportSchemaError, setDbExportSchemaError] = useState<string>('');
  const [dbExportSchemaRunning, setDbExportSchemaRunning] = useState<boolean>(false);
  const [dbImportSchemaStatus, setDbImportSchemaStatus] = useState<string>('');
  const [dbImportSchemaError, setDbImportSchemaError] = useState<string>('');
  const [dbImportSchemaRunning, setDbImportSchemaRunning] = useState<boolean>(false);
  const [dbImportJsonConfigStatus, setDbImportJsonConfigStatus] = useState<string>('');
  const [dbImportJsonConfigError, setDbImportJsonConfigError] = useState<string>('');
  const [dbImportJsonConfigRunning, setDbImportJsonConfigRunning] = useState<boolean>(false);
  const [dbExportBackupStatus, setDbExportBackupStatus] = useState<string>('');
  const [dbExportBackupError, setDbExportBackupError] = useState<string>('');
  const [dbExportBackupRunning, setDbExportBackupRunning] = useState<boolean>(false);
  const [dbRestoreBackupStatus, setDbRestoreBackupStatus] = useState<string>('');
  const [dbRestoreBackupError, setDbRestoreBackupError] = useState<string>('');
  const [dbRestoreBackupRunning, setDbRestoreBackupRunning] = useState<boolean>(false);

  const downloadTextFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const saveDbConfigDraft = () => {
    window.localStorage.setItem(ADMIN_DB_CONFIG_STORAGE_KEY, JSON.stringify(adminDbConfigDraft));
    setDbConfigSaveStatus(lang === 'uk' ? 'Налаштування БД збережено локально у браузері.' : 'DB settings saved locally in the browser.');
    setDbConnectionTestStatus('');
    setDbConnectionTestError('');
  };

  const testDbConnection = async () => {
    setDbConfigSaveStatus('');
    setDbConnectionTestStatus('');
    setDbConnectionTestError('');
    setDbConnectionTestRunning(true);
    try {
      const response = await adminFetch(ADMIN_DB_TEST_CONNECTION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminDbConfigDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; message?: string };
      if (!response.ok || !payload.ok) {
        setDbConnectionTestError(payload.details ?? payload.error ?? (lang === 'uk' ? 'Не вдалося підключитися до БД.' : 'Failed to connect to database.'));
        return;
      }
      setDbConnectionTestStatus(payload.message ?? (lang === 'uk' ? 'Підключення до БД успішне.' : 'Database connection successful.'));
    } catch {
      setDbConnectionTestError(lang === 'uk' ? 'Не вдалося підключитися до БД.' : 'Failed to connect to database.');
    } finally {
      setDbConnectionTestRunning(false);
    }
  };

  const exportDbSchema = async () => {
    setDbImportSchemaStatus('');
    setDbImportSchemaError('');
    setDbExportSchemaStatus('');
    setDbExportSchemaError('');
    setDbExportSchemaRunning(true);
    try {
      const response = await adminFetch(ADMIN_DB_SCHEMA_API);
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; filename?: string; content?: string };
      if (!response.ok || !payload.ok || typeof payload.content !== 'string') {
        setDbExportSchemaError(payload.details ?? payload.error ?? (lang === 'uk' ? 'Не вдалося експортувати схему БД.' : 'Failed to export DB schema.'));
        return;
      }
      downloadTextFile(payload.filename || 'db.sql', payload.content, 'application/sql;charset=utf-8');
      setDbExportSchemaStatus(lang === 'uk' ? 'Схему БД експортовано.' : 'DB schema exported.');
    } catch {
      setDbExportSchemaError(lang === 'uk' ? 'Не вдалося експортувати схему БД.' : 'Failed to export DB schema.');
    } finally {
      setDbExportSchemaRunning(false);
    }
  };

  const importDbSchema = async () => {
    setDbImportJsonConfigStatus('');
    setDbImportJsonConfigError('');
    setDbExportSchemaStatus('');
    setDbExportSchemaError('');
    setDbImportSchemaStatus('');
    setDbImportSchemaError('');
    setDbImportSchemaRunning(true);
    try {
      const response = await adminFetch(ADMIN_DB_IMPORT_SCHEMA_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminDbConfigDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; message?: string };
      if (!response.ok || !payload.ok) {
        setDbImportSchemaError(payload.details ?? payload.error ?? (lang === 'uk' ? 'Не вдалося імпортувати db.sql.' : 'Failed to import db.sql.'));
        return;
      }
      setDbImportSchemaStatus(payload.message ?? (lang === 'uk' ? 'Схему БД імпортовано.' : 'DB schema imported.'));
    } catch {
      setDbImportSchemaError(lang === 'uk' ? 'Не вдалося імпортувати db.sql.' : 'Failed to import db.sql.');
    } finally {
      setDbImportSchemaRunning(false);
    }
  };

  const importJsonConfigToDb = async () => {
    setDbImportSchemaStatus('');
    setDbImportSchemaError('');
    setDbImportJsonConfigStatus('');
    setDbImportJsonConfigError('');
    setDbImportJsonConfigRunning(true);
    try {
      const response = await adminFetch(ADMIN_DB_IMPORT_JSON_CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminDbConfigDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; message?: string };
      if (!response.ok || !payload.ok) {
        setDbImportJsonConfigError(payload.details ?? payload.error ?? (lang === 'uk' ? 'Не вдалося імпортувати JSON-дані в БД.' : 'Failed to import JSON data into DB.'));
        return;
      }
      setDbImportJsonConfigStatus(payload.message ?? (lang === 'uk' ? 'JSON-дані імпортовано в БД.' : 'JSON data imported into DB.'));
    } catch {
      setDbImportJsonConfigError(lang === 'uk' ? 'Не вдалося імпортувати JSON-дані в БД.' : 'Failed to import JSON data into DB.');
    } finally {
      setDbImportJsonConfigRunning(false);
    }
  };

  const exportDbBackup = async () => {
    setDbRestoreBackupStatus('');
    setDbRestoreBackupError('');
    setDbExportBackupStatus('');
    setDbExportBackupError('');
    setDbExportBackupRunning(true);
    try {
      const response = await adminFetch(ADMIN_DB_EXPORT_BACKUP_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminDbConfigDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; filename?: string; content?: string };
      if (!response.ok || !payload.ok || typeof payload.content !== 'string') {
        setDbExportBackupError(payload.details ?? payload.error ?? (lang === 'uk' ? 'Не вдалося експортувати резервну копію БД.' : 'Failed to export DB backup.'));
        return;
      }
      downloadTextFile(payload.filename || `joj-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`, payload.content, 'application/sql;charset=utf-8');
      setDbExportBackupStatus(lang === 'uk' ? 'Резервну копію БД експортовано.' : 'DB backup exported.');
    } catch {
      setDbExportBackupError(lang === 'uk' ? 'Не вдалося експортувати резервну копію БД.' : 'Failed to export DB backup.');
    } finally {
      setDbExportBackupRunning(false);
    }
  };

  const restoreDbBackup = async (file: File | null) => {
    setDbExportBackupStatus('');
    setDbExportBackupError('');
    setDbRestoreBackupStatus('');
    setDbRestoreBackupError('');
    if (!file) {
      setDbRestoreBackupError(lang === 'uk' ? 'Оберіть .sql файл резервної копії.' : 'Choose a .sql backup file.');
      return;
    }
    setDbRestoreBackupRunning(true);
    try {
      const sql = await file.text();
      const response = await adminFetch(ADMIN_DB_RESTORE_BACKUP_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...adminDbConfigDraft, filename: file.name, sql }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; message?: string };
      if (!response.ok || !payload.ok) {
        setDbRestoreBackupError(payload.details ?? payload.error ?? (lang === 'uk' ? 'Не вдалося відновити резервну копію БД.' : 'Failed to restore DB backup.'));
        return;
      }
      setDbRestoreBackupStatus(payload.message ?? (lang === 'uk' ? 'Резервну копію БД відновлено.' : 'DB backup restored.'));
    } catch {
      setDbRestoreBackupError(lang === 'uk' ? 'Не вдалося відновити резервну копію БД.' : 'Failed to restore DB backup.');
    } finally {
      setDbRestoreBackupRunning(false);
    }
  };

  return {
    adminStorageMode,
    setAdminStorageMode,
    adminDbConfigDraft,
    setAdminDbConfigDraft,
    dbConfigSaveStatus,
    dbConnectionTestStatus,
    dbConnectionTestError,
    dbConnectionTestRunning,
    dbExportSchemaStatus,
    dbExportSchemaError,
    dbExportSchemaRunning,
    dbImportSchemaStatus,
    dbImportSchemaError,
    dbImportSchemaRunning,
    dbImportJsonConfigStatus,
    dbImportJsonConfigError,
    dbImportJsonConfigRunning,
    dbExportBackupStatus,
    dbExportBackupError,
    dbExportBackupRunning,
    dbRestoreBackupStatus,
    dbRestoreBackupError,
    dbRestoreBackupRunning,
    saveDbConfigDraft,
    testDbConnection,
    exportDbSchema,
    importDbSchema,
    importJsonConfigToDb,
    exportDbBackup,
    restoreDbBackup,
    ADMIN_STORAGE_MODE_STORAGE_KEY,
  };
};

