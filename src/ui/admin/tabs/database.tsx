import { useState } from 'react';
import { text } from '../../i18n';
import type { AdminDbConfigDraft, AdminStorageMode } from '../types';

type T = ReturnType<typeof text>;

export const AdminDatabaseTab = ({
  t,
  storageMode,
  onStorageModeChange,
  dbConfigDraft,
  onDbConfigDraftChange,
  onSaveDbConfigDraft,
  onTestDbConnection,
  dbConfigSaveStatus,
  dbConnectionTestStatus,
  dbConnectionTestError,
  dbConnectionTestRunning,
  onExportDbSchema,
  onImportDbSchema,
  onExportDbBackup,
  onRestoreDbBackup,
  dbExportSchemaStatus,
  dbExportSchemaError,
  dbExportSchemaRunning,
  dbImportSchemaStatus,
  dbImportSchemaError,
  dbImportSchemaRunning,
  dbExportBackupStatus,
  dbExportBackupError,
  dbExportBackupRunning,
  dbRestoreBackupStatus,
  dbRestoreBackupError,
  dbRestoreBackupRunning,
}: {
  t: T;
  storageMode: AdminStorageMode;
  onStorageModeChange: (mode: AdminStorageMode) => void;
  dbConfigDraft: AdminDbConfigDraft;
  onDbConfigDraftChange: (next: AdminDbConfigDraft) => void;
  onSaveDbConfigDraft: () => void;
  onTestDbConnection: () => Promise<void> | void;
  dbConfigSaveStatus: string;
  dbConnectionTestStatus: string;
  dbConnectionTestError: string;
  dbConnectionTestRunning: boolean;
  onExportDbSchema: () => Promise<void> | void;
  onImportDbSchema: () => Promise<void> | void;
  onExportDbBackup: () => Promise<void> | void;
  onRestoreDbBackup: (file: File | null) => Promise<void> | void;
  dbExportSchemaStatus: string;
  dbExportSchemaError: string;
  dbExportSchemaRunning: boolean;
  dbImportSchemaStatus: string;
  dbImportSchemaError: string;
  dbImportSchemaRunning: boolean;
  dbExportBackupStatus: string;
  dbExportBackupError: string;
  dbExportBackupRunning: boolean;
  dbRestoreBackupStatus: string;
  dbRestoreBackupError: string;
  dbRestoreBackupRunning: boolean;
}) => {
  const [backupFile, setBackupFile] = useState<File | null>(null);
  return (
  <>
    <h3>{t.databaseTabTitle}</h3>
    <p>{t.databaseTabHint}</p>
    <h4>{t.storageModeTitle}</h4>
    <p className="admin-controls">
      <label>
        {t.storageModeLabel}
        <select value={storageMode} onChange={(e) => onStorageModeChange((e.target.value as AdminStorageMode) || 'file')}>
          <option value="file">{t.storageModeFiles}</option>
          <option value="db">{t.storageModeDb}</option>
        </select>
      </label>
    </p>
    <p>{t.storageModeHint}</p>

    {storageMode === 'db' ? (
      <>
        <h4>{t.dbConnectionTitle}</h4>
        <div className="admin-inline-editor">
          <div className="admin-editor-grid">
            <label>{t.dbHostLabel}
              <input value={dbConfigDraft.host} onChange={(e) => onDbConfigDraftChange({ ...dbConfigDraft, host: e.target.value })} placeholder="127.0.0.1" />
            </label>
            <label>{t.dbPortLabel}
              <input value={dbConfigDraft.port} onChange={(e) => onDbConfigDraftChange({ ...dbConfigDraft, port: e.target.value })} placeholder="5432" />
            </label>
            <label>{t.dbNameLabel}
              <input value={dbConfigDraft.database} onChange={(e) => onDbConfigDraftChange({ ...dbConfigDraft, database: e.target.value })} placeholder="joj_game" />
            </label>
            <label>{t.dbUserLabel}
              <input value={dbConfigDraft.user} onChange={(e) => onDbConfigDraftChange({ ...dbConfigDraft, user: e.target.value })} placeholder="joj_user" />
            </label>
            <label>{t.dbPasswordLabel}
              <input type="password" value={dbConfigDraft.password} onChange={(e) => onDbConfigDraftChange({ ...dbConfigDraft, password: e.target.value })} placeholder="********" />
            </label>
            <label>{t.dbSslModeLabel}
              <select
                value={dbConfigDraft.sslMode}
                onChange={(e) => onDbConfigDraftChange({ ...dbConfigDraft, sslMode: (e.target.value as AdminDbConfigDraft['sslMode']) || 'disable' })}
              >
                <option value="disable">{t.dbSslModeDisable}</option>
                <option value="require">{t.dbSslModeRequire}</option>
              </select>
            </label>
          </div>
          <p>{t.dbConnectionHint}</p>
          <p className="admin-controls">
            <button type="button" onClick={onSaveDbConfigDraft}>{t.dbSaveSettings}</button>
            <button type="button" onClick={() => void onTestDbConnection()} disabled={dbConnectionTestRunning}>
              {dbConnectionTestRunning ? t.dbTestConnectionRunning : t.dbTestConnection}
            </button>
          </p>
          {dbConfigSaveStatus ? <p className="admin-success">{dbConfigSaveStatus}</p> : null}
          {dbConnectionTestStatus ? <p className="admin-success">{dbConnectionTestStatus}</p> : null}
          {dbConnectionTestError ? <p className="admin-error">{dbConnectionTestError}</p> : null}
          <p>{t.dbConnectionPreview}: <code>{`postgresql://${dbConfigDraft.user || 'user'}:${dbConfigDraft.password ? '***' : ''}@${dbConfigDraft.host || '127.0.0.1'}:${dbConfigDraft.port || '5432'}/${dbConfigDraft.database || 'database'}?sslmode=${dbConfigDraft.sslMode}`}</code></p>
        </div>

        <h4>{t.dbSchemaTitle}</h4>
        <p>{t.dbSchemaHint}</p>
        <p className="admin-controls">
          <button type="button" onClick={() => void onImportDbSchema()} disabled={dbImportSchemaRunning}>
            {dbImportSchemaRunning ? t.dbImportSchemaRunning : t.dbImportSchema}
          </button>
          <button type="button" onClick={() => void onExportDbSchema()} disabled={dbExportSchemaRunning}>
            {dbExportSchemaRunning ? t.dbExportSchemaRunning : t.dbExportSchema}
          </button>
        </p>
        {dbImportSchemaStatus ? <p className="admin-success">{dbImportSchemaStatus}</p> : null}
        {dbImportSchemaError ? <p className="admin-error">{dbImportSchemaError}</p> : null}
        {dbExportSchemaStatus ? <p className="admin-success">{dbExportSchemaStatus}</p> : null}
        {dbExportSchemaError ? <p className="admin-error">{dbExportSchemaError}</p> : null}

        <h4>{t.dbBackupTitle}</h4>
        <p>{t.dbBackupHint}</p>
        <p className="admin-controls">
          <label>
            {t.dbRestoreBackupFileLabel}
            <input
              type="file"
              accept=".sql,text/plain,application/sql"
              onChange={(e) => setBackupFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </p>
        {backupFile ? <p>{t.dbRestoreBackupFileSelected}: <code>{backupFile.name}</code></p> : null}
        <p className="admin-controls">
          <button type="button" onClick={() => void onRestoreDbBackup(backupFile)} disabled={dbRestoreBackupRunning || !backupFile}>
            {dbRestoreBackupRunning ? t.dbRestoreBackupRunning : t.dbRestoreBackup}
          </button>
          <button type="button" onClick={() => void onExportDbBackup()} disabled={dbExportBackupRunning}>
            {dbExportBackupRunning ? t.dbExportBackupRunning : t.dbExportBackup}
          </button>
        </p>
        {dbRestoreBackupStatus ? <p className="admin-success">{dbRestoreBackupStatus}</p> : null}
        {dbRestoreBackupError ? <p className="admin-error">{dbRestoreBackupError}</p> : null}
        {dbExportBackupStatus ? <p className="admin-success">{dbExportBackupStatus}</p> : null}
        {dbExportBackupError ? <p className="admin-error">{dbExportBackupError}</p> : null}
      </>
    ) : (
      <p>{t.dbTabFileModeHint}</p>
    )}
  </>
  );
};
