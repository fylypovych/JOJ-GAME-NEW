import type { AdminTab } from '../types';

interface AdminOverviewProps {
  t: ReturnType<typeof import('../../i18n').text>;
  lang: string;
  matches: Array<{ id: string }>;
  cardCatalog: Array<unknown>;
  sharedRanks: Array<{ id: string; name?: string }>;
  sharedDeckTemplate: { modules: Array<unknown> };
  sharedConfigLoaded: boolean;
  activeMatchId: string | null;
  storageMode: string;
  serverUrl: string;
  gitAuthStatus?: { hasGithubCredentials: boolean; savedUsername?: string } | null;
  gitStatus?: { branch?: string; dirty?: boolean; behind?: number } | null;
  gitActionMessage?: string;
  bugReports: Array<{ status: string; submittedBy: { displayName?: string | null; username?: string | null }; descriptionPreview?: string }>;
  assets: Array<{ deletedAt?: string | null; fileName?: string }>;
  adminUsers: Array<{ role: string }>;
  adminUsersLoading: boolean;
  assetsLoading: boolean;
  adminAnalytics?: { matchesFinished: number; avgTurns: number; byMode?: Array<{ mode: string; matchesFinished: number }>; topWinningRanks?: Array<{ rankId: string; count: number }> } | null;
  localizedRankName: (rankId: string) => string;
  setActiveTab: (tab: AdminTab) => void;
}

export const AdminOverview = ({
  t,
  lang,
  matches,
  cardCatalog,
  sharedRanks,
  sharedDeckTemplate,
  sharedConfigLoaded,
  activeMatchId,
  storageMode,
  serverUrl,
  gitAuthStatus,
  gitStatus,
  gitActionMessage,
  bugReports,
  assets,
  adminUsers,
  adminUsersLoading,
  assetsLoading,
  adminAnalytics,
  localizedRankName,
  setActiveTab,
}: AdminOverviewProps) => {
  const v4Text =
    lang === 'uk'
      ? {
          runtimeTitle: 'Стан системи',
          runtimeMeta: 'live',
          storageLabel: 'Сховище',
          serverLabel: 'Сервер',
          configLabel: 'Shared config',
          gitTitle: 'GitHub та деплой',
          gitMeta: 'repo',
          authLabel: 'Доступ',
          repoLabel: 'Гілка',
          syncLabel: 'Синхронізація',
          moderationTitle: 'Модерація',
          moderationMeta: 'reports',
          newReportsLabel: 'Нові',
          resolvedReportsLabel: 'Вирішено',
          latestReporterLabel: 'Останній автор',
          usersAssetsTitle: 'Користувачі та assets',
          usersAssetsMeta: 'library',
          usersLabel: 'Користувачі',
          adminsLabel: 'Адміни',
          assetsLabel: 'Assets',
          latestAssetLabel: 'Останній файл',
          analyticsTitle: 'Пульс матчів',
          analyticsMeta: 'telemetry',
          finishedLabel: 'Завершено',
          avgTurnsLabel: 'Сер. ходів',
          topModeLabel: 'Топ-режим',
          topRankLabel: 'Топ-звання',
          connected: 'підключено',
          notConnected: 'не підключено',
          ready: 'готово',
          loading: 'завантаження',
          clean: 'чисто',
          dirty: 'локальні зміни',
          upToDate: 'актуально',
          noData: 'ще немає даних',
          unknownUser: 'невідомо',
        }
      : {
          runtimeTitle: 'System status',
          runtimeMeta: 'live',
          storageLabel: 'Storage',
          serverLabel: 'Server',
          configLabel: 'Shared config',
          gitTitle: 'GitHub and deploy',
          gitMeta: 'repo',
          authLabel: 'Access',
          repoLabel: 'Branch',
          syncLabel: 'Sync',
          moderationTitle: 'Moderation',
          moderationMeta: 'reports',
          newReportsLabel: 'New',
          resolvedReportsLabel: 'Resolved',
          latestReporterLabel: 'Latest reporter',
          usersAssetsTitle: 'Users and assets',
          usersAssetsMeta: 'library',
          usersLabel: 'Users',
          adminsLabel: 'Admins',
          assetsLabel: 'Assets',
          latestAssetLabel: 'Latest file',
          analyticsTitle: 'Match pulse',
          analyticsMeta: 'telemetry',
          finishedLabel: 'Finished',
          avgTurnsLabel: 'Avg turns',
          topModeLabel: 'Top mode',
          topRankLabel: 'Top rank',
          connected: 'connected',
          notConnected: 'not connected',
          ready: 'ready',
          loading: 'loading',
          clean: 'clean',
          dirty: 'local changes',
          upToDate: 'up to date',
          noData: 'no data yet',
          unknownUser: 'unknown',
        };

  const v4StatCards = [
    { label: t.matches, value: String(matches.length), tone: 'teal' },
    { label: t.deckCount, value: String(cardCatalog.length), tone: 'mint' },
    { label: t.ranksTitle, value: String(sharedRanks.length), tone: 'blue' },
    {
      label: t.roomModulesLabel,
      value: String(sharedDeckTemplate.modules.length),
      tone: 'sand',
    },
  ];

  const adminCount = adminUsers.filter(
    (user) => user.role === 'administrator',
  ).length;
  const unresolvedBugReports = bugReports.filter(
    (report) => report.status === 'new',
  ).length;
  const resolvedBugReports = bugReports.filter(
    (report) => report.status === 'resolved',
  ).length;
  const latestBugReport = bugReports[0] ?? null;
  const latestAsset =
    assets.find((asset) => !asset.deletedAt) ?? assets[0] ?? null;
  const topMode = adminAnalytics?.byMode
    ? [...adminAnalytics.byMode].sort(
        (left, right) => right.matchesFinished - left.matchesFinished,
      )[0]
    : null;
  const topWinningRank = adminAnalytics?.topWinningRanks?.[0] ?? null;

  return (
    <>
      <section className="admin-v2-hero">
        <div>
          <p className="admin-v2-kicker">GreenDesk Control Surface</p>
          <h3>{t.tabStart}</h3>
          <p className="admin-v2-subtitle">
            {sharedConfigLoaded
              ? `PostgreSQL online. Active match: ${activeMatchId || t.notSelected}.`
              : 'Loading shared config, runtime controls and telemetry.'}
          </p>
        </div>
        <div className="admin-v2-hero-actions">
          <button type="button" onClick={() => setActiveTab('matches')}>
            {t.tabMatches}
          </button>
          <button type="button" onClick={() => setActiveTab('settings')}>
            {t.tabSettings}
          </button>
          <button type="button" onClick={() => setActiveTab('github')}>
            {t.tabGithub}
          </button>
        </div>
      </section>
      <section className="admin-v2-stats">
        {v4StatCards.map((card) => (
          <article
            key={card.label}
            className={`admin-v2-stat-card tone-${card.tone}`}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>
      <section className="admin-v2-overview-grid">
        <article className="admin-v2-panel">
          <header className="admin-v2-panel-head">
            <div>
              <p>{v4Text.runtimeMeta}</p>
              <h4>{v4Text.runtimeTitle}</h4>
            </div>
            <span
              className={`admin-v2-badge ${sharedConfigLoaded ? 'is-good' : 'is-warn'}`}
            >
              {sharedConfigLoaded ? v4Text.ready : v4Text.loading}
            </span>
          </header>
          <div className="admin-v2-status-stack">
            <div>
              <span>{v4Text.storageLabel}</span>
              <strong>
                {storageMode === 'db' ? t.storageModeDb : t.storageModeFiles}
              </strong>
            </div>
            <div>
              <span>{v4Text.serverLabel}</span>
              <strong>{serverUrl || t.notSelected}</strong>
            </div>
            <div>
              <span>{v4Text.configLabel}</span>
              <strong>
                {sharedConfigLoaded ? v4Text.ready : v4Text.loading}
              </strong>
            </div>
          </div>
        </article>
        <article className="admin-v2-panel">
          <header className="admin-v2-panel-head">
            <div>
              <p>{v4Text.gitMeta}</p>
              <h4>{v4Text.gitTitle}</h4>
            </div>
            <span
              className={`admin-v2-badge ${gitAuthStatus?.hasGithubCredentials ? 'is-good' : 'is-muted'}`}
            >
              {gitAuthStatus?.hasGithubCredentials
                ? v4Text.connected
                : v4Text.notConnected}
            </span>
          </header>
          <div className="admin-v2-status-stack">
            <div>
              <span>{v4Text.authLabel}</span>
              <strong>
                {gitAuthStatus?.savedUsername || v4Text.notConnected}
              </strong>
            </div>
            <div>
              <span>{v4Text.repoLabel}</span>
              <strong>{gitStatus?.branch || t.notSelected}</strong>
            </div>
            <div>
              <span>{v4Text.syncLabel}</span>
              <strong>
                {gitStatus
                  ? gitStatus.dirty
                    ? v4Text.dirty
                    : (gitStatus.behind ?? 0) > 0
                      ? `${gitStatus.behind} behind`
                      : v4Text.upToDate
                  : v4Text.loading}
              </strong>
            </div>
          </div>
          {gitActionMessage ? (
            <p className="admin-v2-note">{gitActionMessage}</p>
          ) : null}
        </article>
        <article className="admin-v2-panel">
          <header className="admin-v2-panel-head">
            <div>
              <p>{v4Text.moderationMeta}</p>
              <h4>{v4Text.moderationTitle}</h4>
            </div>
            <span
              className={`admin-v2-badge ${unresolvedBugReports > 0 ? 'is-warn' : 'is-good'}`}
            >
              {unresolvedBugReports > 0
                ? `${unresolvedBugReports}`
                : v4Text.clean}
            </span>
          </header>
          <div className="admin-v2-status-stack">
            <div>
              <span>{v4Text.newReportsLabel}</span>
              <strong>{String(unresolvedBugReports)}</strong>
            </div>
            <div>
              <span>{v4Text.resolvedReportsLabel}</span>
              <strong>{String(resolvedBugReports)}</strong>
            </div>
            <div>
              <span>{v4Text.latestReporterLabel}</span>
              <strong>
                {latestBugReport?.submittedBy.displayName ||
                  latestBugReport?.submittedBy.username ||
                  v4Text.unknownUser}
              </strong>
            </div>
          </div>
          <p className="admin-v2-note">
            {latestBugReport?.descriptionPreview || v4Text.noData}
          </p>
        </article>
        <article className="admin-v2-panel">
          <header className="admin-v2-panel-head">
            <div>
              <p>{v4Text.usersAssetsMeta}</p>
              <h4>{v4Text.usersAssetsTitle}</h4>
            </div>
            <span className="admin-v2-badge is-muted">
              {assetsLoading || adminUsersLoading
                ? v4Text.loading
                : v4Text.ready}
            </span>
          </header>
          <div className="admin-v2-status-stack">
            <div>
              <span>{v4Text.usersLabel}</span>
              <strong>{String(adminUsers.length)}</strong>
            </div>
            <div>
              <span>{v4Text.adminsLabel}</span>
              <strong>{String(adminCount)}</strong>
            </div>
            <div>
              <span>{v4Text.assetsLabel}</span>
              <strong>{String(assets.length)}</strong>
            </div>
          </div>
          <p className="admin-v2-note">
            {v4Text.latestAssetLabel}: {latestAsset?.fileName || v4Text.noData}
          </p>
        </article>
        <article className="admin-v2-panel admin-v2-panel-wide">
          <header className="admin-v2-panel-head">
            <div>
              <p>{v4Text.analyticsMeta}</p>
              <h4>{v4Text.analyticsTitle}</h4>
            </div>
            <span
              className={`admin-v2-badge ${adminAnalytics ? 'is-good' : 'is-muted'}`}
            >
              {adminAnalytics
                ? `${adminAnalytics.matchesFinished}`
                : v4Text.loading}
            </span>
          </header>
          <div className="admin-v2-metric-row">
            <div>
              <span>{v4Text.finishedLabel}</span>
              <strong>{String(adminAnalytics?.matchesFinished ?? 0)}</strong>
            </div>
            <div>
              <span>{v4Text.avgTurnsLabel}</span>
              <strong>{String(adminAnalytics?.avgTurns ?? 0)}</strong>
            </div>
            <div>
              <span>{v4Text.topModeLabel}</span>
              <strong>
                {topMode
                  ? `${topMode.mode} · ${topMode.matchesFinished}`
                  : v4Text.noData}
              </strong>
            </div>
            <div>
              <span>{v4Text.topRankLabel}</span>
              <strong>
                {topWinningRank
                  ? `${localizedRankName(topWinningRank.rankId)} · ${topWinningRank.count}`
                  : v4Text.noData}
              </strong>
            </div>
          </div>
        </article>
      </section>
    </>
  );
};
