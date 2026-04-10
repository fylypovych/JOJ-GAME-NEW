import { useState } from 'react';
import type { Language } from '../../i18n';
import { text } from '../../i18n';
import type { AuthUser, UserAward, UserStats } from '../useUserAccount';
import type { UserMatchHistoryItem, UserSession } from '../useUserAccount';
import {
  formatGameModeLabel,
  formatMatchOutcomeLabel,
  formatBotDifficultyLabel,
  localizeRankValue,
} from '../section-helpers';

type T = ReturnType<typeof text>;

export const StatisticsSection = ({
  t,
  lang,
  user,
  stats,
  awards,
  matchHistory,
  sessions,
  onLogoutSession,
  uiVariant = 'v2',
}: {
  t: T;
  lang: Language;
  user: AuthUser | null;
  stats: UserStats | null;
  awards: UserAward[];
  matchHistory: UserMatchHistoryItem[];
  sessions: UserSession[];
  onLogoutSession?: (sessionId: string) => void;
  uiVariant?: 'v1' | 'v2';
}) => {
  const [activeCategory, setActiveCategory] = useState<'general' | 'resources' | 'actions' | 'achievements' | 'history' | 'sessions'>('general');
  return (
    <section className={`board board-v2-panel board-v2-statistics${uiVariant === 'v1' ? ' board-v1-panel board-v1-statistics' : ''}`}>
      <h2>{t.userTabStatistics}</h2>
      {!user ? <p>{t.statisticsLoginRequired}</p> : (
        <>
          <nav className="statistics-nav" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'inherit', padding: '8px 0' }}>
            <p className="admin-controls">
              <button type="button" onClick={() => setActiveCategory('general')} disabled={activeCategory === 'general'}>{t.statisticsCategoryGeneral}</button>
              <button type="button" onClick={() => setActiveCategory('resources')} disabled={activeCategory === 'resources'}>{t.statisticsCategoryResources}</button>
              <button type="button" onClick={() => setActiveCategory('actions')} disabled={activeCategory === 'actions'}>{t.statisticsCategoryActions}</button>
              <button type="button" onClick={() => setActiveCategory('achievements')} disabled={activeCategory === 'achievements'}>{t.statisticsCategoryAchievements}</button>
              <button type="button" onClick={() => setActiveCategory('history')} disabled={activeCategory === 'history'}>{t.statisticsCategoryHistory}</button>
              <button type="button" onClick={() => setActiveCategory('sessions')} disabled={activeCategory === 'sessions'}>{t.statisticsCategorySessions}</button>
            </p>
          </nav>
          {!stats ? <p>{t.simulationNoData}</p> : null}
          {stats && activeCategory === 'general' ? (
            <ul>
              <li>{t.userStatMatchesLinked}: {stats.matchesLinked}</li>
              <li>{t.userStatMatchesFinished}: {stats.matchesFinished}</li>
              <li>{t.userStatWins}: {stats.wins}</li>
              <li>{t.userStatRankWins}: {stats.rankWins}</li>
              <li>{t.userStatScoreWins}: {stats.scoreWins}</li>
              <li>{t.userStatStalledMatches}: {stats.stalledMatches}</li>
              <li>{t.userStatBotMatchesFinished}: {stats.botMatchesFinished}</li>
              <li>{t.userStatWinRate}: {stats.winRatePct}%</li>
              <li>{t.userStatAvgTurns}: {stats.avgTurns}</li>
              <li>{t.userStatBestRank}: {localizeRankValue(stats.bestRankName, lang)}</li>
              <li>{t.userStatLastMatchAt}: {stats.lastMatchAt ? new Date(stats.lastMatchAt).toLocaleString() : '-'}</li>
              <li>{t.userStatsByModeTitle}
                <ul>
                  {stats.byMode.length === 0 ? <li>{t.simulationNoData}</li> : stats.byMode.map((row) => (
                    <li key={`stats-mode-${row.mode}`}>
                      {formatGameModeLabel(t, row.mode)}: {row.matchesFinished} / {row.wins} / {row.winRatePct}%
                    </li>
                  ))}
                </ul>
              </li>
              <li>{t.userStatsByPlayerCountTitle}
                <ul>
                  {stats.byPlayerCount.length === 0 ? <li>{t.simulationNoData}</li> : stats.byPlayerCount.map((row) => (
                    <li key={`stats-player-count-${row.playerCount}`}>
                      {row.playerCount}: {row.matchesFinished} / {row.wins} / {row.winRatePct}%
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          ) : null}
          {stats && activeCategory === 'resources' ? (
            <ul>
              <li>{t.userStatResourcesGained}: {stats.resourcesGainedTotal}</li>
              <li>{t.userStatResourcesLost}: {stats.resourcesLostTotal}</li>
            </ul>
          ) : null}
          {stats && activeCategory === 'actions' ? (
            <ul>
              <li>{t.userStatLyaps}: {stats.lyapsPlayedOnOthers}</li>
              <li>{t.userStatScandals}: {stats.scandalsPlayedOnOthers}</li>
              <li>{t.userLastLoginAt}: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '-'}</li>
            </ul>
          ) : null}
          {activeCategory === 'achievements' ? (
            awards.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {awards.map((award) => (
                  <li key={`stats-award-${award.awardId}`}>
                    <strong>[{award.badgeLabel}]</strong> {award.title}
                    {' '}({Math.min(award.progressValue, award.threshold)}/{award.threshold})
                    {award.awarded ? ` • ${t.userAwardUnlockedLabel}` : ''}
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {activeCategory === 'history' ? (
            matchHistory.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {matchHistory.map((item) => (
                  <li key={`stats-history-${item.matchId}-${item.playerId}`}>
                    <strong>{formatMatchOutcomeLabel(t, item)}</strong> · {formatGameModeLabel(t, item.gameMode)}
                    {' · '}
                    {item.playerCount}p
                    {item.botCount > 0 ? ` · ${item.botCount} ${t.roomBotsLabel.toLowerCase()} (${formatBotDifficultyLabel(t, item.botDifficulty)})` : ''}
                    <br />
                    {t.userMatchHistoryFinalRank}: {localizeRankValue(item.finalRankId, lang)} · {t.userStatAvgTurns}: {item.turnsCompleted}
                    <br />
                    {t.userStatResourcesGained}: {item.resourcesGainedTotal} · {t.userStatResourcesLost}: {item.resourcesLostTotal}
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {activeCategory === 'sessions' ? (
            sessions.length === 0 ? <p>{t.simulationNoData}</p> : (
              <>
                <h4>Поточна сесія / Current session</h4>
                {(() => {
                  const currentSession = sessions.reduce((latest, session) => {
                    const sessionDate = new Date(session.lastSeenAt);
                    const latestDate = new Date(latest.lastSeenAt);
                    return sessionDate > latestDate ? session : latest;
                  }, sessions[0]);
                  const isCurrent = currentSession && new Date(currentSession.expiresAt) > new Date();
                  return isCurrent && currentSession ? (
                    <ul>
                      <li key={`current-session-${currentSession.id}`} style={{ fontWeight: 'bold', background: 'rgba(255,255,0,0.1)' }}>
                        {new Date(currentSession.lastSeenAt).toLocaleString()} | {currentSession.sourceIp ?? '-'} | {(currentSession.userAgent ?? '-').slice(0, 48)}
                        {onLogoutSession ? ` <button type="button" onClick={() => onLogoutSession(currentSession.id)}>${t.userLogoutSessionButton}</button>` : ''}
                      </li>
                    </ul>
                  ) : <p>{t.simulationNoData}</p>;
                })()}
                <h4>Інші сесії / Other sessions</h4>
                <ul>
                  {sessions
                    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
                    .filter((session) => {
                      const currentSession = sessions.reduce((latest, s) => {
                        const sessionDate = new Date(s.lastSeenAt);
                        const latestDate = new Date(latest.lastSeenAt);
                        return sessionDate > latestDate ? s : latest;
                      }, sessions[0]);
                      return session.id !== currentSession?.id;
                    })
                    .map((session) => (
                    <li key={`stats-session-${session.id}`}>
                      {new Date(session.lastSeenAt).toLocaleString()} | {session.sourceIp ?? '-'} | {(session.userAgent ?? '-').slice(0, 48)}
                      {onLogoutSession ? ` <button type="button" onClick={() => onLogoutSession(session.id)}>${t.userLogoutSessionButton}</button>` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : null}
        </>
      )}
    </section>
  );
};
