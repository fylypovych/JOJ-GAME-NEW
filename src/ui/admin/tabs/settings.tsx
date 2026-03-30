import { text } from '../../i18n';
import type { GitAuthStatus, GitUpdateStatus } from '../types';

type T = ReturnType<typeof text>;

export const AdminSettingsTab = ({
  t,
  lang: _lang,
  serverUrlDraft,
  onServerUrlDraftChange,
  onSaveServerUrl,
  onResetServerUrl,
  serverUrl,
  checkGitUpdates,
  applyGitUpdate,
  applyGitDeploy,
  gitAuthStatus,
  gitAuthStatusLoading,
  gitAuthSaving,
  gitAuthUsernameDraft,
  setGitAuthUsernameDraft,
  gitAuthTokenDraft,
  setGitAuthTokenDraft,
  gitIgnoreLocalChanges,
  setGitIgnoreLocalChanges,
  gitCommitMessageDraft,
  setGitCommitMessageDraft,
  loadGitAuthStatus,
  saveGitAuthConfig,
  clearGitAuthConfig,
  gitStatus,
  gitStatusLoading,
  gitUpdateRunning,
  gitDeployRunning,
  gitPublishRunning,
  publishGitChanges,
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
  bugReportImagePath,
  onBugReportImagePathChange,
  onSaveBugReportImagePath,
  onUploadBugReportImage,
  bugReportUiConfigLoading,
  bugReportUiConfigError,
  bugReportUiConfigStatus,
}: {
  t: T;
  lang: 'uk' | 'en';
  serverUrlDraft: string;
  onServerUrlDraftChange: (v: string) => void;
  onSaveServerUrl: (v: string) => void;
  onResetServerUrl: () => void;
  serverUrl: string;
  checkGitUpdates: () => Promise<void> | void;
  applyGitUpdate: () => Promise<void> | void;
  applyGitDeploy: () => Promise<void> | void;
  gitAuthStatus: GitAuthStatus | null;
  gitAuthStatusLoading: boolean;
  gitAuthSaving: boolean;
  gitAuthUsernameDraft: string;
  setGitAuthUsernameDraft: (value: string) => void;
  gitAuthTokenDraft: string;
  setGitAuthTokenDraft: (value: string) => void;
  gitIgnoreLocalChanges: boolean;
  setGitIgnoreLocalChanges: (value: boolean) => void;
  gitCommitMessageDraft: string;
  setGitCommitMessageDraft: (value: string) => void;
  loadGitAuthStatus: () => Promise<void> | void;
  saveGitAuthConfig: () => Promise<void> | void;
  clearGitAuthConfig: () => Promise<void> | void;
  gitStatus: GitUpdateStatus | null;
  gitStatusLoading: boolean;
  gitUpdateRunning: boolean;
  gitDeployRunning: boolean;
  gitPublishRunning: boolean;
  publishGitChanges: () => Promise<void> | void;
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
  bugReportImagePath: string;
  onBugReportImagePathChange: (value: string) => void;
  onSaveBugReportImagePath: () => Promise<void> | void;
  onUploadBugReportImage: (file: File | null) => Promise<void> | void;
  bugReportUiConfigLoading: boolean;
  bugReportUiConfigError: string;
  bugReportUiConfigStatus: string;
}) => (
  <>
    <h3>{t.settingsTitle}</h3>
    <p>{t.settingsHint}</p>
    <p>{t.adminPath}: <code>/admin</code></p>
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
    <h4>{t.bugReportIconSettingsTitle}</h4>
    <p>{t.bugReportIconSettingsHint}</p>
    <p className="admin-controls">
      <label>
        {t.bugReportIconPathLabel}
        <input value={bugReportImagePath} onChange={(e) => onBugReportImagePathChange(e.target.value)} placeholder="/cards/bug-report-icon.webp" />
      </label>
      <button type="button" onClick={() => void onSaveBugReportImagePath()} disabled={bugReportUiConfigLoading}>
        {t.saveServerUrl}
      </button>
      <label>
        {t.bugReportIconUploadLabel}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void onUploadBugReportImage(e.target.files?.[0] ?? null)} />
      </label>
    </p>
    {bugReportImagePath ? (
      <p>
        <img
          className="admin-bug-report-icon-preview"
          src={`${serverUrl}/api/bug-reports/ui-image?path=${encodeURIComponent(bugReportImagePath)}&v=${encodeURIComponent(bugReportImagePath)}`}
          alt={t.bugReportImageAlt}
        />
      </p>
    ) : null}
    {bugReportUiConfigStatus ? <p className="admin-success">{bugReportUiConfigStatus}</p> : null}
    {bugReportUiConfigError ? <p className="admin-error">{bugReportUiConfigError}</p> : null}
    <h4>{t.githubAuthTitle}</h4>
    <p>{t.githubAuthHint}</p>
    <p className="admin-controls">
      <label>
        {t.githubAuthUsernameLabel}
        <input value={gitAuthUsernameDraft} onChange={(e) => setGitAuthUsernameDraft(e.target.value)} placeholder="redukr" autoComplete="username" />
      </label>
      <label>
        {t.githubAuthTokenLabel}
        <input value={gitAuthTokenDraft} onChange={(e) => setGitAuthTokenDraft(e.target.value)} type="password" placeholder="ghp_xxx" autoComplete="new-password" />
      </label>
      <button type="button" onClick={() => void saveGitAuthConfig()} disabled={gitAuthSaving}>
        {gitAuthSaving ? t.githubAuthSaving : t.githubAuthSave}
      </button>
      <button type="button" onClick={() => void clearGitAuthConfig()} disabled={gitAuthSaving || !(gitAuthStatus?.hasGithubCredentials)}>
        {t.githubAuthClear}
      </button>
      <button type="button" onClick={() => void loadGitAuthStatus()} disabled={gitAuthStatusLoading || gitAuthSaving}>
        {gitAuthStatusLoading ? t.githubCheckUpdatesLoading : t.githubAuthRefresh}
      </button>
    </p>
    {gitAuthStatus ? (
      <div className="admin-inline-editor">
        <p>{t.githubAuthRemoteMode}: <code>{gitAuthStatus.remoteAuthMode}</code></p>
        <p>{t.githubAuthHelper}: <code>{gitAuthStatus.helper || '-'}</code></p>
        <p>{t.githubAuthHelperConfigured}: {gitAuthStatus.helperConfigured ? t.yes : t.no}</p>
        <p>{t.githubAuthStored}: {gitAuthStatus.hasGithubCredentials ? t.yes : t.no}</p>
        <p>{t.githubAuthStoredUser}: <code>{gitAuthStatus.savedUsername || '-'}</code></p>
        <p>{t.githubAuthCredentialsPath}: <code>{gitAuthStatus.credentialsPath || '-'}</code></p>
      </div>
    ) : null}
    <h4>{t.githubUpdatesTitle}</h4>
    <p className="admin-controls">
      <label>
        <input
          type="checkbox"
          checked={gitIgnoreLocalChanges}
          onChange={(e) => setGitIgnoreLocalChanges(e.target.checked)}
        />
        {' '}
        {t.githubIgnoreLocalChanges}
      </label>
    </p>
    {gitIgnoreLocalChanges ? <p className="admin-error">{t.githubIgnoreLocalChangesHint}</p> : null}
    <p className="admin-controls">
      <label>
        {t.githubCommitMessageLabel}
        <input
          value={gitCommitMessageDraft}
          onChange={(e) => setGitCommitMessageDraft(e.target.value)}
          placeholder={t.githubCommitMessagePlaceholder}
        />
      </label>
      <button
        type="button"
        onClick={() => void publishGitChanges()}
        disabled={gitPublishRunning || gitUpdateRunning || gitDeployRunning || gitStatusLoading || (gitStatus ? (!gitStatus.dirty && gitStatus.ahead <= 0) : false)}
      >
        {gitPublishRunning ? t.githubPublishLoading : t.githubPublish}
      </button>
    </p>
    <p className="admin-controls">
      <button type="button" onClick={() => void checkGitUpdates()} disabled={gitStatusLoading || gitUpdateRunning || gitDeployRunning}>
        {gitStatusLoading ? t.githubCheckUpdatesLoading : t.githubCheckUpdates}
      </button>
      <button type="button" onClick={() => void applyGitUpdate()} disabled={gitUpdateRunning || gitDeployRunning || gitStatusLoading || (gitStatus ? (!gitStatus.canUpdate && !gitIgnoreLocalChanges) : false)}>
        {gitUpdateRunning ? t.githubApplyUpdateLoading : t.githubApplyUpdate}
      </button>
      <button
        type="button"
        onClick={() => void applyGitDeploy()}
        disabled={gitDeployRunning || gitUpdateRunning || gitStatusLoading || (gitStatus ? (gitStatus.dirty && !gitIgnoreLocalChanges) : false)}
        title={t.githubDeployTooltip}
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
