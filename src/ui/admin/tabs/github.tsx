import { text } from '../../i18n';
import { copyText } from '../../app/share';
import type { GitAuthStatus, GitLocalChangesPreview, GitUpdateStatus } from '../types';

type T = ReturnType<typeof text>;

export const AdminGithubTab = ({
  t,
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
  checkGitUpdates,
  applyGitUpdate,
  applyGitDeploy,
  gitStatus,
  gitStatusLoading,
  gitUpdateRunning,
  gitDeployRunning,
  gitPublishRunning,
  publishGitChanges,
  gitLocalChanges,
  gitLocalChangesLoading,
  setGitLocalChanges,
  viewGitLocalChanges,
  gitActionMessage,
  gitActionLog,
  setGitActionMessage,
  setGitActionLog,
}: {
  t: T;
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
  loadGitAuthStatus: (args?: { preserveMessages?: boolean }) => Promise<void> | void;
  saveGitAuthConfig: () => Promise<void> | void;
  clearGitAuthConfig: () => Promise<void> | void;
  checkGitUpdates: () => Promise<void> | void;
  applyGitUpdate: () => Promise<void> | void;
  applyGitDeploy: () => Promise<void> | void;
  gitStatus: GitUpdateStatus | null;
  gitStatusLoading: boolean;
  gitUpdateRunning: boolean;
  gitDeployRunning: boolean;
  gitPublishRunning: boolean;
  publishGitChanges: () => Promise<void> | void;
  gitLocalChanges: GitLocalChangesPreview | null;
  gitLocalChangesLoading: boolean;
  setGitLocalChanges: (value: GitLocalChangesPreview | null) => void;
  viewGitLocalChanges: () => Promise<void> | void;
  gitActionMessage: string;
  gitActionLog: string;
  setGitActionMessage: (value: string) => void;
  setGitActionLog: (value: string) => void;
}) => (
  <>
    <h3>{t.githubAuthTitle}</h3>
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
    <p>{t.githubPublishHint}</p>
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
      <button
        type="button"
        onClick={() => void viewGitLocalChanges()}
        disabled={gitLocalChangesLoading || gitStatusLoading || !gitStatus?.dirty}
      >
        {gitLocalChangesLoading ? t.githubViewLocalChangesLoading : t.githubViewLocalChanges}
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
    {gitLocalChanges?.hasLocalChanges ? (
      <div className="admin-inline-editor">
        <h5>{t.githubLocalChangesTitle}</h5>
        <p>
          {t.githubLocalChangesFiles}: {gitLocalChanges.files.length}
        </p>
        {gitLocalChanges.files.length ? (
          <p><code>{gitLocalChanges.files.join(', ')}</code></p>
        ) : null}
        {gitLocalChanges.truncated ? (
          <p className="admin-error">{t.githubLocalChangesTruncated}</p>
        ) : null}
        {gitLocalChanges.diff ? (
          <>
            <p className="admin-controls">
              <button
                type="button"
                onClick={() => {
                  void copyText(gitLocalChanges.diff).then(() => setGitActionMessage(t.githubLogCopied));
                }}
              >
                {t.githubCopyLog}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGitLocalChanges(null);
                  setGitActionMessage('');
                }}
              >
                {t.githubClearLog}
              </button>
            </p>
            <pre className="admin-textarea admin-log-viewer admin-github-log-viewer">{gitLocalChanges.diff}</pre>
          </>
        ) : (
          <p>{t.githubLocalChangesNone}</p>
        )}
      </div>
    ) : null}
    {gitActionMessage ? <p className="admin-success">{gitActionMessage}</p> : null}
    {gitActionLog ? (
      <div className="admin-inline-editor">
        <p className="admin-controls">
          <button
            type="button"
            onClick={() => {
              void copyText(gitActionLog).then(() => setGitActionMessage(t.githubLogCopied));
            }}
          >
            {t.githubCopyLog}
          </button>
          <button
            type="button"
            onClick={() => {
              setGitActionLog('');
              setGitActionMessage('');
            }}
          >
            {t.githubClearLog}
          </button>
        </p>
        <pre className="admin-textarea admin-log-viewer admin-github-log-viewer">{gitActionLog}</pre>
      </div>
    ) : null}
  </>
);
