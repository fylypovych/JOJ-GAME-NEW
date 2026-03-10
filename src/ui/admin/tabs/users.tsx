import { text } from '../../i18n';

type T = ReturnType<typeof text>;

type AdminUserSummary = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string | null;
  linkedMatches: number;
  finishedMatches: number;
};

type AdminUserDetail = {
  user: {
    id: string;
    username: string;
    email: string | null;
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    preferredLang: 'uk' | 'en';
    createdAt: string;
    lastLoginAt: string | null;
    status: 'active' | 'disabled';
  };
  stats: {
    matchesLinked: number;
    matchesFinished: number;
    wins: number;
    winRatePct: number;
    avgTurns: number;
    bestRankName: string;
    resourcesGainedTotal: number;
    resourcesLostTotal: number;
    lyapsPlayedOnOthers: number;
    scandalsPlayedOnOthers: number;
  };
  sessions: Array<{
    id: string;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
    sourceIp: string | null;
    userAgent: string | null;
  }>;
  linkedMatches: Array<{
    matchId: string;
    playerId: string;
    playerName: string | null;
    linkedAt: string;
  }>;
  persistedMatches: Array<{
    matchId: string;
    playerId: string;
    playerName: string | null;
    winnerPlayerId: string | null;
    endReason: string | null;
    turnsCompleted: number;
    finalRankId: string;
    resourcesGainedTotal: number;
    resourcesLostTotal: number;
    linkedAt: string;
  }>;
};

export const AdminUsersTab = ({
  t,
  userSearch,
  setUserSearch,
  onSearch,
  users,
  selectedUserId,
  onSelectUserId,
  selectedUserDetail,
  loading,
  error,
  onSetStatus,
  onIssueResetToken,
  onLogoutAllSessions,
  onLogoutUserSession,
  resetTokenPreview,
  resetTokenExpiresAt,
}: {
  t: T;
  userSearch: string;
  setUserSearch: (value: string) => void;
  onSearch: () => void;
  users: AdminUserSummary[];
  selectedUserId: string;
  onSelectUserId: (value: string) => void;
  selectedUserDetail: AdminUserDetail | null;
  loading: boolean;
  error: string;
  onSetStatus: (status: 'active' | 'disabled') => void;
  onIssueResetToken: () => void;
  onLogoutAllSessions: () => void;
  onLogoutUserSession: (sessionId: string) => void;
  resetTokenPreview: string;
  resetTokenExpiresAt: string;
}) => (
  <>
    <h3>{t.adminUsersTitle}</h3>
    <p>{t.adminUsersHint}</p>
    <p className="admin-controls">
      <input
        value={userSearch}
        onChange={(e) => setUserSearch(e.target.value)}
        placeholder={t.adminUsersSearchPlaceholder}
      />
      <button type="button" onClick={onSearch} disabled={loading}>{t.adminUsersSearchButton}</button>
      <label>
        {t.adminUsersSelectedLabel}
        <select value={selectedUserId} onChange={(e) => onSelectUserId(e.target.value)} disabled={loading || users.length === 0}>
          <option value="">{t.notSelected}</option>
          {users.map((user) => (
            <option key={`admin-user-${user.id}`} value={user.id}>
              {user.username} ({user.displayName})
            </option>
          ))}
        </select>
      </label>
    </p>
    {error ? <p className="admin-error">{error}</p> : null}
    <div className="lobby-layout">
      <div className="lobby-col">
        <h4>{t.adminUsersListTitle}</h4>
        {users.length === 0 ? <p>{t.simulationNoData}</p> : (
          <ul>
            {users.map((user) => (
              <li key={`admin-user-row-${user.id}`}>
                <strong>{user.displayName}</strong> @{user.username} [{user.status}]
                <br />
                {user.email ?? '-'} | {t.userStatMatchesLinked}: {user.linkedMatches} | {t.userStatMatchesFinished}: {user.finishedMatches}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="lobby-col">
        <h4>{t.adminUsersDetailTitle}</h4>
        {!selectedUserDetail ? <p>{t.notSelected}</p> : (
          <>
            <p><strong>{selectedUserDetail.user.displayName}</strong> @{selectedUserDetail.user.username}</p>
            <p>{selectedUserDetail.user.email ?? '-'}</p>
            <p>{t.createdAt}: {new Date(selectedUserDetail.user.createdAt).toLocaleString()}</p>
            <p>{t.userLastLoginAt}: {selectedUserDetail.user.lastLoginAt ? new Date(selectedUserDetail.user.lastLoginAt).toLocaleString() : t.simulationNoData}</p>
            <p>{t.adminUsersStatusLabel}: <strong>{selectedUserDetail.user.status}</strong></p>
            <p className="admin-controls">
              <button type="button" onClick={() => onSetStatus('active')} disabled={loading || selectedUserDetail.user.status === 'active'}>{t.adminUsersActivate}</button>
              <button type="button" onClick={() => onSetStatus('disabled')} disabled={loading || selectedUserDetail.user.status === 'disabled'}>{t.adminUsersDisable}</button>
              <button type="button" onClick={onIssueResetToken} disabled={loading}>{t.adminUsersIssueResetToken}</button>
              <button type="button" onClick={onLogoutAllSessions} disabled={loading}>{t.adminUsersLogoutAllSessions}</button>
            </p>
            {resetTokenPreview ? <p>{t.userResetTokenPreview}: <code>{resetTokenPreview}</code></p> : null}
            {resetTokenExpiresAt ? <p>{t.userResetTokenExpiresAt}: {new Date(resetTokenExpiresAt).toLocaleString()}</p> : null}
            <h5>{t.userStatsTitle}</h5>
            <ul>
              <li>{t.userStatMatchesLinked}: {selectedUserDetail.stats.matchesLinked}</li>
              <li>{t.userStatMatchesFinished}: {selectedUserDetail.stats.matchesFinished}</li>
              <li>{t.userStatWins}: {selectedUserDetail.stats.wins}</li>
              <li>{t.userStatWinRate}: {selectedUserDetail.stats.winRatePct}%</li>
              <li>{t.userStatBestRank}: {selectedUserDetail.stats.bestRankName}</li>
            </ul>
            <h5>{t.userSessionsTitle}</h5>
            {selectedUserDetail.sessions.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {selectedUserDetail.sessions.map((session) => (
                  <li key={`admin-user-session-${session.id}`}>
                    {new Date(session.lastSeenAt).toLocaleString()} | {session.sourceIp ?? '-'} | {(session.userAgent ?? '-').slice(0, 48)}
                    {' '}
                    <button type="button" onClick={() => onLogoutUserSession(session.id)} disabled={loading}>{t.adminUsersLogoutSession}</button>
                  </li>
                ))}
              </ul>
            )}
            <h5>{t.adminUsersLinkedMatchesTitle}</h5>
            {selectedUserDetail.linkedMatches.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {selectedUserDetail.linkedMatches.map((link) => (
                  <li key={`admin-user-link-${link.matchId}-${link.playerId}`}>
                    <code>{link.matchId}</code> / {link.playerId} / {link.playerName ?? '-'}
                  </li>
                ))}
              </ul>
            )}
            <h5>{t.adminUsersPersistedMatchesTitle}</h5>
            {selectedUserDetail.persistedMatches.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {selectedUserDetail.persistedMatches.map((match) => (
                  <li key={`admin-user-persisted-${match.matchId}-${match.playerId}`}>
                    <code>{match.matchId}</code> / {match.playerId} / {match.playerName ?? '-'} / {match.finalRankId}
                    <br />
                    {match.endReason ?? '-'} | {t.userStatAvgTurns}: {match.turnsCompleted} | +{match.resourcesGainedTotal} / -{match.resourcesLostTotal}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  </>
);
