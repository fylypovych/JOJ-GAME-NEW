import { useState } from 'react';
import { normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition } from '../../game/types';
import type { BotDifficulty, GameMode } from '../../game/types';
import type { Language } from '../i18n';
import { cardFlavor, cardTitleWithOverride, categoryLabel, text } from '../i18n';
import type { GalleryCategoryFilter, LobbyMatch, UserTab } from './model';
import type { AuthUser, UserAward, UserStats } from './useUserAccount';
import type { UserSession } from './useUserAccount';

type T = ReturnType<typeof text>;

type AdminAuthCardProps = {
  t: T;
  serverUrl: string;
  adminAuthEnabled: boolean | null;
  adminTokenDraft: string;
  setAdminTokenDraft: (value: string) => void;
  adminAuthChecking: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  adminAuthError: string;
};

export const AdminAuthCard = ({
  t,
  serverUrl,
  adminAuthEnabled,
  adminTokenDraft,
  setAdminTokenDraft,
  adminAuthChecking,
  onSignIn,
  onSignOut,
  adminAuthError,
}: AdminAuthCardProps) => (
  <section className="board admin-auth-card">
    <h2>{t.adminLoginTitle}</h2>
    <p>{adminAuthEnabled === false ? t.adminAuthDisabledHint : t.adminLoginHint}</p>
    <p>
      {t.serverUrlLabel}: <code>{serverUrl}</code>
    </p>
    <p className="admin-auth-form">
      <label>
        {t.adminTokenLabel}:{' '}
        <input
          type="password"
          value={adminTokenDraft}
          onChange={(e) => setAdminTokenDraft(e.target.value)}
          placeholder="ADMIN_TOKEN"
        />
      </label>{' '}
      <button type="button" onClick={onSignIn} disabled={adminAuthChecking}>
        {adminAuthChecking ? t.adminAuthChecking : t.adminSignIn}
      </button>{' '}
      <button type="button" onClick={onSignOut}>
        {t.adminSignOut}
      </button>
    </p>
    {adminAuthError ? <p className="admin-error">{adminAuthError}</p> : null}
  </section>
);

type UserTabsProps = {
  t: T;
  activeUserTab: UserTab;
  setActiveUserTab: (tab: UserTab) => void;
  uiVariant?: 'v1' | 'v2';
};

export const UserTabs = ({ t, activeUserTab, setActiveUserTab, uiVariant = 'v1' }: UserTabsProps) => (
  <p className={`user-tabs${uiVariant === 'v2' ? ' user-tabs-v2' : ''}`}>
    <button type="button" onClick={() => setActiveUserTab('games')} disabled={activeUserTab === 'games'}>
      {t.userTabGames}
    </button>
    <button type="button" onClick={() => setActiveUserTab('gallery')} disabled={activeUserTab === 'gallery'}>
      {t.userTabGallery}
    </button>
    <button type="button" onClick={() => setActiveUserTab('rules')} disabled={activeUserTab === 'rules'}>
      {t.userTabRules}
    </button>
    <button type="button" onClick={() => setActiveUserTab('profile')} disabled={activeUserTab === 'profile'}>
      {t.userTabProfile}
    </button>
    <button type="button" onClick={() => setActiveUserTab('statistics')} disabled={activeUserTab === 'statistics'}>
      {t.userTabStatistics}
    </button>
  </p>
);

type LobbySectionProps = {
  t: T;
  playerName: string;
  fallbackPlayerName?: string;
  authenticatedUser?: boolean;
  setPlayerName: (value: string) => void;
  roomCapacity: number;
  setRoomCapacity: (value: number) => void;
  gameMode: GameMode;
  setGameMode: (value: GameMode) => void;
  createWithBots: boolean;
  setCreateWithBots: (value: boolean) => void;
  botDifficulty: BotDifficulty;
  setBotDifficulty: (value: BotDifficulty) => void;
  createRoom: () => void;
  refreshMatches: () => void;
  loading: boolean;
  error: string;
  matches: LobbyMatch[];
  joinRoom: (match: LobbyMatch) => void;
  spectateRoom: (match: LobbyMatch) => void;
  optionalModules: Array<{ id: string; name: string; alwaysOn: boolean }>;
  selectedOptionalModuleIds: string[];
  setSelectedOptionalModuleIds: (ids: string[]) => void;
  uiVariant?: 'v1' | 'v2';
};

export const LobbySection = ({
  t,
  playerName,
  fallbackPlayerName,
  authenticatedUser = false,
  setPlayerName,
  roomCapacity,
  setRoomCapacity,
  gameMode,
  setGameMode,
  createWithBots,
  setCreateWithBots,
  botDifficulty,
  setBotDifficulty,
  createRoom,
  refreshMatches,
  loading,
  error,
  matches,
  joinRoom,
  spectateRoom,
  optionalModules,
  selectedOptionalModuleIds,
  setSelectedOptionalModuleIds,
  uiVariant = 'v1',
}: LobbySectionProps) => {
  const toggleModule = (id: string, alwaysOn: boolean) => {
    if (alwaysOn) return;
    if (selectedOptionalModuleIds.includes(id)) {
      setSelectedOptionalModuleIds(selectedOptionalModuleIds.filter((row) => row !== id));
      return;
    }
    setSelectedOptionalModuleIds([...selectedOptionalModuleIds, id]);
  };
  const effectivePlayerName = playerName.trim() || fallbackPlayerName?.trim() || '';

  return (
  <section className={`board${uiVariant === 'v2' ? ' board-v2-panel' : ''}`}>
    <h2>{t.lobbyTitle}</h2>
    <div className="lobby-layout">
      <div className="lobby-col">
        <h3>{t.roomListTitle}</h3>
        <p className="admin-controls">
          <button type="button" onClick={refreshMatches} disabled={loading}>
            {t.refreshRooms}
          </button>
        </p>
        {loading ? <p>{t.loadingRooms}</p> : null}
        {matches.length === 0 ? <p>{t.noRooms}</p> : null}
        {matches.map((match) => {
          const taken = match.players.filter((player) => Boolean(player.name)).length;
          const capacity = match.players.length;
          const hasFree = taken < capacity;
          return (
            <p key={match.matchID}>
              {match.matchID} | {taken}/{capacity}{' '}
              <button
                type="button"
                onClick={() => joinRoom(match)}
                disabled={!effectivePlayerName || loading || !hasFree}
              >
                {t.joinRoom}
              </button>{' '}
              <button
                type="button"
                onClick={() => spectateRoom(match)}
                disabled={loading}
              >
                {t.spectateRoom}
              </button>
            </p>
          );
        })}
      </div>
      <div className="lobby-col">
        <h3>{t.roomCreateTitle}</h3>
        {authenticatedUser ? (
          <p>
            {t.joinedAs}: <strong>{effectivePlayerName || '-'}</strong>
          </p>
        ) : (
          <p>
            {t.playerName}:{' '}
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={t.playerNamePlaceholder}
            />
          </p>
        )}
        <p>{t.roomCapacity}:</p>
        <p className="admin-controls">
          {[2, 3, 4, 5, 6].map((size) => (
            <button key={`room-cap-${size}`} type="button" aria-pressed={roomCapacity === size} onClick={() => setRoomCapacity(size)}>
              {roomCapacity === size ? '✓ ' : ''}{size}
            </button>
          ))}
        </p>
        <p>{t.gameModeLabel}:</p>
        <p className="admin-controls">
          {[
            { id: 'standard', label: t.gameModeStandard },
            { id: 'standard_plus', label: t.gameModeStandardPlus },
            { id: 'simplified', label: t.gameModeSimplified },
          ].map((mode) => (
            <button key={`room-mode-${mode.id}`} type="button" aria-pressed={gameMode === mode.id} onClick={() => setGameMode(mode.id as GameMode)}>
              {gameMode === mode.id ? '✓ ' : ''}{mode.label}
            </button>
          ))}
        </p>
        <p>{t.roomModulesLabel}:</p>
        <p className="admin-controls">
          {optionalModules.map((module) => {
            const enabled = selectedOptionalModuleIds.includes(module.id) || module.alwaysOn;
            return (
              <button
                key={`room-module-${module.id}`}
                type="button"
                aria-pressed={enabled}
                onClick={() => toggleModule(module.id, module.alwaysOn)}
                disabled={module.alwaysOn}
              >
                {enabled ? '✓ ' : ''}{module.name}{module.alwaysOn ? ` (${t.roomModuleAlwaysOn})` : ''}
              </button>
            );
          })}
        </p>
        <p>{t.roomBotsLabel}:</p>
        <p className="admin-controls">
          <button type="button" aria-pressed={!createWithBots} onClick={() => setCreateWithBots(false)}>
            {!createWithBots ? '✓ ' : ''}{t.roomBotsOff}
          </button>
          <button type="button" aria-pressed={createWithBots} onClick={() => setCreateWithBots(true)}>
            {createWithBots ? '✓ ' : ''}{t.roomBotsFill}
          </button>
        </p>
        {createWithBots ? (
          <>
            <p>{t.roomBotDifficultyLabel}:</p>
            <p className="admin-controls">
              {[
                { id: 'easy', label: t.botDifficultyEasy },
                { id: 'normal', label: t.botDifficultyNormal },
                { id: 'hard', label: t.botDifficultyHard },
              ].map((difficulty) => (
                <button
                  key={`bot-difficulty-${difficulty.id}`}
                  type="button"
                  aria-pressed={botDifficulty === difficulty.id}
                  onClick={() => setBotDifficulty(difficulty.id as BotDifficulty)}
                >
                  {botDifficulty === difficulty.id ? '✓ ' : ''}{difficulty.label}
                </button>
              ))}
            </p>
          </>
        ) : null}
        <p className="admin-controls">
          <button type="button" onClick={createRoom} disabled={!effectivePlayerName || loading}>
            {t.createRoom}
          </button>
        </p>
      </div>
    </div>
    {error ? <p className="admin-error">{error}</p> : null}
  </section>
);
};

type ActiveSessionSectionProps = {
  t: T;
  session: { matchID: string; playerID?: string; spectator?: boolean };
  playerName: string;
  sessionBroken: boolean;
  canStart: boolean;
  leaveRoom: () => void;
  loading: boolean;
  uiVariant?: 'v1' | 'v2';
};

export const ActiveSessionSection = ({
  t,
  session,
  playerName,
  sessionBroken,
  canStart,
  leaveRoom,
  loading,
  uiVariant = 'v1',
}: ActiveSessionSectionProps) => (
  <section className={`board${uiVariant === 'v2' ? ' board-v2-panel' : ''}`}>
    <h2>
      {t.activeRoom}: {session.matchID}
    </h2>
    <p>
      {session.spectator
        ? `${t.spectatorMode}: ${t.spectatorJoinedLabel}`
        : `${t.joinedAs}: ${playerName || '-'} (#${session.playerID})`}
    </p>
    {sessionBroken ? <p>{t.noRooms}</p> : null}
    {!sessionBroken && !canStart ? <p>{t.waitingForPlayers}</p> : null}
    <button type="button" onClick={leaveRoom} disabled={loading}>
      {t.leaveRoom}
    </button>
  </section>
);

export const ProfileSection = ({
  t,
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
  sessions,
  onRefreshSessions,
  onLogoutAllSessions,
  onLogoutSession,
  onOpenRegister,
}: {
  t: T;
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
  sessions: UserSession[];
  onRefreshSessions: () => void;
  onLogoutAllSessions: () => void;
  onLogoutSession: (sessionId: string) => void;
  onOpenRegister: () => void;
}) => (
  <section className="board">
    <h2>{t.userTabProfile}</h2>
    {loading ? <p>{t.loadingRooms}</p> : null}
    {error ? <p className="admin-error">{error}</p> : null}
    {notice ? <p>{notice}</p> : null}
    {!user ? (
      <div className="auth-shell">
        <div className="auth-card">
          <h3>{t.userLoginTitle}</h3>
          <p>
            <input
              value={loginDraft.login}
              onChange={(e) => setLoginDraft({ ...loginDraft, login: e.target.value })}
              placeholder={t.userLoginPlaceholder}
            />
          </p>
          <p>
            <input
              type="password"
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
        <div className="lobby-layout">
          <div className="lobby-col">
            <h3>{t.userProfileTitle}</h3>
            <p><input value={profileDraft.displayName} onChange={(e) => setProfileDraft({ ...profileDraft, displayName: e.target.value })} placeholder={t.userDisplayNameLabel} /></p>
            <p><input value={profileDraft.email} onChange={(e) => setProfileDraft({ ...profileDraft, email: e.target.value })} placeholder={t.userEmailLabel} /></p>
            <p><input value={profileDraft.avatarUrl} onChange={(e) => setProfileDraft({ ...profileDraft, avatarUrl: e.target.value })} placeholder={t.userAvatarUrlLabel} /></p>
            <p><textarea className="admin-textarea" value={profileDraft.bio} onChange={(e) => setProfileDraft({ ...profileDraft, bio: e.target.value })} /></p>
            <p><label><input type="checkbox" checked={profileDraft.profilePublic} onChange={(e) => setProfileDraft({ ...profileDraft, profilePublic: e.target.checked })} /> {t.userProfilePublicLabel}</label></p>
            <p><label><input type="checkbox" checked={profileDraft.showStatsPublic} onChange={(e) => setProfileDraft({ ...profileDraft, showStatsPublic: e.target.checked })} /> {t.userShowStatsPublicLabel}</label></p>
            <p><label><input type="checkbox" checked={profileDraft.showRecentMatchesPublic} onChange={(e) => setProfileDraft({ ...profileDraft, showRecentMatchesPublic: e.target.checked })} /> {t.userShowRecentMatchesPublicLabel}</label></p>
            <h3>{t.userChangePasswordTitle}</h3>
            <p><input type="password" value={passwordDraft.currentPassword} onChange={(e) => setPasswordDraft({ ...passwordDraft, currentPassword: e.target.value })} placeholder={t.userCurrentPasswordLabel} /></p>
            <p><input type="password" value={passwordDraft.nextPassword} onChange={(e) => setPasswordDraft({ ...passwordDraft, nextPassword: e.target.value })} placeholder={t.userNewPasswordLabel} /></p>
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
          <div className="lobby-col">
            <h3>{t.userStatsTitle}</h3>
            {!stats ? <p>{t.simulationNoData}</p> : (
              <ul>
                <li>{t.userStatMatchesLinked}: {stats.matchesLinked}</li>
                <li>{t.userStatMatchesFinished}: {stats.matchesFinished}</li>
                <li>{t.userStatWins}: {stats.wins}</li>
                <li>{t.userStatWinRate}: {stats.winRatePct}%</li>
                <li>{t.userStatAvgTurns}: {stats.avgTurns}</li>
                <li>{t.userStatBestRank}: {stats.bestRankName}</li>
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
          </div>
        </div>
      </>
    )}
  </section>
);

export const RegisterSection = ({
  t,
  busy,
  error,
  registerDraft,
  setRegisterDraft,
  onRegister,
  onBackToLogin,
}: {
  t: T;
  busy: boolean;
  error: string;
  registerDraft: { username: string; email: string; password: string; displayName: string };
  setRegisterDraft: (value: { username: string; email: string; password: string; displayName: string }) => void;
  onRegister: () => void;
  onBackToLogin: () => void;
}) => (
  <section className="board">
    <h2>{t.userRegisterTitle}</h2>
    {error ? <p className="admin-error">{error}</p> : null}
    <div className="auth-shell">
      <div className="auth-card">
        <p><input value={registerDraft.username} onChange={(e) => setRegisterDraft({ ...registerDraft, username: e.target.value })} placeholder={t.userUsernameLabel} /></p>
        <p><input value={registerDraft.displayName} onChange={(e) => setRegisterDraft({ ...registerDraft, displayName: e.target.value })} placeholder={t.userDisplayNameLabel} /></p>
        <p><input value={registerDraft.email} onChange={(e) => setRegisterDraft({ ...registerDraft, email: e.target.value })} placeholder={t.userEmailLabel} /></p>
        <p><input type="password" value={registerDraft.password} onChange={(e) => setRegisterDraft({ ...registerDraft, password: e.target.value })} placeholder={t.userPasswordLabel} /></p>
        <p className="admin-controls">
          <button type="button" onClick={onRegister} disabled={busy}>{t.userRegisterButton}</button>
          <button type="button" onClick={onBackToLogin} disabled={busy}>{t.userGoToLoginButton}</button>
        </p>
      </div>
    </div>
  </section>
);

export const PasswordResetSection = ({
  t,
  busy,
  error,
  resetRequestDraft,
  setResetRequestDraft,
  onRequestPasswordReset,
  resetPasswordDraft,
  setResetPasswordDraft,
  onResetPassword,
  resetTokenPreview,
  resetTokenExpiresAt,
  onBackToLogin,
}: {
  t: T;
  busy: boolean;
  error: string;
  resetRequestDraft: { login: string };
  setResetRequestDraft: (value: { login: string }) => void;
  onRequestPasswordReset: () => void;
  resetPasswordDraft: { token: string; nextPassword: string };
  setResetPasswordDraft: (value: { token: string; nextPassword: string }) => void;
  onResetPassword: () => void;
  resetTokenPreview: string;
  resetTokenExpiresAt: string;
  onBackToLogin: () => void;
}) => (
  <section className="board">
    <h2>{t.userPasswordResetTitle}</h2>
    {error ? <p className="admin-error">{error}</p> : null}
    <div className="lobby-layout">
      <div className="lobby-col">
        <h3>{t.userPasswordResetRequestButton}</h3>
        <p><input value={resetRequestDraft.login} onChange={(e) => setResetRequestDraft({ login: e.target.value })} placeholder={t.userLoginPlaceholder} /></p>
        <p className="admin-controls">
          <button type="button" onClick={onRequestPasswordReset} disabled={busy}>{t.userPasswordResetRequestButton}</button>
          <button type="button" onClick={onBackToLogin} disabled={busy}>{t.userGoToLoginButton}</button>
        </p>
        {resetTokenPreview ? <p>{t.userResetTokenPreview}: <code>{resetTokenPreview}</code></p> : null}
        {resetTokenExpiresAt ? <p>{t.userResetTokenExpiresAt}: {new Date(resetTokenExpiresAt).toLocaleString()}</p> : null}
      </div>
      <div className="lobby-col">
        <h3>{t.userPasswordResetApplyButton}</h3>
        <p><input value={resetPasswordDraft.token} onChange={(e) => setResetPasswordDraft({ ...resetPasswordDraft, token: e.target.value })} placeholder={t.userResetTokenLabel} /></p>
        <p><input type="password" value={resetPasswordDraft.nextPassword} onChange={(e) => setResetPasswordDraft({ ...resetPasswordDraft, nextPassword: e.target.value })} placeholder={t.userNewPasswordLabel} /></p>
        <p><button type="button" onClick={onResetPassword} disabled={busy}>{t.userPasswordResetApplyButton}</button></p>
      </div>
    </div>
  </section>
);

export const StatisticsSection = ({
  t,
  user,
  stats,
  awards,
  sessions,
}: {
  t: T;
  user: AuthUser | null;
  stats: UserStats | null;
  awards: UserAward[];
  sessions: UserSession[];
}) => {
  const [activeCategory, setActiveCategory] = useState<'general' | 'resources' | 'actions' | 'achievements' | 'sessions'>('general');
  return (
    <section className="board">
      <h2>{t.userTabStatistics}</h2>
      {!user ? <p>{t.statisticsLoginRequired}</p> : (
        <>
          <p className="admin-controls">
            <button type="button" onClick={() => setActiveCategory('general')} disabled={activeCategory === 'general'}>{t.statisticsCategoryGeneral}</button>
            <button type="button" onClick={() => setActiveCategory('resources')} disabled={activeCategory === 'resources'}>{t.statisticsCategoryResources}</button>
            <button type="button" onClick={() => setActiveCategory('actions')} disabled={activeCategory === 'actions'}>{t.statisticsCategoryActions}</button>
            <button type="button" onClick={() => setActiveCategory('achievements')} disabled={activeCategory === 'achievements'}>{t.statisticsCategoryAchievements}</button>
            <button type="button" onClick={() => setActiveCategory('sessions')} disabled={activeCategory === 'sessions'}>{t.statisticsCategorySessions}</button>
          </p>
          {!stats ? <p>{t.simulationNoData}</p> : null}
          {stats && activeCategory === 'general' ? (
            <ul>
              <li>{t.userStatMatchesLinked}: {stats.matchesLinked}</li>
              <li>{t.userStatMatchesFinished}: {stats.matchesFinished}</li>
              <li>{t.userStatWins}: {stats.wins}</li>
              <li>{t.userStatWinRate}: {stats.winRatePct}%</li>
              <li>{t.userStatAvgTurns}: {stats.avgTurns}</li>
              <li>{t.userStatBestRank}: {stats.bestRankName}</li>
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
          {activeCategory === 'sessions' ? (
            sessions.length === 0 ? <p>{t.simulationNoData}</p> : (
              <ul>
                {sessions.map((session) => (
                  <li key={`stats-session-${session.id}`}>
                    {new Date(session.lastSeenAt).toLocaleString()} | {session.sourceIp ?? '-'} | {(session.userAgent ?? '-').slice(0, 48)}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      )}
    </section>
  );
};

export const AuthErrorModal = ({
  t,
  open,
  error,
  onClose,
  onOpenReset,
}: {
  t: T;
  open: boolean;
  error: string;
  onClose: () => void;
  onOpenReset: () => void;
}) => {
  if (!open) return null;
  return (
    <div className="gameover-modal" role="dialog" aria-label={t.userAuthErrorTitle}>
      <div className="gameover-modal-card">
        <h3>{t.userAuthErrorTitle}</h3>
        <p>{error}</p>
        <p>{t.userAuthErrorResetHint}</p>
        <p className="admin-controls">
          <button type="button" onClick={onOpenReset}>{t.userPasswordResetOpenButton}</button>
          <button type="button" onClick={onClose}>{t.closePopup}</button>
        </p>
      </div>
    </div>
  );
};

type GallerySectionProps = {
  t: T;
  lang: Language;
  galleryCategoryFilter: GalleryCategoryFilter;
  setGalleryCategoryFilter: (value: GalleryCategoryFilter) => void;
  galleryCards: CardDefinition[];
  galleryCategories: CardDefinition['category'][];
  effectLabel: (resource: 'time' | 'reputation' | 'discipline' | 'documents' | 'tech' | 'rank') => string;
  uiVariant?: 'v1' | 'v2';
};

export const GallerySection = ({
  t,
  lang,
  galleryCategoryFilter,
  setGalleryCategoryFilter,
  galleryCards,
  galleryCategories,
  effectLabel,
  uiVariant = 'v1',
}: GallerySectionProps) => {
  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const togglePreview = (key: string) => setOpenPreviewKey((prev) => (prev === key ? null : key));

  return (
    <section className={`board${uiVariant === 'v2' ? ' board-v2-panel board-v2-gallery' : ''}`}>
      <h2>{t.galleryTitle}</h2>
      <p>{t.galleryDescription}</p>
      <p className={`gallery-category-tabs${uiVariant === 'v2' ? ' gallery-category-tabs-v2' : ''}`}>
      <button
        type="button"
        onClick={() => setGalleryCategoryFilter('ALL')}
        disabled={galleryCategoryFilter === 'ALL'}
      >
        {t.allCategories}
      </button>
      {galleryCategories.map((cat) => (
        <button
          type="button"
          key={`gallery-filter-${cat}`}
          onClick={() => setGalleryCategoryFilter(cat)}
          disabled={galleryCategoryFilter === cat}
        >
          {categoryLabel(cat, lang)}
        </button>
      ))}
      </p>
      {galleryCards.length === 0 ? <p>{t.noCardsYet}</p> : null}
      <div className={`gallery-grid${uiVariant === 'v2' ? ' gallery-grid-v2' : ''}`}>
        {galleryCards.map((card) => {
          const previewKey = `gallery-${card.id}`;
          const isOpen = openPreviewKey === previewKey;
          return (
            <article key={card.id} className="gallery-card">
              <div
                className={`gallery-card-image${isOpen ? ' is-open' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => togglePreview(previewKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    togglePreview(previewKey);
                  }
                  if (e.key === 'Escape') {
                    setOpenPreviewKey(null);
                  }
                }}
              >
            <img
              src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
              alt={cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
                <div
                  className={`gallery-card-popover${isOpen ? ' is-open' : ''}`}
                  aria-hidden={!isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenPreviewKey(null);
                  }}
                >
              <img
                src={normalizeImagePath(card.image) ?? `/cards/${card.id}.png`}
                  alt={cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}
              />
                </div>
              </div>
              <h3>{cardTitleWithOverride(card.id, card.title, lang, card.titleEn)}</h3>
              <p>{cardFlavor(card.flavor, lang, card.flavorEn)}</p>
              <div className="gallery-effects">
                {(card.effects ?? []).length === 0 ? (
                  <span className="pill pill-cost">0</span>
                ) : (card.effects ?? []).map((effect, idx) => (
                  <span key={`${card.id}-effect-${idx}`} className="pill pill-effect">
                    {effectLabel(effect.resource)}: {effect.value > 0 ? `+${effect.value}` : effect.value}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export const RulesSection = ({
  t,
  rules,
  uiVariant = 'v1',
}: { t: T; rules: readonly string[]; uiVariant?: 'v1' | 'v2' }) => (
  <section className={`board${uiVariant === 'v2' ? ' board-v2-panel board-v2-rules' : ''}`}>
    <h2>{t.rulesTitle}</h2>
    <ol className={`rules-list${uiVariant === 'v2' ? ' rules-list-v2' : ''}`}>
      {rules.map((rule, index) => (
        <li key={`rule-${index}`}>{rule}</li>
      ))}
    </ol>
  </section>
);
