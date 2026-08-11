import { useMemo, useState } from 'react';
import { text } from '../../i18n';
import {
  AdminEmptyState,
  AdminSectionHeader,
  AdminStatusBadge,
  AdminWorkspaceLayout,
} from '../components/AdminWorkspaceLayout';

type T = ReturnType<typeof text>;
type UserSection = 'profile' | 'stats' | 'sessions' | 'matches' | 'security';

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

type UserEditDraft = {
  username: string;
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string;
  preferredLang: 'uk' | 'en';
};

type UserCreateDraft = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  role: 'user' | 'administrator';
};

export const AdminUsersTab = ({
  t, userSearch, setUserSearch, onSearch, users, selectedUserId, onSelectUserId,
  selectedUserDetail, loading, error, onSetStatus, onSetRole, editDraft,
  setEditDraft, onSaveEdit, createDraft, setCreateDraft, onCreateUser,
  onRequestPasswordReset, onLogoutAllSessions, onLogoutUserSession,
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
  editDraft: UserEditDraft;
  setEditDraft: (value: UserEditDraft) => void;
  onSaveEdit: () => void;
  createDraft: UserCreateDraft;
  setCreateDraft: (value: UserCreateDraft) => void;
  onCreateUser: () => void;
  onRequestPasswordReset: () => void;
  onLogoutAllSessions: () => void;
  onLogoutUserSession: (sessionId: string) => void;
}) => {
  const [section, setSection] = useState<UserSection>('profile');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const baseline = selectedUserDetail ? {
    username: selectedUserDetail.user.username ?? '',
    displayName: selectedUserDetail.user.displayName ?? '',
    email: selectedUserDetail.user.email ?? '',
    bio: selectedUserDetail.user.bio ?? '',
    avatarUrl: selectedUserDetail.user.avatarUrl ?? '',
    preferredLang: selectedUserDetail.user.preferredLang ?? 'uk',
  } : null;
  const hasUnsavedChanges = Boolean(baseline && JSON.stringify(editDraft) !== JSON.stringify(baseline));
  const counts = useMemo(() => ({
    active: users.filter((user) => user.status === 'active').length,
    administrators: users.filter((user) => user.role === 'administrator').length,
  }), [users]);
  const selectUser = (userId: string) => {
    if (userId === selectedUserId) return;
    if (hasUnsavedChanges && !window.confirm(t.unsavedChangesConfirm)) return;
    setSection('profile');
    onSelectUserId(userId);
  };
  const sections: Array<{ id: UserSection; label: string }> = [
    { id: 'profile', label: t.userProfileTitle },
    { id: 'stats', label: t.userStatsTitle },
    { id: 'sessions', label: t.userSessionsTitle },
    { id: 'matches', label: t.adminUsersLinkedMatchesTitle },
    { id: 'security', label: t.userRoleLabel },
  ];

  const sidebar = (
    <>
      <AdminSectionHeader
        eyebrow={`${users.length} · ${counts.active} active`}
        title={t.adminUsersListTitle}
        actions={<button type="button" className="admin-card-primary-action" onClick={() => setShowCreateForm((value) => !value)}>+ {t.adminUsersCreateButton}</button>}
      />
      <form className="admin-management-search" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
        <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder={t.adminUsersSearchPlaceholder} />
        <button type="submit" disabled={loading}>{t.adminUsersSearchButton}</button>
      </form>
      <div className="admin-management-summary">
        <AdminStatusBadge tone="success">{counts.active} active</AdminStatusBadge>
        <AdminStatusBadge tone="info">{counts.administrators} admin</AdminStatusBadge>
      </div>
      <div className="admin-entity-list" aria-busy={loading}>
        {users.length === 0 ? <AdminEmptyState>{loading ? '…' : t.simulationNoData}</AdminEmptyState> : users.map((user) => (
          <button
            type="button"
            key={user.id}
            className={`admin-entity-row${selectedUserId === user.id ? ' is-selected' : ''}`}
            onClick={() => selectUser(user.id)}
          >
            <span className="admin-user-avatar" aria-hidden="true">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</span>
            <span className="admin-entity-row-copy">
              <strong>{user.displayName || user.username}</strong>
              <small>@{user.username} · {user.email ?? '—'}</small>
              <span>
                <AdminStatusBadge tone={user.status === 'active' ? 'success' : 'danger'}>{user.status}</AdminStatusBadge>
                {user.role === 'administrator' ? <AdminStatusBadge tone="info">admin</AdminStatusBadge> : null}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="admin-management-shell">
      {showCreateForm ? (
        <section className="admin-create-panel">
          <AdminSectionHeader title={t.adminUsersCreateButton} actions={<button type="button" onClick={() => setShowCreateForm(false)}>×</button>} />
          <div className="admin-editor-grid admin-user-create-grid">
            <label>{t.userUsernameLabel}<input value={createDraft.username} onChange={(e) => setCreateDraft({ ...createDraft, username: e.target.value })} /></label>
            <label>{t.userDisplayNameLabel}<input value={createDraft.displayName} onChange={(e) => setCreateDraft({ ...createDraft, displayName: e.target.value })} /></label>
            <label>{t.userEmailLabel}<input type="email" value={createDraft.email} onChange={(e) => setCreateDraft({ ...createDraft, email: e.target.value })} /></label>
            <label>{t.userPasswordLabel}<input type="password" value={createDraft.password} onChange={(e) => setCreateDraft({ ...createDraft, password: e.target.value })} /></label>
            <label>{t.userRoleLabel}<select value={createDraft.role} onChange={(e) => setCreateDraft({ ...createDraft, role: e.target.value === 'administrator' ? 'administrator' : 'user' })}><option value="user">{t.userRoleUser}</option><option value="administrator">{t.userRoleAdministrator}</option></select></label>
          </div>
          <footer className="admin-sticky-actions"><button type="button" className="admin-card-primary-action" onClick={onCreateUser} disabled={loading}>{t.adminUsersCreateButton}</button></footer>
        </section>
      ) : null}
      {error ? <p className="admin-error">{error}</p> : null}
      <AdminWorkspaceLayout sidebar={sidebar}>
        {!selectedUserDetail ? (
          <AdminEmptyState>{t.notSelected}</AdminEmptyState>
        ) : (
          <>
            <AdminSectionHeader
              eyebrow={`@${selectedUserDetail.user.username}`}
              title={selectedUserDetail.user.displayName}
              description={`${t.createdAt}: ${new Date(selectedUserDetail.user.createdAt).toLocaleString()}`}
              actions={<><AdminStatusBadge tone={selectedUserDetail.user.status === 'active' ? 'success' : 'danger'}>{selectedUserDetail.user.status}</AdminStatusBadge><AdminStatusBadge tone="info">{selectedUserDetail.user.role}</AdminStatusBadge></>}
            />
            <nav className="admin-detail-tabs" aria-label={t.adminUsersDetailTitle}>
              {sections.map((item) => <button key={item.id} type="button" className={section === item.id ? 'is-active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}>{item.label}</button>)}
            </nav>

            {section === 'profile' ? (
              <div className="admin-detail-section">
                <div className="admin-editor-grid admin-user-profile-grid">
                  <label>{t.userUsernameLabel}<input value={editDraft.username} onChange={(e) => setEditDraft({ ...editDraft, username: e.target.value })} /></label>
                  <label>{t.userDisplayNameLabel}<input value={editDraft.displayName} onChange={(e) => setEditDraft({ ...editDraft, displayName: e.target.value })} /></label>
                  <label>{t.userEmailLabel}<input type="email" value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} /></label>
                  <label>{t.language}<select value={editDraft.preferredLang} onChange={(e) => setEditDraft({ ...editDraft, preferredLang: e.target.value === 'en' ? 'en' : 'uk' })}><option value="uk">{t.langUk}</option><option value="en">{t.langEn}</option></select></label>
                  <label className="admin-field-wide">{t.userAvatarUrlLabel}<input value={editDraft.avatarUrl} onChange={(e) => setEditDraft({ ...editDraft, avatarUrl: e.target.value })} /></label>
                  <label className="admin-field-wide">Bio<textarea className="admin-textarea" value={editDraft.bio} onChange={(e) => setEditDraft({ ...editDraft, bio: e.target.value })} /></label>
                </div>
                <footer className="admin-sticky-actions">
                  <span className={hasUnsavedChanges ? 'admin-card-save-state is-dirty' : 'admin-card-save-state'}>{hasUnsavedChanges ? t.unsavedChanges : t.allChangesSaved}</span>
                  <button type="button" className="admin-card-primary-action" onClick={onSaveEdit} disabled={loading || !hasUnsavedChanges}>{t.userSaveProfileButton}</button>
                </footer>
              </div>
            ) : null}

            {section === 'stats' ? (
              <div className="admin-metric-grid">
                {[
                  [t.userStatMatchesLinked, selectedUserDetail.stats.matchesLinked],
                  [t.userStatMatchesFinished, selectedUserDetail.stats.matchesFinished],
                  [t.userStatWins, selectedUserDetail.stats.wins],
                  [t.userStatWinRate, `${selectedUserDetail.stats.winRatePct}%`],
                  [t.userStatAvgTurns, selectedUserDetail.stats.avgTurns],
                  [t.userStatBestRank, selectedUserDetail.stats.bestRankName || '—'],
                ].map(([label, value]) => <article className="admin-metric-card" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}
              </div>
            ) : null}

            {section === 'sessions' ? (
              <div className="admin-detail-list">
                {selectedUserDetail.sessions.length === 0 ? <AdminEmptyState>{t.simulationNoData}</AdminEmptyState> : selectedUserDetail.sessions.map((session) => (
                  <article key={session.id} className="admin-detail-list-row"><div><strong>{new Date(session.lastSeenAt).toLocaleString()}</strong><small>{session.sourceIp ?? '—'} · {session.userAgent ?? '—'}</small><small>{new Date(session.createdAt).toLocaleString()} → {new Date(session.expiresAt).toLocaleString()}</small></div><button type="button" onClick={() => onLogoutUserSession(session.id)} disabled={loading}>{t.adminUsersLogoutSession}</button></article>
                ))}
              </div>
            ) : null}

            {section === 'matches' ? (
              <div className="admin-detail-section">
                <h5>{t.adminUsersLinkedMatchesTitle}</h5>
                <div className="admin-detail-list">{selectedUserDetail.linkedMatches.length === 0 ? <AdminEmptyState>{t.simulationNoData}</AdminEmptyState> : selectedUserDetail.linkedMatches.map((link) => <article className="admin-detail-list-row" key={`${link.matchId}-${link.playerId}`}><div><strong>{link.playerName ?? link.playerId}</strong><small><code>{link.matchId}</code> · {new Date(link.linkedAt).toLocaleString()}</small></div></article>)}</div>
                <h5>{t.adminUsersPersistedMatchesTitle}</h5>
                <div className="admin-detail-list">{selectedUserDetail.persistedMatches.length === 0 ? <AdminEmptyState>{t.simulationNoData}</AdminEmptyState> : selectedUserDetail.persistedMatches.map((match) => <article className="admin-detail-list-row" key={`${match.matchId}-${match.playerId}`}><div><strong>{match.playerName ?? match.playerId} · {match.finalRankId}</strong><small><code>{match.matchId}</code> · {match.endReason ?? '—'} · {match.turnsCompleted} turns</small><small>+{match.resourcesGainedTotal} / -{match.resourcesLostTotal}</small></div></article>)}</div>
              </div>
            ) : null}

            {section === 'security' ? (
              <div className="admin-danger-zone">
                <AdminSectionHeader title={t.userRoleLabel} description={`${t.userLastLoginAt}: ${selectedUserDetail.user.lastLoginAt ? new Date(selectedUserDetail.user.lastLoginAt).toLocaleString() : t.simulationNoData}`} />
                <div className="admin-action-group"><button type="button" onClick={() => onSetRole('user')} disabled={loading || selectedUserDetail.user.role === 'user'}>{t.userRoleUser}</button><button type="button" onClick={() => onSetRole('administrator')} disabled={loading || selectedUserDetail.user.role === 'administrator'}>{t.userRoleAdministrator}</button><button type="button" onClick={onRequestPasswordReset} disabled={loading}>{t.adminUsersIssueResetToken}</button></div>
                <hr />
                <div className="admin-action-group"><button type="button" className="admin-danger-action" onClick={() => { if (window.confirm(`${t.adminUsersLogoutAllSessions}?`)) onLogoutAllSessions(); }} disabled={loading}>{t.adminUsersLogoutAllSessions}</button>{selectedUserDetail.user.status === 'active' ? <button type="button" className="admin-danger-action" onClick={() => { if (window.confirm(`${t.adminUsersDisable}?`)) onSetStatus('disabled'); }} disabled={loading}>{t.adminUsersDisable}</button> : <button type="button" onClick={() => onSetStatus('active')} disabled={loading}>{t.adminUsersActivate}</button>}</div>
              </div>
            ) : null}
          </>
        )}
      </AdminWorkspaceLayout>
    </div>
  );
};
