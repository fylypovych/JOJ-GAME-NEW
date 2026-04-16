import { useEffect, useRef, useState } from 'react';
import {
  ADMIN_DB_CONFIG_STORAGE_KEY,
  ADMIN_STORAGE_MODE_STORAGE_KEY,
  LEGACY_ADMIN_DB_CONFIG_STORAGE_KEY,
  LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY,
  createAdminDbApiUrls,
  dbAdminText,
  parseStoredAdminDbConfig,
} from './dbApi';
import type { AdminDbConfigDraft, AdminStorageMode } from './types';
import type { Language } from '../i18n';

type AdminFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type Args = {
  lang: Language;
  adminFetch: AdminFetch;
  serverUrl: string;
  enabled: boolean;
};

export const useDbAdminTools = ({ lang, adminFetch, serverUrl, enabled }: Args) => {
  const api = createAdminDbApiUrls(serverUrl);
  const dbText = dbAdminText(lang);

  const [adminStorageMode, setAdminStorageMode] = useState<AdminStorageMode>('db');
  const [adminDbConfigDraft, setAdminDbConfigDraft] = useState<AdminDbConfigDraft>(() => parseStoredAdminDbConfig(
    window.localStorage.getItem(ADMIN_DB_CONFIG_STORAGE_KEY)
    ?? window.localStorage.getItem(LEGACY_ADMIN_DB_CONFIG_STORAGE_KEY),
  ));

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
  const [dbCheckSyncStatus, setDbCheckSyncStatus] = useState<string>('');
  const [dbCheckSyncError, setDbCheckSyncError] = useState<string>('');
  const [dbCheckSyncRunning, setDbCheckSyncRunning] = useState<boolean>(false);
  const [dbExportBackupStatus, setDbExportBackupStatus] = useState<string>('');
  const [dbExportBackupError, setDbExportBackupError] = useState<string>('');
  const [dbExportBackupRunning, setDbExportBackupRunning] = useState<boolean>(false);
  const [dbRestoreBackupStatus, setDbRestoreBackupStatus] = useState<string>('');
  const [dbRestoreBackupError, setDbRestoreBackupError] = useState<string>('');
  const [dbRestoreBackupRunning, setDbRestoreBackupRunning] = useState<boolean>(false);
  const [dbSyncMigrationsStatus, setDbSyncMigrationsStatus] = useState<string>('');
  const [dbSyncMigrationsError, setDbSyncMigrationsError] = useState<string>('');
  const [dbSyncMigrationsRunning, setDbSyncMigrationsRunning] = useState<boolean>(false);
  const adminFetchRef = useRef(adminFetch);

  useEffect(() => {
    adminFetchRef.current = adminFetch;
  }, [adminFetch]);

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
    window.localStorage.removeItem(LEGACY_ADMIN_DB_CONFIG_STORAGE_KEY);
    setDbConfigSaveStatus(dbText.localSave);
    setDbConnectionTestStatus('');
    setDbConnectionTestError('');
  };

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const loadServerDbUiConfig = async () => {
      try {
        const response = await adminFetchRef.current(api.uiConfig);
        const payload = (await response.json()) as {
          ok?: boolean;
          storageMode?: 'file' | 'db';
          dbConfig?: Partial<AdminDbConfigDraft> | null;
        };
        if (!response.ok || !payload.ok || cancelled) return;
        setAdminStorageMode('db');
        if (payload.dbConfig) {
          setAdminDbConfigDraft((prev) => ({
            host: typeof payload.dbConfig?.host === 'string' ? payload.dbConfig.host : prev.host,
            port: typeof payload.dbConfig?.port === 'string' ? payload.dbConfig.port : prev.port,
            database: typeof payload.dbConfig?.database === 'string' ? payload.dbConfig.database : prev.database,
            user: typeof payload.dbConfig?.user === 'string' ? payload.dbConfig.user : prev.user,
            password: typeof payload.dbConfig?.password === 'string' ? payload.dbConfig.password : prev.password,
            sslMode: payload.dbConfig?.sslMode === 'require' ? 'require' : prev.sslMode,
          }));
        }
      } catch {
        // localStorage fallback is enough
      }
    };
    void loadServerDbUiConfig();
    return () => {
      cancelled = true;
    };
  }, [api.uiConfig, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      try {
        await adminFetchRef.current(api.uiConfig, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storageMode: 'db',
            dbConfig: adminDbConfigDraft,
          }),
        });
      } catch {
        // localStorage still preserves mode on same browser
      }
    })();
  }, [api.uiConfig, adminStorageMode, adminDbConfigDraft, enabled]);

  const saveDbConfigDraftAndServer = () => {
    saveDbConfigDraft();
    void (async () => {
      try {
        await adminFetch(api.uiConfig, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storageMode: 'db',
            dbConfig: adminDbConfigDraft,
          }),
        });
        setDbConfigSaveStatus(dbText.browserAndServerSave);
      } catch {
        // keep local success message if server save failed
      }
    })();
  };

  const testDbConnection = async () => {
    setDbConfigSaveStatus('');
    setDbConnectionTestStatus('');
    setDbConnectionTestError('');
    setDbConnectionTestRunning(true);
    try {
      const response = await adminFetch(api.testConnection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminDbConfigDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; message?: string };
      if (!response.ok || !payload.ok) {
        setDbConnectionTestError(payload.details ?? payload.error ?? dbText.connectionFailed);
        return;
      }
      setDbConnectionTestStatus(payload.message ?? dbText.connectionOk);
    } catch {
      setDbConnectionTestError(dbText.connectionFailed);
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
      const response = await adminFetch(api.schema);
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; filename?: string; content?: string };
      if (!response.ok || !payload.ok || typeof payload.content !== 'string') {
        setDbExportSchemaError(payload.details ?? payload.error ?? dbText.exportSchemaFailed);
        return;
      }
      downloadTextFile(payload.filename || 'db.sql', payload.content, 'application/sql;charset=utf-8');
      setDbExportSchemaStatus(dbText.exportSchemaOk);
    } catch {
      setDbExportSchemaError(dbText.exportSchemaFailed);
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
      const response = await adminFetch(api.importSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminDbConfigDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; message?: string };
      if (!response.ok || !payload.ok) {
        setDbImportSchemaError(payload.details ?? payload.error ?? dbText.importSchemaFailed);
        return;
      }
      setDbImportSchemaStatus(payload.message ?? dbText.importSchemaOk);
    } catch {
      setDbImportSchemaError(dbText.importSchemaFailed);
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
      const response = await adminFetch(api.importJsonConfig, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminDbConfigDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; message?: string };
      if (!response.ok || !payload.ok) {
        setDbImportJsonConfigError(payload.details ?? payload.error ?? dbText.importJsonFailed);
        return;
      }
      setDbImportJsonConfigStatus(payload.message ?? dbText.importJsonOk);
    } catch {
      setDbImportJsonConfigError(dbText.importJsonFailed);
    } finally {
      setDbImportJsonConfigRunning(false);
    }
  };

  const checkDbConfigSync = async () => {
    setDbImportSchemaStatus('');
    setDbImportSchemaError('');
    setDbImportJsonConfigStatus('');
    setDbImportJsonConfigError('');
    setDbCheckSyncStatus('');
    setDbCheckSyncError('');
    setDbCheckSyncRunning(true);
    try {
      const response = await adminFetch(api.checkConfigSync, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...adminDbConfigDraft, compareJson: true }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        details?: string | { mismatches?: string[] };
        message?: string;
      };
      if (!response.ok || !payload.ok) {
        if (payload.details && typeof payload.details === 'object' && Array.isArray(payload.details.mismatches)) {
          const mismatchText = payload.details.mismatches.length > 0
            ? payload.details.mismatches.join('; ')
            : dbText.syncCheckFailed;
          setDbCheckSyncError(mismatchText);
          return;
        }
        setDbCheckSyncError((typeof payload.details === 'string' ? payload.details : '') || payload.error || dbText.syncCheckFailed);
        return;
      }
      setDbCheckSyncStatus(payload.message ?? dbText.syncCheckOk);
    } catch {
      setDbCheckSyncError(dbText.syncCheckFailed);
    } finally {
      setDbCheckSyncRunning(false);
    }
  };

  const syncDbMigrations = async () => {
    setDbSyncMigrationsStatus('');
    setDbSyncMigrationsError('');
    setDbSyncMigrationsRunning(true);
    try {
      const response = await adminFetch(`${serverUrl}/api/admin/db/sync-migrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(adminDbConfigDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; message?: string };
      if (!response.ok || !payload.ok) {
        setDbSyncMigrationsError(payload.details ?? payload.error ?? 'Failed to sync migrations');
        return;
      }
      setDbSyncMigrationsStatus(payload.message ?? 'Migrations synced successfully');
    } catch {
      setDbSyncMigrationsError('Failed to sync migrations');
    } finally {
      setDbSyncMigrationsRunning(false);
    }
  };

  const exportDbBackup = async () => {
    setDbRestoreBackupStatus('');
    setDbRestoreBackupError('');
    setDbExportBackupStatus('');
    setDbExportBackupError('');
    setDbExportBackupRunning(true);
    try {
      const response = await adminFetch(api.exportBackup, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminDbConfigDraft),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; filename?: string; content?: string };
      if (!response.ok || !payload.ok || typeof payload.content !== 'string') {
        setDbExportBackupError(payload.details ?? payload.error ?? dbText.exportBackupFailed);
        return;
      }
      downloadTextFile(payload.filename || `joj-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`, payload.content, 'application/sql;charset=utf-8');
      setDbExportBackupStatus(dbText.exportBackupOk);
    } catch {
      setDbExportBackupError(dbText.exportBackupFailed);
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
      setDbRestoreBackupError(dbText.chooseBackup);
      return;
    }
    setDbRestoreBackupRunning(true);
    try {
      const sql = await file.text();
      const response = await adminFetch(api.restoreBackup, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...adminDbConfigDraft, filename: file.name, sql }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; details?: string; message?: string };
      if (!response.ok || !payload.ok) {
        setDbRestoreBackupError(payload.details ?? payload.error ?? dbText.restoreBackupFailed);
        return;
      }
      setDbRestoreBackupStatus(payload.message ?? dbText.restoreBackupOk);
    } catch {
      setDbRestoreBackupError(dbText.restoreBackupFailed);
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
    dbCheckSyncStatus,
    dbCheckSyncError,
    dbCheckSyncRunning,
    dbExportBackupStatus,
    dbExportBackupError,
    dbExportBackupRunning,
    dbRestoreBackupStatus,
    dbRestoreBackupError,
    dbRestoreBackupRunning,
    dbSyncMigrationsStatus,
    dbSyncMigrationsError,
    dbSyncMigrationsRunning,
    saveDbConfigDraft: saveDbConfigDraftAndServer,
    testDbConnection,
    exportDbSchema,
    importDbSchema,
    importJsonConfigToDb,
    checkDbConfigSync,
    exportDbBackup,
    restoreDbBackup,
    syncDbMigrations,
    ADMIN_STORAGE_MODE_STORAGE_KEY,
    LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY,
  };
};
