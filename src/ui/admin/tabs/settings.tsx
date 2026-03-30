import { text } from '../../i18n';
import type { AdminAnalyticsSummary, GitAuthStatus, GitUpdateStatus } from '../types';

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
  loadGitAuthStatus,
  saveGitAuthConfig,
  clearGitAuthConfig,
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
  adminAnalytics,
  adminAnalyticsLoading,
  adminAnalyticsError,
  onRefreshAdminAnalytics,
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
  loadGitAuthStatus: () => Promise<void> | void;
  saveGitAuthConfig: () => Promise<void> | void;
  clearGitAuthConfig: () => Promise<void> | void;
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
  adminAnalytics: AdminAnalyticsSummary | null;
  adminAnalyticsLoading: boolean;
  adminAnalyticsError: string;
  onRefreshAdminAnalytics: () => Promise<void> | void;
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
    <h4>{t.adminAnalyticsTitle}</h4>
    <p className="admin-controls">
      <button type="button" onClick={() => void onRefreshAdminAnalytics()} disabled={adminAnalyticsLoading}>
        {adminAnalyticsLoading ? t.loading : t.refreshRooms}
      </button>
    </p>
    {adminAnalyticsError ? <p className="admin-error">{adminAnalyticsError}</p> : null}
    {adminAnalytics ? (
      <>
        <div className="admin-inline-editor">
          <p>{t.adminAnalyticsMatchesFinished}: <strong>{adminAnalytics.matchesFinished}</strong></p>
          <p>{t.adminAnalyticsRankWins}: <strong>{adminAnalytics.rankWins}</strong></p>
          <p>{t.adminAnalyticsScoreWins}: <strong>{adminAnalytics.scoreWins}</strong></p>
          <p>{t.adminAnalyticsStalledMatches}: <strong>{adminAnalytics.stalledMatches}</strong></p>
          <p>{t.adminAnalyticsAvgTurns}: <strong>{adminAnalytics.avgTurns}</strong></p>
          <p>{t.adminAnalyticsAvgPlayers}: <strong>{adminAnalytics.avgPlayerCount}</strong></p>
          <p>{t.adminAnalyticsAvgBots}: <strong>{adminAnalytics.avgBotCount}</strong></p>
          <p>{t.adminAnalyticsAvgWinnerRank}: <strong>{adminAnalytics.avgWinnerRankOrder}</strong></p>
        </div>
        <h5>{t.adminAnalyticsByMode}</h5>
        {adminAnalytics.byMode.length === 0 ? <p>{t.simulationNoData}</p> : (
          <ul>
            {adminAnalytics.byMode.map((row) => (
              <li key={`analytics-mode-${row.mode}`}>
                {row.mode}: {row.matchesFinished}
                {' | '}{t.adminAnalyticsAvgTurns}: {row.avgTurns}
                {' | '}{t.adminAnalyticsStalledMatches}: {row.stalledMatches}
                {' | '}{t.adminAnalyticsRankWinRate}: {row.rankWinRatePct}%
                {' | '}{t.adminAnalyticsScoreWinRate}: {row.scoreWinRatePct}%
                {' | '}{t.adminAnalyticsStalledRate}: {row.stalledRatePct}%
                {' | '}{t.adminAnalyticsAvgWinnerRank}: {row.avgWinnerRankOrder}
              </li>
            ))}
          </ul>
        )}
        <h5>{t.adminAnalyticsByPlayerCount}</h5>
        {adminAnalytics.byPlayerCount.length === 0 ? <p>{t.simulationNoData}</p> : (
          <ul>
            {adminAnalytics.byPlayerCount.map((row) => (
              <li key={`analytics-players-${row.playerCount}`}>
                {row.playerCount}: {row.matchesFinished}
                {' | '}{t.adminAnalyticsAvgTurns}: {row.avgTurns}
                {' | '}{t.adminAnalyticsStalledMatches}: {row.stalledMatches}
                {' | '}{t.adminAnalyticsRankWinRate}: {row.rankWinRatePct}%
                {' | '}{t.adminAnalyticsScoreWinRate}: {row.scoreWinRatePct}%
                {' | '}{t.adminAnalyticsStalledRate}: {row.stalledRatePct}%
                {' | '}{t.adminAnalyticsAvgWinnerRank}: {row.avgWinnerRankOrder}
              </li>
            ))}
          </ul>
        )}
        <h5>{t.adminAnalyticsTopRanks}</h5>
        {adminAnalytics.topRanks.length === 0 ? <p>{t.simulationNoData}</p> : (
          <ul>
            {adminAnalytics.topRanks.map((row) => (
              <li key={`analytics-rank-${row.rankId}`}>
                {row.rankId}: {row.count}
              </li>
            ))}
          </ul>
        )}
        <h5>{t.adminAnalyticsTopWinningRanks}</h5>
        {adminAnalytics.topWinningRanks.length === 0 ? <p>{t.simulationNoData}</p> : (
          <ul>
            {adminAnalytics.topWinningRanks.map((row) => (
              <li key={`analytics-winning-rank-${row.rankId}`}>
                {row.rankId}: {row.count}
              </li>
            ))}
          </ul>
        )}
      </>
    ) : null}
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
