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

export const ProfileSection = ({
  t,
  lang,
  user,
  loading,
  busy,
  error,
  notice,
  loginDraft,
  setLoginDraft,
  onLogin,
  onLogout,
  profileDraft,
  setProfileDraft,
  onSaveProfile,
  passwordDraft,
  setPasswordDraft,
  onChangePassword,
  stats,
  awards,
  matchHistory,
  sessions,
  onRefreshSessions,
  onLogoutAllSessions,
  onLogoutSession,
  onOpenRegister,
  onUploadAvatar,
  uiVariant = 'v2',
}: {
  t: T;
  lang: Language;
  user: AuthUser | null;
  loading: boolean;
  busy: boolean;
  error: string;
  notice: string;
  loginDraft: { login: string; password: string };
  setLoginDraft: (value: { login: string; password: string }) => void;
  onLogin: () => void;
  onLogout: () => void;
  profileDraft: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  };
  setProfileDraft: (value: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  }) => void;
  onSaveProfile: () => void;
  passwordDraft: { currentPassword: string; nextPassword: string };
  setPasswordDraft: (value: { currentPassword: string; nextPassword: string }) => void;
  onChangePassword: () => void;
  stats: UserStats | null;
  awards: UserAward[];
  matchHistory: UserMatchHistoryItem[];
  sessions: UserSession[];
  onRefreshSessions: () => void;
  onLogoutAllSessions: () => void;
  onLogoutSession: (sessionId: string) => void;
  onOpenRegister: () => void;
  onUploadAvatar: (file: File) => Promise<void>;
  uiVariant?: 'v1' | 'v2';
}) => (
  <section className={`board board-v2-panel board-v2-profile${uiVariant === 'v1' ? ' board-v1-panel board-v1-profile' : ''}`}>
    <h2>{t.userTabProfile}</h2>
    {loading ? <p>{t.loadingRooms}</p> : null}
    {error ? <p className="admin-error">{error}</p> : null}
    {notice ? <p className="board-v2-notice">{notice}</p> : null}
    {!user ? (
      <div className="auth-shell">
        <div className={`auth-card board-v2-auth-card${uiVariant === 'v1' ? ' board-v1-auth-card' : ''}`}>
          <h3>{t.userLoginTitle}</h3>
          <p>
            <input
              id="login-username"
              name="username"
              autoComplete="username"
              value={loginDraft.login}
              onChange={(e) => setLoginDraft({ ...loginDraft, login: e.target.value })}
              placeholder={t.userLoginPlaceholder}
            />
          </p>
          <p>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={loginDraft.password}
              onChange={(e) => setLoginDraft({ ...loginDraft, password: e.target.value })}
              placeholder={t.userPasswordLabel}
            />
          </p>
          <p className="admin-controls">
            <button type="button" onClick={onLogin} disabled={busy}>{t.userLoginButton}</button>
            <button type="button" onClick={onOpenRegister} disabled={busy}>{t.userGoToRegisterButton}</button>
          </p>
        </div>
      </div>
    ) : (
      <>
        <p>{t.userSignedInAs}: <strong>{user.displayName}</strong> (@{user.username})</p>
        <p className="admin-controls">
          <button type="button" onClick={onSaveProfile} disabled={busy}>{t.userSaveProfileButton}</button>
          <button type="button" onClick={onLogout} disabled={busy}>{t.userLogoutButton}</button>
        </p>
        <div className="lobby-layout board-v2-dual-layout board-v2-profile-layout">
          <div className={`lobby-col board-v2-column board-v2-subpanel${uiVariant === 'v1' ? ' board-v1-subpanel' : ''}`}>
            <h3>{t.userProfileTitle}</h3>
            <div className={`profile-avatar-panel profile-avatar-panel-v2${uiVariant === 'v1' ? ' profile-avatar-panel-v1' : ''}`}>
              <span>{t.userAvatarPreviewLabel}</span>
              <div className={`profile-avatar-preview profile-avatar-preview-v2${uiVariant === 'v1' ? ' profile-avatar-preview-v1' : ''}`}>
                {profileDraft.avatarUrl?.trim()
                  ? <img src={profileDraft.avatarUrl} alt={t.userAvatarPreviewLabel} />
                  : <span>{user.displayName?.slice(0, 1) || user.username?.slice(0, 1) || '?'}</span>}
              </div>
              <label className={`profile-avatar-upload profile-avatar-upload-v2${uiVariant === 'v1' ? ' profile-avatar-upload-v1' : ''}`}>
                <span>{t.userAvatarUploadButton}</span>
                <input
                  id="profile-avatar-upload"
                  name="avatarUpload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  autoComplete="off"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    const input = e.currentTarget;
                    if (!file) return;
                    void onUploadAvatar(file).finally(() => {
                      input.value = '';
                    });
                  }}
                  disabled={busy}
                />
              </label>
              <small>{t.userAvatarUploadHint}</small>
            </div>
            <p><input id="profile-displayName" name="displayName" autoComplete="name" value={profileDraft.displayName} onChange={(e) => setProfileDraft({ ...profileDraft, displayName: e.target.value })} placeholder={t.userDisplayNameLabel} /></p>
            <p><input id="profile-email" name="email" type="email" autoComplete="email" value={profileDraft.email} onChange={(e) => setProfileDraft({ ...profileDraft, email: e.target.value })} placeholder={t.userEmailLabel} /></p>
            <p><input id="profile-avatarUrl" name="avatarUrl" value={profileDraft.avatarUrl} onChange={(e) => setProfileDraft({ ...profileDraft, avatarUrl: e.target.value })} placeholder={t.userAvatarUrlLabel} /></p>
            <p><textarea id="profile-bio" name="bio" className="admin-textarea" value={profileDraft.bio} onChange={(e) => setProfileDraft({ ...profileDraft, bio: e.target.value })} /></p>
            <p><label><input type="checkbox" checked={profileDraft.profilePublic} onChange={(e) => setProfileDraft({ ...profileDraft, profilePublic: e.target.checked })} /> {t.userProfilePublicLabel}</label></p>
            <p><label><input type="checkbox" checked={profileDraft.showStatsPublic} onChange={(e) => setProfileDraft({ ...profileDraft, showStatsPublic: e.target.checked })} /> {t.userShowStatsPublicLabel}</label></p>
            <p><label><input type="checkbox" checked={profileDraft.showRecentMatchesPublic} onChange={(e) => setProfileDraft({ ...profileDraft, showRecentMatchesPublic: e.target.checked })} /> {t.userShowRecentMatchesPublicLabel}</label></p>
            <h3>{t.userChangePasswordTitle}</h3>
            <p><input id="password-current" name="currentPassword" type="password" autoComplete="current-password" value={passwordDraft.currentPassword} onChange={(e) => setPasswordDraft({ ...passwordDraft, currentPassword: e.target.value })} placeholder={t.userCurrentPasswordLabel} /></p>
            <p><input id="password-new" name="newPassword" type="password" autoComplete="new-password" value={passwordDraft.nextPassword} onChange={(e) => setPasswordDraft({ ...passwordDraft, nextPassword: e.target.value })} placeholder={t.userNewPasswordLabel} /></p>
            <p><button type="button" onClick={onChangePassword} disabled={busy}>{t.userChangePasswordButton}</button></p>
            <h3>{t.userSessionsTitle}</h3>
            <p className="admin-controls">
              <button type="button" onClick={onRefreshSessions} disabled={busy}>{t.refreshRooms}</button>
              <button type="button" onClick={onLogoutAllSessions} disabled={busy}>{t.userLogoutAllSessionsButton}</button>
            </p>
            {sessions.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {sessions.map((session) => (
                  <li key={session.id}>
                    {new Date(session.lastSeenAt).toLocaleString()} | {session.sourceIp ?? '-'} | {(session.userAgent ?? '-').slice(0, 48)}
                    {' '}
                    <button type="button" onClick={() => onLogoutSession(session.id)} disabled={busy}>{t.userLogoutSessionButton}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`lobby-col board-v2-column board-v2-subpanel${uiVariant === 'v1' ? ' board-v1-subpanel' : ''}`}>
            <h3>{t.userStatsTitle}</h3>
            {!stats ? <p>{t.simulationNoData}</p> : (
              <ul>
                <li>{t.userStatMatchesLinked}: {stats.matchesLinked}</li>
                <li>{t.userStatMatchesFinished}: {stats.matchesFinished}</li>
                <li>{t.userStatWins}: {stats.wins}</li>
                <li>{t.userStatWinRate}: {stats.winRatePct}%</li>
                <li>{t.userStatAvgTurns}: {stats.avgTurns}</li>
                <li>{t.userStatBestRank}: {localizeRankValue(stats.bestRankName, lang)}</li>
                <li>{t.userStatResourcesGained}: {stats.resourcesGainedTotal}</li>
                <li>{t.userStatResourcesLost}: {stats.resourcesLostTotal}</li>
                <li>{t.userStatLyaps}: {stats.lyapsPlayedOnOthers}</li>
                <li>{t.userStatScandals}: {stats.scandalsPlayedOnOthers}</li>
              </ul>
            )}
            <h3>{t.userAwardsTitle}</h3>
            {awards.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {awards.filter((award) => award.awarded).map((award) => (
                  <li key={`profile-award-${award.awardId}`}>
                    <strong>[{award.badgeLabel}]</strong> {award.title}
                    <br />
                    {award.description}
                  </li>
                ))}
              </ul>
            )}
            <h3>{t.userMatchHistoryTitle}</h3>
            {matchHistory.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {matchHistory.slice(0, 10).map((item) => (
                  <li key={`profile-history-${item.matchId}-${item.playerId}`}>
                    <strong>{formatMatchOutcomeLabel(t, item)}</strong> · {formatGameModeLabel(t, item.gameMode)}
                    {' · '}
                    {item.playerCount}p
                    {item.botCount > 0 ? ` · ${item.botCount} ${t.roomBotsLabel.toLowerCase()} (${formatBotDifficultyLabel(t, item.botDifficulty)})` : ''}
                    <br />
                    {t.userMatchHistoryFinalRank}: {localizeRankValue(item.finalRankId, lang)} · {t.userStatAvgTurns}: {item.turnsCompleted}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </>
    )}
  </section>
);
