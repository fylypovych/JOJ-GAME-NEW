import { text } from '../../i18n';
import type { AdminDbConfigDraft, AdminStorageMode, GitUpdateStatus } from '../types';

type T = ReturnType<typeof text>;

export const AdminSettingsTab = ({
  t,
  lang,
  serverUrlDraft,
  onServerUrlDraftChange,
  onSaveServerUrl,
  onResetServerUrl,
  storageMode,
  onStorageModeChange,
  dbConfigDraft,
  onDbConfigDraftChange,
  serverUrl,
  checkGitUpdates,
  applyGitUpdate,
  applyGitDeploy,
  gitStatus,
  gitStatusLoading,
  gitUpdateRunning,
  gitDeployRunning,
  gitActionMessage,
  gitActionLog,
  onResetAll,
  regenerateAllTemplateImages,
  imageRegenRunning,
  restartingServer,
  setAdminActionError,
  setRestartingServer,
  onRestartServer,
  adminActionError,
}: {
  t: T;
  lang: 'uk' | 'en';
  serverUrlDraft: string;
  onServerUrlDraftChange: (v: string) => void;
  onSaveServerUrl: (v: string) => void;
  onResetServerUrl: () => void;
  storageMode: AdminStorageMode;
  onStorageModeChange: (mode: AdminStorageMode) => void;
  dbConfigDraft: AdminDbConfigDraft;
  onDbConfigDraftChange: (next: AdminDbConfigDraft) => void;
  serverUrl: string;
  checkGitUpdates: () => Promise<void> | void;
  applyGitUpdate: () => Promise<void> | void;
  applyGitDeploy: () => Promise<void> | void;
  gitStatus: GitUpdateStatus | null;
  gitStatusLoading: boolean;
  gitUpdateRunning: boolean;
  gitDeployRunning: boolean;
  gitActionMessage: string;
  gitActionLog: string;
  onResetAll: () => void;
  regenerateAllTemplateImages: () => Promise<void> | void;
  imageRegenRunning: boolean;
  restartingServer: boolean;
  setAdminActionError: (value: string) => void;
  setRestartingServer: (value: boolean) => void;
  onRestartServer: () => Promise<boolean>;
  adminActionError: string;
}) => (
  <>
    <h3>{t.settingsTitle}</h3>
    <p>{t.settingsHint}</p>
    <p>{t.adminPath}: <code>/admin</code></p>
    <p>{t.adminMode}: {storageMode === 'db' ? t.storageModeDb : t.storageModeFiles}</p>
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
          <p>{t.dbConnectionPreview}: <code>{`postgresql://${dbConfigDraft.user || 'user'}:${dbConfigDraft.password ? '***' : ''}@${dbConfigDraft.host || '127.0.0.1'}:${dbConfigDraft.port || '5432'}/${dbConfigDraft.database || 'database'}?sslmode=${dbConfigDraft.sslMode}`}</code></p>
        </div>
      </>
    ) : null}
    <h4>{t.serverSettingsTitle}</h4>
    <p className="admin-controls">
      <label>
        {t.serverUrlLabel}
        <input value={serverUrlDraft} onChange={(e) => onServerUrlDraftChange(e.target.value)} placeholder="http://192.168.0.25:8000" />
      </label>
      <button type="button" onClick={() => onSaveServerUrl(serverUrlDraft)}>{t.saveServerUrl}</button>
      <button type="button" onClick={onResetServerUrl}>{t.resetServerUrl}</button>
    </p>
    <p>{t.currentServerUrl}: <code>{serverUrl}</code></p>
    <p>{t.serverUrlReloadHint}</p>
    <h4>{t.githubUpdatesTitle}</h4>
    <p className="admin-controls">
      <button type="button" onClick={() => void checkGitUpdates()} disabled={gitStatusLoading || gitUpdateRunning || gitDeployRunning}>
        {gitStatusLoading ? t.githubCheckUpdatesLoading : t.githubCheckUpdates}
      </button>
      <button type="button" onClick={() => void applyGitUpdate()} disabled={gitUpdateRunning || gitDeployRunning || gitStatusLoading || (gitStatus ? !gitStatus.canUpdate : false)}>
        {gitUpdateRunning ? t.githubApplyUpdateLoading : t.githubApplyUpdate}
      </button>
      <button
        type="button"
        onClick={() => void applyGitDeploy()}
        disabled={gitDeployRunning || gitUpdateRunning || gitStatusLoading || (gitStatus ? gitStatus.dirty : false)}
        title={lang === 'uk' ? 'Git pull + npm install + tsc + vite build + pm2 restart' : 'Git pull + npm install + tsc + vite build + pm2 restart'}
      >
        {gitDeployRunning ? t.githubDeployLoading : t.githubDeploy}
      </button>
    </p>
    {gitStatus ? (
      <div className="admin-inline-editor">
        <p>{t.githubBranch}: <code>{gitStatus.branch || '-'}</code></p>
        <p>{t.githubRemote}: <code>{gitStatus.remote || '-'}</code></p>
        <p>{t.githubUpstream}: <code>{gitStatus.upstream || '-'}</code></p>
        <p>{t.githubCommits}: {t.githubAhead} {gitStatus.ahead} | {t.githubBehind} {gitStatus.behind}</p>
        <p>{t.githubDirty}: {gitStatus.dirty ? t.yes : t.no}</p>
        <p>{t.githubCanUpdate}: {gitStatus.canUpdate ? t.yes : t.no}</p>
        <p>{t.githubHead}: <code>{gitStatus.head || '-'}</code></p>
        {gitStatus.note ? <p>{t.githubNote}: {gitStatus.note}</p> : null}
      </div>
    ) : null}
    {gitActionMessage ? <p className="admin-success">{gitActionMessage}</p> : null}
    {gitActionLog ? <pre className="admin-textarea">{gitActionLog}</pre> : null}
    <h4>{t.systemActions}</h4>
    <p className="admin-controls">
      <button type="button" onClick={onResetAll}>{t.resetAll}</button>
      <button type="button" onClick={() => void regenerateAllTemplateImages()} disabled={imageRegenRunning}>
        {imageRegenRunning ? t.regenerateImagesRunning : t.regenerateImages}
      </button>
      <button
        type="button"
        onClick={() => {
          setAdminActionError('');
          setRestartingServer(true);
          void onRestartServer().then((ok) => {
            setRestartingServer(false);
            if (!ok) setAdminActionError(t.restartServerFailed);
          });
        }}
        disabled={restartingServer}
      >
        {restartingServer ? t.restartingServer : t.restartServer}
      </button>
    </p>
    {adminActionError ? <p className="admin-error">{adminActionError}</p> : null}
  </>
);
