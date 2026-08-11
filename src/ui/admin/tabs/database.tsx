import { useState } from 'react';
import { text } from '../../i18n';
import type { AdminDbConfigDraft, AdminStorageMode } from '../types';
import { AdminSectionHeader, AdminStatusBadge } from '../components/AdminWorkspaceLayout';

type T = ReturnType<typeof text>;

export const AdminDatabaseTab = ({
  t,
  storageMode,
  onStorageModeChange: _onStorageModeChange,
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
  onSyncJsonToPostgresIncremental,
  onLoadFromPostgres,
  onCheckDbConfigSync,
  onExportDbBackup,
  onRestoreDbBackup,
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
  onSyncDbMigrations,
  dbSyncMigrationsStatus,
  dbSyncMigrationsError,
  dbSyncMigrationsRunning,
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
  onSyncJsonToPostgresIncremental: () => Promise<void> | void;
  onLoadFromPostgres: () => Promise<void> | void;
  onSaveTemplateToPostgres: (templateJson: string, ranksJson: string) => Promise<boolean>;
  onCheckDbConfigSync: () => Promise<void> | void;
  onExportDbBackup: () => Promise<void> | void;
  onRestoreDbBackup: (file: File | null) => Promise<void> | void;
  dbExportSchemaStatus: string;
  dbExportSchemaError: string;
  dbExportSchemaRunning: boolean;
  dbImportSchemaStatus: string;
  dbImportSchemaError: string;
  dbImportSchemaRunning: boolean;
  dbImportJsonConfigStatus: string;
  dbImportJsonConfigError: string;
  dbImportJsonConfigRunning: boolean;
  dbCheckSyncStatus: string;
  dbCheckSyncError: string;
  dbCheckSyncRunning: boolean;
  dbExportBackupStatus: string;
  dbExportBackupError: string;
  dbExportBackupRunning: boolean;
  dbRestoreBackupStatus: string;
  dbRestoreBackupError: string;
  dbRestoreBackupRunning: boolean;
  onSyncDbMigrations: () => Promise<void> | void;
  dbSyncMigrationsStatus: string;
  dbSyncMigrationsError: string;
  dbSyncMigrationsRunning: boolean;
}) => {
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [section, setSection] = useState<'connection' | 'migrations' | 'sync' | 'backup' | 'schema'>('connection');
  const sections = [
    ['connection', t.dbConnectionTitle],
    ['migrations', t.dbSyncMigrations],
    ['sync', t.dbCheckSync],
    ['backup', t.dbBackupTitle],
    ['schema', t.dbSchemaTitle],
  ] as const;
  return (
  <div className="admin-database-workspace">
    <AdminSectionHeader title={t.databaseTabTitle} description={t.databaseTabHint} actions={<AdminStatusBadge tone={storageMode === 'db' ? 'success' : 'warning'}>{storageMode === 'db' ? t.storageModeDb : storageMode}</AdminStatusBadge>} />
    <nav className="admin-detail-tabs" aria-label={t.databaseTabTitle}>
      {sections.map(([id, label]) => <button key={id} type="button" className={section === id ? 'is-active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}
    </nav>

    {storageMode === 'db' ? (
      <>
        {section === 'connection' ? <div className="admin-operation-panel">
        <AdminSectionHeader title={t.dbConnectionTitle} description={t.dbConnectionHint} />
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
        </div> : null}

        {section === 'migrations' ? <div className="admin-operation-panel">
        <h4>{t.dbSyncMigrations}</h4>
        <p>{t.dbSyncMigrationsHint}</p>
        <p className="admin-controls">
          <button type="button" onClick={() => void onSyncDbMigrations()} disabled={dbSyncMigrationsRunning}>
            {dbSyncMigrationsRunning ? t.dbSyncMigrationsRunning : t.dbSyncMigrations}
          </button>
        </p>
        {dbSyncMigrationsStatus ? <p className="admin-success">{dbSyncMigrationsStatus}</p> : null}
        {dbSyncMigrationsError ? <p className="admin-error">{dbSyncMigrationsError}</p> : null}
        </div> : null}

        {section === 'sync' ? <div className="admin-operation-panel">
        <h4>{t.dbCheckSync}</h4>
        <p>{t.dbCheckSyncHint}</p>
        <p className="admin-controls">
          <button type="button" onClick={() => void onCheckDbConfigSync()} disabled={dbCheckSyncRunning}>
            {dbCheckSyncRunning ? t.dbCheckSyncRunning : t.dbCheckSync}
          </button>
          <button type="button" onClick={() => void onSyncJsonToPostgresIncremental()} disabled={dbImportJsonConfigRunning}>
            {dbImportJsonConfigRunning ? t.dbImportJsonConfigRunning : t.dbSyncIncremental}
          </button>
          <button type="button" onClick={() => void onLoadFromPostgres()} disabled={dbImportJsonConfigRunning}>
            {dbImportJsonConfigRunning ? t.dbImportJsonConfigRunning : t.dbLoadFromPostgres}
          </button>
        </p>
        {dbCheckSyncStatus ? <p className="admin-success">{dbCheckSyncStatus}</p> : null}
        {dbCheckSyncError ? <p className="admin-error">{dbCheckSyncError}</p> : null}
        {dbImportJsonConfigStatus ? <p className="admin-success">{dbImportJsonConfigStatus}</p> : null}
        {dbImportJsonConfigError ? <p className="admin-error">{dbImportJsonConfigError}</p> : null}
        </div> : null}

        {section === 'backup' ? <div className="admin-operation-panel">
        <h4>{t.dbBackupTitle}</h4>
        <p>{t.dbBackupHint}</p>
        <p className="admin-controls">
          <button type="button" onClick={() => void onExportDbBackup()} disabled={dbExportBackupRunning}>
            {dbExportBackupRunning ? t.dbExportBackupRunning : t.dbExportBackup}
          </button>
        </p>
        <p className="admin-controls">
          <label>
            {t.dbRestoreBackupFileLabel}
            <input
              type="file"
              accept=".sql,text/plain,application/sql"
              onChange={(e) => setBackupFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="admin-danger-action" type="button" onClick={() => { if (backupFile && window.confirm(`${t.dbRestoreBackup}: ${backupFile.name}?`)) void onRestoreDbBackup(backupFile); }} disabled={dbRestoreBackupRunning || !backupFile}>
            {dbRestoreBackupRunning ? t.dbRestoreBackupRunning : t.dbRestoreBackup}
          </button>
        </p>
        {backupFile ? <p>{t.dbRestoreBackupFileSelected}: <code>{backupFile.name}</code></p> : null}
        {dbRestoreBackupStatus ? <p className="admin-success">{dbRestoreBackupStatus}</p> : null}
        {dbRestoreBackupError ? <p className="admin-error">{dbRestoreBackupError}</p> : null}
        {dbExportBackupStatus ? <p className="admin-success">{dbExportBackupStatus}</p> : null}
        {dbExportBackupError ? <p className="admin-error">{dbExportBackupError}</p> : null}
        </div> : null}

        {section === 'schema' ? <div className="admin-operation-panel">
        <h4>{t.dbSchemaTitle}</h4>
        <p>{t.dbSchemaHint}</p>
        <p className="admin-controls">
          <button type="button" onClick={() => void onExportDbSchema()} disabled={dbExportSchemaRunning}>
            {dbExportSchemaRunning ? t.dbExportSchemaRunning : t.dbExportSchema}
          </button>
          <button type="button" onClick={() => void onImportDbSchema()} disabled={dbImportSchemaRunning}>
            {dbImportSchemaRunning ? t.dbImportSchemaRunning : t.dbImportSchema}
          </button>
        </p>
        {dbExportSchemaStatus ? <p className="admin-success">{dbExportSchemaStatus}</p> : null}
        {dbExportSchemaError ? <p className="admin-error">{dbExportSchemaError}</p> : null}
        {dbImportSchemaStatus ? <p className="admin-success">{dbImportSchemaStatus}</p> : null}
        {dbImportSchemaError ? <p className="admin-error">{dbImportSchemaError}</p> : null}
        </div> : null}
      </>
    ) : null}
  </div>
  );
};
