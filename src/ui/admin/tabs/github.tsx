import { useEffect, useState } from 'react';
import { text } from '../../i18n';
import { copyText } from '../../app/share';
import type { GitAuthStatus, GitLocalChangesPreview, GitUpdateStatus } from '../types';
import { AdminEmptyState, AdminSectionHeader, AdminStatusBadge } from '../components/AdminWorkspaceLayout';

type T = ReturnType<typeof text>;
type ActionLogTarget = 'github' | 'production' | 'publish' | 'access';

const emptyActionFeedback = (): Record<ActionLogTarget, { log: string; message: string }> => ({
  github: { log: '', message: '' },
  production: { log: '', message: '' },
  publish: { log: '', message: '' },
  access: { log: '', message: '' },
});

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
  applyGitDeploy,
  gitStatus,
  gitStatusLoading,
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
  applyGitDeploy: () => Promise<void> | void;
  gitStatus: GitUpdateStatus | null;
  gitStatusLoading: boolean;
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
}) => {
  const [section, setSection] = useState<'status' | 'publish' | 'access'>('status');
  const [actionLogTarget, setActionLogTarget] = useState<ActionLogTarget>('github');
  const [actionFeedback, setActionFeedback] = useState(emptyActionFeedback);
  const busy = gitStatusLoading || gitDeployRunning || gitPublishRunning;
  useEffect(() => {
    setActionFeedback((current) => ({
      ...current,
      [actionLogTarget]: { log: gitActionLog, message: gitActionMessage },
    }));
  }, [actionLogTarget, gitActionLog, gitActionMessage]);

  const copyLog = (target: ActionLogTarget, value: string) => {
    void copyText(value).then(() => {
      setActionFeedback((current) => ({
        ...current,
        [target]: { ...current[target], message: t.githubLogCopied },
      }));
    });
  };
  const clearLog = (target: ActionLogTarget) => {
    setActionFeedback((current) => ({ ...current, [target]: { log: '', message: '' } }));
    if (target === actionLogTarget) {
      setGitActionLog('');
      setGitActionMessage('');
    }
  };
  const runAction = (target: ActionLogTarget, action: () => Promise<void> | void) => {
    setActionLogTarget(target);
    void action();
  };
  const renderActionFeedback = (target: ActionLogTarget) => {
    const feedback = actionFeedback[target];
    if (!feedback.log && !feedback.message) return null;
    return (
      <div className="admin-process-feedback" aria-live="polite">
        {feedback.message ? <p className="admin-success">{feedback.message}</p> : null}
        {feedback.log ? (
          <div className="admin-inline-log">
            <div className="admin-inline-log-actions">
              <button type="button" onClick={() => copyLog(target, feedback.log)}>{t.githubCopyLog}</button>
              <button type="button" onClick={() => clearLog(target)}>{t.githubClearLog}</button>
            </div>
            <pre className="admin-textarea admin-log-viewer admin-github-log-viewer">{feedback.log}</pre>
          </div>
        ) : null}
      </div>
    );
  };
  const sections = [
    { id: 'status' as const, label: t.githubUpdatesTitle },
    { id: 'publish' as const, label: t.githubPublish },
    { id: 'access' as const, label: t.githubAuthTitle },
  ];
  return (
  <div className="admin-integration-workspace">
    <AdminSectionHeader
      title={gitStatus?.branch || 'GitHub'}
      description={gitStatus?.remote || t.githubAuthHint}
      actions={
        <>
          <AdminStatusBadge tone={gitAuthStatus?.hasGithubCredentials ? 'success' : 'warning'}>{gitAuthStatus?.hasGithubCredentials ? t.githubAuthStored : t.githubAuthClear}</AdminStatusBadge>
          <AdminStatusBadge tone={gitStatus?.dirty ? 'warning' : 'success'}>{gitStatus?.dirty ? t.githubDirty : t.githubCanUpdate}</AdminStatusBadge>
          <button type="button" onClick={() => runAction('github', checkGitUpdates)} disabled={busy}>{gitStatusLoading ? t.githubCheckUpdatesLoading : t.githubCheckUpdates}</button>
        </>
      }
    />
    <nav className="admin-detail-tabs" aria-label={t.githubUpdatesTitle}>
      {sections.map((item) => <button key={item.id} type="button" className={section === item.id ? 'is-active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}>{item.label}</button>)}
    </nav>

    {section === 'status' ? (
      <div className="admin-github-update-workspace">
        {gitStatus ? (
          <>
          <div className="admin-metric-grid admin-git-status-grid">
            <article className="admin-metric-card"><span>{t.githubAhead}</span><strong>{gitStatus.ahead}</strong></article>
            <article className="admin-metric-card"><span>{t.githubBehind}</span><strong>{gitStatus.behind}</strong></article>
            <article className="admin-metric-card"><span>{t.githubDirty}</span><strong>{gitStatus.dirty ? t.yes : t.no}</strong></article>
          </div>
          <div className="admin-info-grid">
            <p><span>{t.githubBranch}</span><code>{gitStatus.branch || '—'}</code></p>
            <p><span>{t.githubUpstream}</span><code>{gitStatus.upstream || '—'}</code></p>
            <p><span>{t.githubHead}</span><code>{gitStatus.head || '—'}</code></p>
            <p><span>{t.githubCanUpdate}</span><strong>{gitStatus.canUpdate ? t.yes : t.no}</strong></p>
          </div>
          {gitStatus.note ? <p className="admin-callout is-warning">{t.githubNote}: {gitStatus.note}</p> : null}
          </>
        ) : <AdminEmptyState>{t.githubCheckUpdates}</AdminEmptyState>}

        <label className="admin-checkbox-card"><input type="checkbox" checked={gitIgnoreLocalChanges} onChange={(e) => setGitIgnoreLocalChanges(e.target.checked)} /><span><strong>{t.githubIgnoreLocalChanges}</strong><small>{t.githubIgnoreLocalChangesHint}</small></span></label>
        <section className="admin-operation-panel admin-update-process-card">
          <AdminSectionHeader title={t.githubDeploy} description={t.githubDeployTooltip} actions={<AdminStatusBadge tone={(gitStatus?.behind ?? 0) > 0 ? 'warning' : 'success'}>{t.githubBehind}: {gitStatus?.behind ?? 0}</AdminStatusBadge>} />
          <div className="admin-action-group">
            <button className="admin-card-primary-action" type="button" onClick={() => runAction('production', applyGitDeploy)} disabled={busy || (gitStatus ? (gitStatus.dirty && !gitIgnoreLocalChanges) : false)}>{gitDeployRunning ? t.githubDeployLoading : t.githubDeploy}</button>
          </div>
          {renderActionFeedback('production')}
        </section>
      </div>
    ) : null}

    {section === 'publish' ? (
      <div className="admin-operation-panel">
        <AdminSectionHeader title={t.githubPublish} description={t.githubPublishHint} actions={<AdminStatusBadge tone={gitStatus?.dirty ? 'warning' : 'success'}>{gitStatus?.dirty ? t.githubDirty : t.githubLocalChangesNone}</AdminStatusBadge>} />
        <label>{t.githubCommitMessageLabel}<input value={gitCommitMessageDraft} onChange={(e) => setGitCommitMessageDraft(e.target.value)} placeholder={t.githubCommitMessagePlaceholder} /></label>
        <div className="admin-action-group">
          <button type="button" onClick={() => runAction('publish', viewGitLocalChanges)} disabled={gitLocalChangesLoading || gitStatusLoading || !gitStatus?.dirty}>{gitLocalChangesLoading ? t.githubViewLocalChangesLoading : t.githubViewLocalChanges}</button>
          <button className="admin-card-primary-action" type="button" onClick={() => runAction('publish', publishGitChanges)} disabled={busy || (gitStatus ? (!gitStatus.dirty && gitStatus.ahead <= 0) : false)}>{gitPublishRunning ? t.githubPublishLoading : t.githubPublish}</button>
        </div>
        {gitLocalChanges?.hasLocalChanges ? (
          <div className="admin-log-panel">
            <AdminSectionHeader title={`${t.githubLocalChangesTitle} · ${gitLocalChanges.files.length}`} actions={<><button type="button" onClick={() => copyLog('publish', gitLocalChanges.diff)}>{t.githubCopyLog}</button><button type="button" onClick={() => { setGitLocalChanges(null); clearLog('publish'); }}>{t.githubClearLog}</button></>} />
            {gitLocalChanges.files.length ? <p><code>{gitLocalChanges.files.join(', ')}</code></p> : null}
            {gitLocalChanges.truncated ? <p className="admin-error">{t.githubLocalChangesTruncated}</p> : null}
            {gitLocalChanges.diff ? <pre className="admin-textarea admin-log-viewer admin-github-log-viewer">{gitLocalChanges.diff}</pre> : null}
          </div>
        ) : null}
        {renderActionFeedback('publish')}
      </div>
    ) : null}

    {section === 'access' ? (
      <div className="admin-operation-panel">
        <AdminSectionHeader title={t.githubAuthTitle} description={t.githubAuthHint} actions={<button type="button" onClick={() => runAction('access', loadGitAuthStatus)} disabled={gitAuthStatusLoading || gitAuthSaving}>{gitAuthStatusLoading ? t.githubCheckUpdatesLoading : t.githubAuthRefresh}</button>} />
        <div className="admin-editor-grid">
          <label>{t.githubAuthUsernameLabel}<input value={gitAuthUsernameDraft} onChange={(e) => setGitAuthUsernameDraft(e.target.value)} placeholder="GitHub username" autoComplete="username" /></label>
          <label>{t.githubAuthTokenLabel}<input value={gitAuthTokenDraft} onChange={(e) => setGitAuthTokenDraft(e.target.value)} type="password" placeholder="github_pat_…" autoComplete="new-password" /></label>
        </div>
        <div className="admin-action-group"><button className="admin-card-primary-action" type="button" onClick={() => runAction('access', saveGitAuthConfig)} disabled={gitAuthSaving}>{gitAuthSaving ? t.githubAuthSaving : t.githubAuthSave}</button><button className="admin-danger-action" type="button" onClick={() => runAction('access', clearGitAuthConfig)} disabled={gitAuthSaving || !gitAuthStatus?.hasGithubCredentials}>{t.githubAuthClear}</button></div>
        {gitAuthStatus ? <div className="admin-info-grid"><p><span>{t.githubAuthRemoteMode}</span><code>{gitAuthStatus.remoteAuthMode}</code></p><p><span>{t.githubAuthHelper}</span><code>{gitAuthStatus.helper || '—'}</code></p><p><span>{t.githubAuthStoredUser}</span><code>{gitAuthStatus.savedUsername || '—'}</code></p><p><span>{t.githubAuthCredentialsPath}</span><code>{gitAuthStatus.credentialsPath || '—'}</code></p></div> : null}
        {renderActionFeedback('access')}
      </div>
    ) : null}
  </div>
  );
};
