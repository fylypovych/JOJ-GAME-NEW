import { text } from '../../i18n';
import type { AdminAnalyticsSummary } from '../types';

type T = ReturnType<typeof text>;

export const AdminAnalyticsTab = ({
  t,
  adminAnalytics,
  adminAnalyticsLoading,
  adminAnalyticsError,
  onRefreshAdminAnalytics,
}: {
  t: T;
  adminAnalytics: AdminAnalyticsSummary | null;
  adminAnalyticsLoading: boolean;
  adminAnalyticsError: string;
  onRefreshAdminAnalytics: () => Promise<void> | void;
}) => (
  <>
    <h3>{t.adminAnalyticsTitle}</h3>
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
  </>
);
