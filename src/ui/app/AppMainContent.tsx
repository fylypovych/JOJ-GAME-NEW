import { Suspense, lazy } from 'react';
import type { T } from './sections';
import type { Language } from '../i18n';
import type { UserTab, Session, LobbyMatch } from './model';
import type { AuthUser } from './useUserAccount';
import type { UserStats, UserAward, UserSession } from './useUserAccount';
import type { UserMatchHistoryItem } from './useUserAccount';
import type { GameMode, BotDifficulty, BotProfile, RankDefinition } from '../../game/types';
import type { CardDefinition } from '../../game/types';
import type { SharedDeckTemplate, GalleryCategoryFilter } from './model';
import type { LobbyGameUiConfig } from '../../game/lobbyConfig';
import {
  AuthErrorModal,
  GallerySection,
  LobbySection,
  PasswordResetSection,
  ProfileSection,
  RegisterSection,
  RulesSection,
  StatisticsSection,
} from './sections';

const NetworkClientV1 = lazy(() => import('../NetworkClientV1'));
const NetworkClientV2 = lazy(() => import('../NetworkClientV2'));

interface AppMainContentProps {
  // Route & UI
  isAdminRoute: boolean;
  activeUserTab: UserTab;
  lang: Language;
  t: T;

  // User
  user: AuthUser | null;
  userLoading: boolean;
  userBusy: boolean;
  userError: string;
  setUserError: (error: string) => void;
  userStats: UserStats | null;
  userAwards: UserAward[];
  userSessions: UserSession[];
  matchHistory: UserMatchHistoryItem[];
  loginUser: (draft: { login: string; password: string }) => Promise<unknown>;
  logoutUser: () => Promise<unknown>;
  updateUserProfile: (profile: unknown) => Promise<unknown>;
  uploadAvatar: (file: File) => Promise<unknown>;
  changePassword: (draft: { currentPassword: string; nextPassword: string }) => Promise<unknown>;
  requestPasswordReset: (email: string) => Promise<unknown>;
  resetPassword: (token: string, newPassword: string) => Promise<unknown>;
  refreshSessions: () => Promise<unknown>;
  logoutAllSessions: () => Promise<unknown>;
  logoutSession: (sessionId: string) => Promise<unknown>;

  // Profile screen state
  profileScreen: 'login' | 'register' | 'reset';
  setProfileScreen: (screen: 'login' | 'register' | 'reset') => void;
  profileNotice: string;
  setProfileNotice: (notice: string) => void;
  loginDraft: { login: string; password: string };
  setLoginDraft: (draft: { login: string; password: string }) => void;
  registerDraft: { username: string; email: string; password: string };
  setRegisterDraft: (draft: { username: string; email: string; password: string }) => void;
  profileDraft: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  };
  setProfileDraft: (draft: unknown) => void;
  passwordDraft: { currentPassword: string; nextPassword: string };
  setPasswordDraft: (draft: { currentPassword: string; nextPassword: string }) => void;
  authErrorModal: string;
  setAuthErrorModal: (error: string) => void;

  // Session & Lobby
  session: Session | null;
  activeSessionMatch: LobbyMatch | null;
  canStart: boolean;
  playerName: string;
  setPlayerName: (name: string) => void;
  matches: LobbyMatch[];
  joinRoom: (match: LobbyMatch) => Promise<unknown>;
  spectateRoom: (match: LobbyMatch) => Promise<unknown>;
  leaveRoom: () => Promise<unknown>;
  createRoom: () => Promise<unknown>;
  refreshMatches: () => Promise<unknown>;
  loading: boolean;
  error: string;
  setError: (error: string) => void;
  roomPlayerNames: Record<string, string | undefined>;

  // Game Config
  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;
  roomCapacity: number;
  setRoomCapacity: (capacity: number) => void;
  createWithBots: boolean;
  setCreateWithBots: (value: boolean) => void;
  botCount: number;
  setBotCount: (count: number) => void;
  botDifficulty: BotDifficulty | null;
  setBotDifficulty: (difficulty: BotDifficulty | null) => void;
  botProfile: BotProfile | null;
  setBotProfile: (profile: BotProfile | null) => void;
  lobbyGameUiConfig: LobbyGameUiConfig;

  // Deck & Cards
  sharedDeckTemplate: SharedDeckTemplate;
  sharedRanks: RankDefinition[];
  cardCatalog: CardDefinition[];
  cardImageById: Record<string, string>;
  optionalLobbyModules: { id: string; name: string; alwaysOn: boolean }[];
  selectedOptionalModuleIds: string[];
  setSelectedOptionalModuleIds: (ids: string[]) => void;

  // Gallery
  galleryCategoryFilter: GalleryCategoryFilter;
  setGalleryCategoryFilter: (filter: GalleryCategoryFilter) => void;
  galleryCards: CardDefinition[];
  galleryCategories: { id: string; label: string }[];

  // Game UI
  gameUiVariant: 'v1' | 'v2';
  activeSessionInviteText: string;
  activeSessionShareLink: string;
  effectLabel: (resource: 'time' | 'reputation' | 'discipline' | 'documents' | 'tech' | 'rank') => string;
  rules: { id: string; title: string }[];

  // Callbacks
  onBindMatchSession: (args: { matchID: string; playerID: string; credentials: string; playerName: string }) => Promise<unknown>;
}

export const AppMainContent = (props: AppMainContentProps) => {
  const {
    isAdminRoute,
    activeUserTab,
    lang,
    t,
    user,
    userLoading,
    userBusy,
    userError,
    setUserError,
    userStats,
    userAwards,
    userSessions,
    matchHistory,
    loginUser,
    logoutUser,
    updateUserProfile,
    uploadAvatar,
    changePassword,
    requestPasswordReset,
    resetPassword,
    refreshSessions,
    logoutAllSessions,
    logoutSession,
    profileScreen,
    setProfileScreen,
    profileNotice,
    setProfileNotice,
    loginDraft,
    setLoginDraft,
    registerDraft,
    setRegisterDraft,
    profileDraft,
    setProfileDraft,
    passwordDraft,
    setPasswordDraft,
    authErrorModal,
    setAuthErrorModal,
    session,
    activeSessionMatch,
    canStart,
    playerName,
    setPlayerName,
    matches,
    joinRoom,
    spectateRoom,
    leaveRoom,
    createRoom,
    refreshMatches,
    loading,
    error,
    setError,
    roomPlayerNames,
    gameMode,
    setGameMode,
    roomCapacity,
    setRoomCapacity,
    createWithBots,
    setCreateWithBots,
    botCount,
    setBotCount,
    botDifficulty,
    setBotDifficulty,
    botProfile,
    setBotProfile,
    lobbyGameUiConfig,
    sharedDeckTemplate,
    sharedRanks,
    cardImageById,
    optionalLobbyModules,
    selectedOptionalModuleIds,
    setSelectedOptionalModuleIds,
    galleryCategoryFilter,
    setGalleryCategoryFilter,
    galleryCards,
    galleryCategories,
    gameUiVariant,
    activeSessionInviteText,
    activeSessionShareLink,
    effectLabel,
    rules,
  } = props;

  const fallbackPlayerName = user?.displayName?.trim() || user?.username?.trim() || '';

  return (
    <>
      {/* Admin Auth Screen */}
      {isAdminRoute && (!props.adminAuthorized || props.adminAuthChecking) ? (
        <section className={`admin-shell-v4 admin-panel-v4 admin-shell-v2 admin-panel-v2 admin-auth-shell${props.adminUiVariant === 'v1' ? ' admin-shell-v1 admin-panel-v1' : ''}`}>
          <h2>{t.adminTitle}</h2>
          <p className="admin-auth-status">{props.adminAuthChecking ? t.loading : (props.adminAuthError || (props.adminAuthEnabled === false ? t.adminAuthDisabledHint : t.adminUnauthorized))}</p>
          {!props.adminAuthChecking ? (
            <p className="admin-controls admin-auth-actions">
              <button type="button" onClick={() => { void props.verifyAdminToken(); }}>{t.refreshRooms}</button>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Lobby Section */}
      {!isAdminRoute && activeUserTab === 'games' && !session ? (
        <LobbySection
          t={t}
          playerName={playerName}
          fallbackPlayerName={fallbackPlayerName}
          authenticatedUser={Boolean(user)}
          setPlayerName={setPlayerName}
          roomCapacity={roomCapacity}
          setRoomCapacity={setRoomCapacity}
          allowedRoomCapacities={lobbyGameUiConfig.allowedRoomCapacities}
          gameMode={gameMode}
          setGameMode={setGameMode}
          createWithBots={createWithBots}
          setCreateWithBots={setCreateWithBots}
          botCount={botCount}
          setBotCount={setBotCount}
          allowedBotCounts={lobbyGameUiConfig.allowedBotCounts}
          botDifficulty={botDifficulty}
          setBotDifficulty={setBotDifficulty}
          botProfile={botProfile}
          setBotProfile={setBotProfile}
          createRoom={() => { void createRoom(); }}
          refreshMatches={() => { void refreshMatches(); }}
          loading={loading}
          error={error}
          matches={matches}
          joinRoom={(match) => { void joinRoom(match); }}
          spectateRoom={(match) => { void spectateRoom(match); }}
          optionalModules={optionalLobbyModules}
          selectedOptionalModuleIds={selectedOptionalModuleIds}
          setSelectedOptionalModuleIds={setSelectedOptionalModuleIds}
          uiVariant={gameUiVariant}
        />
      ) : null}

      {/* Active Game Session */}
      <div style={{ display: (!isAdminRoute && activeUserTab === 'games' && Boolean(session) && Boolean(activeSessionMatch) && canStart) ? 'block' : 'none' }}>
        {session ? (
          <Suspense fallback={<p>{t.loading}</p>}>
            {gameUiVariant === 'v1' ? (
              <NetworkClientV1
                key={`${session.matchID}:${session.playerID ?? 'spectator'}:v1`}
                matchID={session.matchID}
                playerID={session.spectator ? (null as never) : session.playerID}
                credentials={session.credentials}
                lang={lang}
                playerName={session.spectator ? t.spectatorJoinedLabel : playerName}
                knownPlayerNames={roomPlayerNames}
                sharedRanks={sharedRanks}
                rankTrackCards={sharedDeckTemplate.rankTrack}
                cardImageById={cardImageById}
                resourceImagePaths={lobbyGameUiConfig.resourceImagePaths}
                roomMeta={{ matchID: session.matchID, playerID: session.playerID }}
                inviteText={activeSessionInviteText}
                shareLink={activeSessionShareLink}
                onLeaveRoom={() => { void leaveRoom(); }}
              />
            ) : (
              <NetworkClientV2
                key={`${session.matchID}:${session.playerID ?? 'spectator'}:v2`}
                matchID={session.matchID}
                playerID={session.spectator ? (null as never) : session.playerID}
                credentials={session.credentials}
                lang={lang}
                playerName={session.spectator ? t.spectatorJoinedLabel : playerName}
                knownPlayerNames={roomPlayerNames}
                sharedRanks={sharedRanks}
                rankTrackCards={sharedDeckTemplate.rankTrack}
                cardImageById={cardImageById}
                resourceImagePaths={lobbyGameUiConfig.resourceImagePaths}
                roomMeta={{ matchID: session.matchID, playerID: session.playerID }}
                inviteText={activeSessionInviteText}
                shareLink={activeSessionShareLink}
                onLeaveRoom={() => { void leaveRoom(); }}
              />
            )}
          </Suspense>
        ) : null}
      </div>

      {/* Profile Section - Login/Profile */}
      {!isAdminRoute && activeUserTab === 'profile' && (user || profileScreen === 'login') ? (
        <ProfileSection
          t={t}
          lang={lang}
          user={user}
          loading={userLoading}
          busy={userBusy}
          error={userError}
          notice={profileNotice}
          loginDraft={loginDraft}
          setLoginDraft={setLoginDraft}
          onLogin={() => {
            setProfileNotice('');
            void loginUser(loginDraft)
              .then(() => {
                setPlayerName((prev: string) => prev.trim() ? prev : loginDraft.login.trim());
                setAuthErrorModal('');
                setProfileNotice(t.userLoginSuccess);
              })
              .catch((error: unknown) => {
                const message = String(error instanceof Error ? error.message : error);
                setUserError(message);
                setAuthErrorModal(message);
              });
          }}
          onLogout={() => {
            setProfileNotice('');
            void logoutUser()
              .then(() => {
                setProfileScreen('login');
                setAuthErrorModal('');
                setLoginDraft({ login: '', password: '' });
                setProfileNotice(t.userLogoutSuccess ?? '');
              })
              .catch((error: unknown) => setUserError(String(error instanceof Error ? error.message : error)));
          }}
          profileDraft={profileDraft}
          setProfileDraft={setProfileDraft}
          onSaveProfile={() => {
            setProfileNotice('');
            void updateUserProfile({ ...profileDraft, preferredLang: lang })
              .then(() => {
                const nextPlayerName = profileDraft.displayName.trim() || user?.username?.trim() || '';
                if (nextPlayerName) setPlayerName(nextPlayerName);
                setProfileNotice(t.userProfileSaved);
              })
              .catch((error: unknown) => setUserError(String(error instanceof Error ? error.message : error)));
          }}
          passwordDraft={passwordDraft}
          setPasswordDraft={setPasswordDraft}
          onChangePassword={() => {
            setProfileNotice('');
            void changePassword(passwordDraft)
              .then(() => {
                setPasswordDraft({ currentPassword: '', nextPassword: '' });
                setProfileNotice(t.userPasswordChanged);
              })
              .catch((error: unknown) => setUserError(String(error instanceof Error ? error.message : error)));
          }}
          stats={userStats}
          awards={userAwards}
          matchHistory={matchHistory}
          sessions={userSessions}
          onRefreshSessions={() => { void refreshSessions().catch((error: unknown) => setUserError(String(error instanceof Error ? error.message : error))); }}
          onLogoutAllSessions={() => { void logoutAllSessions().catch((error: unknown) => setUserError(String(error instanceof Error ? error.message : error))); }}
          onLogoutSession={(sessionId: string) => { void logoutSession(sessionId).catch((error: unknown) => setUserError(String(error instanceof Error ? error.message : error))); }}
          onOpenRegister={() => setProfileScreen('register')}
          onUploadAvatar={async (file: File) => {
            setProfileNotice('');
            setUserError('');
            try {
              await uploadAvatar(file);
              setProfileNotice(t.userAvatarUploaded);
            } catch (error: unknown) {
              setUserError(String(error instanceof Error ? error.message : error));
            }
          }}
          uiVariant={gameUiVariant}
        />
      ) : null}

      {/* Profile Section - Register */}
      {!isAdminRoute && activeUserTab === 'profile' && !user && profileScreen === 'register' ? (
        <RegisterSection
          t={t}
          busy={userBusy}
          error={userError}
          draft={registerDraft}
          setDraft={setRegisterDraft}
          onRegister={() => {
            setProfileNotice('');
            void props.registerUser?.(registerDraft)
              .then(() => {
                setProfileScreen('login');
                setLoginDraft({ login: registerDraft.username, password: registerDraft.password });
                setProfileNotice(t.userRegisterSuccess);
              })
              .catch((error: unknown) => setUserError(String(error instanceof Error ? error.message : error)));
          }}
          onBackToLogin={() => setProfileScreen('login')}
          uiVariant={gameUiVariant}
        />
      ) : null}

      {/* Profile Section - Password Reset */}
      {!isAdminRoute && activeUserTab === 'profile' && !user && profileScreen === 'reset' ? (
        <PasswordResetSection
          t={t}
          busy={userBusy}
          error={userError}
          onRequestReset={requestPasswordReset}
          onResetPassword={resetPassword}
          onBackToLogin={() => setProfileScreen('login')}
          uiVariant={gameUiVariant}
        />
      ) : null}

      {/* Statistics Section */}
      {!isAdminRoute && activeUserTab === 'statistics' ? (
        <StatisticsSection t={t} uiVariant={gameUiVariant} />
      ) : null}

      {/* Gallery Section */}
      {!isAdminRoute && activeUserTab === 'gallery' ? (
        <GallerySection
          t={t}
          cardImageById={cardImageById}
          galleryCategoryFilter={galleryCategoryFilter}
          setGalleryCategoryFilter={setGalleryCategoryFilter}
          galleryCards={galleryCards}
          galleryCategories={galleryCategories}
          effectLabel={effectLabel}
          uiVariant={gameUiVariant}
        />
      ) : null}

      {/* Rules Section */}
      {!isAdminRoute && activeUserTab === 'rules' ? (
        <RulesSection t={t} rules={rules} uiVariant={gameUiVariant} />
      ) : null}

      {/* Auth Error Modal */}
      {!isAdminRoute ? (
        <AuthErrorModal
          t={t}
          open={!user && activeUserTab === 'profile' && profileScreen === 'login' && Boolean(authErrorModal)}
          error={authErrorModal}
          onClose={() => setAuthErrorModal('')}
          onOpenReset={() => {
            setAuthErrorModal('');
            setProfileScreen('reset');
          }}
        />
      ) : null}
    </>
  );
};
