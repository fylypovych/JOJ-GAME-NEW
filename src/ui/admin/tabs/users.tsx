import { text } from '../../i18n';

type T = ReturnType<typeof text>;

type AdminUserSummary = {
  id: string;
  username: string;
  email: string | null;
  role: 'user' | 'administrator';
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
    role: 'user' | 'administrator';
    status: 'active' | 'disabled';
    hasAdminAccessToken: boolean;
    adminAccessTokenRotatedAt: string | null;
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
  onSetRole,
  editDraft,
  setEditDraft,
  onSaveEdit,
  createDraft,
  setCreateDraft,
  onCreateUser,
  onRequestPasswordReset,
  onRotateAdminToken,
  issuedAdminToken,
  onLogoutAllSessions,
  onLogoutUserSession,
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
  onSetRole: (role: 'user' | 'administrator') => void;
  editDraft: {
    username: string;
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    preferredLang: 'uk' | 'en';
  };
  setEditDraft: (value: {
    username: string;
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    preferredLang: 'uk' | 'en';
  }) => void;
  onSaveEdit: () => void;
  createDraft: {
    username: string;
    displayName: string;
    email: string;
    password: string;
    role: 'user' | 'administrator';
  };
  setCreateDraft: (value: {
    username: string;
    displayName: string;
    email: string;
    password: string;
    role: 'user' | 'administrator';
  }) => void;
  onCreateUser: () => void;
  onRequestPasswordReset: () => void;
  onRotateAdminToken: () => void;
  issuedAdminToken: string;
  onLogoutAllSessions: () => void;
  onLogoutUserSession: (sessionId: string) => void;
}) => (
  <>
    <h3>{t.adminUsersTitle}</h3>
    <p>{t.adminUsersHint}</p>
    <p className="admin-controls">
      <input
        value={createDraft.username}
        onChange={(e) => setCreateDraft({ ...createDraft, username: e.target.value })}
        placeholder={t.userUsernameLabel}
      />
      <input
        value={createDraft.displayName}
        onChange={(e) => setCreateDraft({ ...createDraft, displayName: e.target.value })}
        placeholder={t.userDisplayNameLabel}
      />
      <input
        value={createDraft.email}
        onChange={(e) => setCreateDraft({ ...createDraft, email: e.target.value })}
        placeholder={t.userEmailLabel}
      />
      <input
        type="password"
        value={createDraft.password}
        onChange={(e) => setCreateDraft({ ...createDraft, password: e.target.value })}
        placeholder={t.userPasswordLabel}
      />
      <select
        value={createDraft.role}
        onChange={(e) => setCreateDraft({ ...createDraft, role: e.target.value === 'administrator' ? 'administrator' : 'user' })}
      >
        <option value="user">{t.userRoleUser}</option>
        <option value="administrator">{t.userRoleAdministrator}</option>
      </select>
      <button type="button" onClick={onCreateUser} disabled={loading}>{t.adminUsersCreateButton}</button>
    </p>
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
                <strong>{user.displayName}</strong> @{user.username} [{user.status}] [{user.role}]
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
            <p>{t.userRoleLabel}: <strong>{selectedUserDetail.user.role}</strong></p>
            <p>{t.adminUsersAdminTokenStatus}: <strong>{selectedUserDetail.user.hasAdminAccessToken ? t.yes : t.no}</strong></p>
            {selectedUserDetail.user.adminAccessTokenRotatedAt ? (
              <p>{t.adminUsersAdminTokenRotatedAt}: <strong>{new Date(selectedUserDetail.user.adminAccessTokenRotatedAt).toLocaleString()}</strong></p>
            ) : null}
            <h5>{t.userProfileTitle}</h5>
            <p><input value={editDraft.username} onChange={(e) => setEditDraft({ ...editDraft, username: e.target.value })} placeholder={t.userUsernameLabel} /></p>
            <p><input value={editDraft.displayName} onChange={(e) => setEditDraft({ ...editDraft, displayName: e.target.value })} placeholder={t.userDisplayNameLabel} /></p>
            <p><input value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} placeholder={t.userEmailLabel} /></p>
            <p><input value={editDraft.avatarUrl} onChange={(e) => setEditDraft({ ...editDraft, avatarUrl: e.target.value })} placeholder={t.userAvatarUrlLabel} /></p>
            <p>
              <select value={editDraft.preferredLang} onChange={(e) => setEditDraft({ ...editDraft, preferredLang: e.target.value === 'en' ? 'en' : 'uk' })}>
                <option value="uk">{t.langUk}</option>
                <option value="en">{t.langEn}</option>
              </select>
            </p>
            <p><textarea className="admin-textarea" value={editDraft.bio} onChange={(e) => setEditDraft({ ...editDraft, bio: e.target.value })} /></p>
            <p className="admin-controls">
              <button type="button" onClick={onSaveEdit} disabled={loading}>{t.userSaveProfileButton}</button>
              <button type="button" onClick={() => onSetStatus('active')} disabled={loading || selectedUserDetail.user.status === 'active'}>{t.adminUsersActivate}</button>
              <button type="button" onClick={() => onSetStatus('disabled')} disabled={loading || selectedUserDetail.user.status === 'disabled'}>{t.adminUsersDisable}</button>
              <button type="button" onClick={() => onSetRole('user')} disabled={loading || selectedUserDetail.user.role === 'user'}>{t.userRoleUser}</button>
              <button type="button" onClick={() => onSetRole('administrator')} disabled={loading || selectedUserDetail.user.role === 'administrator'}>{t.userRoleAdministrator}</button>
              <button type="button" onClick={onRotateAdminToken} disabled={loading || selectedUserDetail.user.role !== 'administrator'}>{t.adminUsersRotateAdminToken}</button>
              <button type="button" onClick={onRequestPasswordReset} disabled={loading}>{t.adminUsersIssueResetToken}</button>
              <button type="button" onClick={onLogoutAllSessions} disabled={loading}>{t.adminUsersLogoutAllSessions}</button>
            </p>
            {issuedAdminToken ? (
              <div className="admin-inline-editor">
                <p><strong>{t.adminUsersIssuedAdminToken}</strong></p>
                <p><code>{issuedAdminToken}</code></p>
              </div>
            ) : null}
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
