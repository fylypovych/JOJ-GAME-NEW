import { useEffect, useMemo, useState } from 'react';
import { text } from './i18n';
import {
  clampBotCountToAllowed,
  clampRoomCapacityToAllowed,
  getAvailableBotCounts,
} from '../game/lobbyConfig';
import { runGameSimulations } from '../game/jojGame';
import { SERVER_URL } from './app/clientConfig';
import {
  DEFAULT_SERVER_URL,
  PLAYER_NAME_STORAGE_KEY,
  RANKS_STORAGE_KEY,
  SERVER_URL_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SHARED_TEMPLATE_STORAGE_KEY,
  normalizeServerUrl,
} from './app/model';
import { useAdminSnapshot } from './app/useAdminSnapshot';
import { AppHeader } from './app/AppHeader';
import { AppFooter } from './app/AppFooter';
import {
  ActiveGameFeature,
  AdminFeature,
  AuthErrorFeature,
  BugReportFeature,
  GalleryFeature,
  LobbyFeature,
  PasswordResetFeature,
  ProfileFeature,
  RegisterFeature,
  RulesFeature,
  StatisticsFeature,
} from './app/AppFeatureContainers';
import { useAppShellState } from './app/useAppShellState';
import { useLobbyData } from './app/useLobbyData';
import { useDeckData } from './app/useDeckData';
import { useGalleryData } from './app/useGalleryData';
import { useAppUserState } from './app/useAppUserState';
import { useAppAdminState } from './app/useAppAdminState';
import { useProfileHandlers } from './app/useProfileHandlers';
import { useAuthHandlers } from './app/useAuthHandlers';
import { useGameSessionHandlers } from './app/useGameSessionHandlers';
import { useAdminMatchControls } from './app/useAdminMatchControls';
import { useDeckHandlers } from './app/useDeckHandlers';
import { LobbyProvider } from './providers/LobbyContext';
import { DeckProvider } from './providers/DeckContext';
import { GalleryProvider } from './providers/GalleryContext';
const ADMIN_RESTART_API = `${SERVER_URL}/api/admin/restart`;
const ADMIN_MATCH_STATE_API = `${SERVER_URL}/api/admin/match-state`;
const ADMIN_MATCH_STOP_API = `${SERVER_URL}/api/admin/match-stop`;
const ADMIN_MATCH_RESET_API = `${SERVER_URL}/api/admin/match-reset`;
const ADMIN_MATCH_DELETE_API = `${SERVER_URL}/api/admin/match-delete`;

export const App = () => {
  const buildLabel = __APP_BUILD_LABEL__;
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  const {
    lang,
    setLang,
    playerName,
    setPlayerName,
    roomCapacity,
    setRoomCapacity,
    gameMode,
    setGameMode,
    createWithBots,
    setCreateWithBots,
    botCount,
    setBotCount,
    botDifficulty,
    setBotDifficulty,
    botProfile,
    setBotProfile,
    selectedOptionalModuleIds,
    setSelectedOptionalModuleIds,
    adminSelectedMatchID,
    setAdminSelectedMatchID,
    activeUserTab,
    setActiveUserTab,
    profileScreen,
    setProfileScreen,
    authErrorModal,
    setAuthErrorModal,
    gameUiVariant,
    setGameUiVariant,
    adminUiVariant,
    galleryCategoryFilter,
    setGalleryCategoryFilter,
    deletingAdminMatch,
    setDeletingAdminMatch,
    loginDraft,
    setLoginDraft,
    registerDraft,
    setRegisterDraft,
    profileDraft,
    setProfileDraft,
    profileNotice,
    setProfileNotice,
    passwordDraft,
    setPasswordDraft,
    resetRequestDraft,
    setResetRequestDraft,
    resetPasswordDraft,
    setResetPasswordDraft,
    serverUrlDraft,
    setServerUrlDraft,
    theme,
    setTheme,
  } = useAppShellState(SERVER_URL);
  const t = text(lang);

  // Consolidated user + auth state (replaces useUserAccount + useAdminAuth)
  const {
    user,
    stats: userStats,
    awards: userAwards,
    matchHistory,
    sessions: userSessions,
    loading: userLoading,
    busy: userBusy,
    error: userError,
    setError: setUserError,
    setUser,
    register: registerUser,
    login: loginUser,
    logout: logoutUser,
    updateProfile: updateUserProfile,
    uploadAvatar,
    changePassword,
    requestPasswordReset,
    resetPassword,
    refreshSessions,
    logoutAllSessions,
    logoutSession,
    bindMatchSession,
    adminAuthChecking,
    adminAuthorized,
    adminAuthEnabled,
    adminAuthError,
    adminFetch,
    verifyAdminToken,
  } = useAppUserState({
    serverUrl: SERVER_URL,
    lang,
    isAdminRoute,
    t: {
      adminUnauthorized: t.adminUnauthorized,
      serverUnavailable: t.serverUnavailable,
    },
  });

  const {
    adminStorageMode,
    setAdminStorageMode,
    adminDbConfigDraft,
    setAdminDbConfigDraft,
    dbConfigSaveStatus,
    dbConnectionTestStatus,
    dbConnectionTestError,
    dbConnectionTestRunning,
    dbExportSchemaStatus,
    dbExportSchemaError,
    dbExportSchemaRunning,
    dbImportSchemaStatus,
    dbImportSchemaError,
    dbImportSchemaRunning,
    dbImportJsonConfigStatus,
    dbImportJsonConfigError,
    dbImportJsonConfigRunning,
    dbCheckSyncStatus,
    dbCheckSyncError,
    dbCheckSyncRunning,
    dbExportBackupStatus,
    dbExportBackupError,
    dbExportBackupRunning,
    dbRestoreBackupStatus,
    dbRestoreBackupError,
    dbRestoreBackupRunning,
    dbSyncMigrationsStatus,
    dbSyncMigrationsError,
    dbSyncMigrationsRunning,
    syncDbMigrations,
    saveDbConfigDraft,
    testDbConnection,
    exportDbSchema,
    importDbSchema,
    importJsonConfigToDb,
    checkDbConfigSync,
    exportDbBackup,
    restoreDbBackup,
    ADMIN_STORAGE_MODE_STORAGE_KEY,
    LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY,
  } = useAppAdminState({
    serverUrl: SERVER_URL,
    lang,
    adminFetch,
    enabled: isAdminRoute && adminAuthorized,
  });

  // Direct data hooks (replaces useAppGameState)
  const {
    sharedDeckTemplate,
    cardCatalog,
    sharedRanks,
    setSharedRanksState,
    sharedConfigLoaded,
    refreshSharedDeckTemplate,
    syncRanksToServer,
    sharedDeckStats,
    rollbackTemplate,
    applyTemplateChange,
    rollbackRanks,
    optionalLobbyModules,
  } = useDeckData({
    serverUrl: SERVER_URL,
    sharedTemplateStorageKey: SHARED_TEMPLATE_STORAGE_KEY,
    ranksStorageKey: RANKS_STORAGE_KEY,
  });

  const {
    matches,
    session,
    setSession,
    loading,
    error,
    setError,
    refreshMatches,
    createRoom,
    joinRoom,
    spectateRoom,
    leaveRoom,
    roomPlayerNames,
    canStart,
    lobbyGameUiConfig,
    adminMatchID,
    activeSessionMatch,
    activeSessionShareLink,
    activeSessionGameModeLabel,
    activeSessionInviteText,
  } = useLobbyData({
    serverUrl: SERVER_URL,
    playerName,
    user,
    gameMode,
    roomCapacity,
    createWithBots,
    botCount,
    botDifficulty,
    botProfile,
    selectedOptionalModuleIds,
    adminSelectedMatchID,
    t: {
      serverUnavailable: t.serverUnavailable,
      enterName: t.enterName,
      roomFull: t.roomFull,
      createFailed: t.createFailed,
      joinFailed: t.joinFailed,
      gameModeStandardPlus: t.gameModeStandardPlus,
      gameModeSimplified: t.gameModeSimplified,
      gameModeStandard: t.gameModeStandard,
      activeRoom: t.activeRoom,
      gameModeLabel: t.gameModeLabel,
      roomSummaryPlayers: t.roomSummaryPlayers,
    },
    bindMatchSession,
  });

  const { galleryCards, cardImageById } = useGalleryData({
    cardCatalog,
    sharedDeckTemplate,
    galleryCategoryFilter,
  });

  useEffect(() => {
    const alwaysOn = optionalLobbyModules.filter((module) => module.alwaysOn).map((module) => module.id);
    setSelectedOptionalModuleIds((prev) => {
      const merged = Array.from(new Set([...prev, ...alwaysOn]));
      const allowed = new Set(optionalLobbyModules.map((module) => module.id));
      return merged.filter((id) => allowed.has(id));
    });
  }, [optionalLobbyModules]);
  useEffect(() => {
    const nextRoomCapacity = clampRoomCapacityToAllowed(roomCapacity, lobbyGameUiConfig.allowedRoomCapacities);
    if (roomCapacity !== nextRoomCapacity) {
      setRoomCapacity(nextRoomCapacity);
      return;
    }
    const availableBotCounts = getAvailableBotCounts(lobbyGameUiConfig.allowedBotCounts, roomCapacity);
    if (createWithBots && availableBotCounts.length === 0) {
      setCreateWithBots(false);
      return;
    }
    const nextBotCount = clampBotCountToAllowed(
      botCount || lobbyGameUiConfig.defaultBotCount,
      lobbyGameUiConfig.allowedBotCounts,
      roomCapacity,
    );
    if (createWithBots && nextBotCount > 0 && botCount !== nextBotCount) {
      setBotCount(nextBotCount);
      return;
    }
    if (!createWithBots && availableBotCounts.length > 0 && botCount !== lobbyGameUiConfig.defaultBotCount) {
      const fallbackBotCount = clampBotCountToAllowed(
        lobbyGameUiConfig.defaultBotCount,
        lobbyGameUiConfig.allowedBotCounts,
        roomCapacity,
      );
      if (fallbackBotCount > 0 && botCount !== fallbackBotCount) setBotCount(fallbackBotCount);
    }
  }, [lobbyGameUiConfig, roomCapacity, createWithBots, botCount]);
  const effectLabel = (resource: 'time' | 'reputation' | 'discipline' | 'documents' | 'tech' | 'rank') =>
    resource === 'rank' ? t.rankResource : t.resources[resource];
  const rules = t.rulesList;
  const saveServerUrl = (nextValue: string) => {
    const normalized = normalizeServerUrl(nextValue || DEFAULT_SERVER_URL) || DEFAULT_SERVER_URL;
    window.localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
    setServerUrlDraft(normalized);
    window.location.reload();
  };
  const resetServerUrl = () => {
    window.localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    setServerUrlDraft(DEFAULT_SERVER_URL);
    window.location.reload();
  };
  const { snapshot, setSnapshot } = useAdminSnapshot({
    isAdminRoute,
    adminAuthorized,
    adminMatchID,
    adminFetch,
    adminMatchStateApi: ADMIN_MATCH_STATE_API,
  });

  useEffect(() => {
    if (!user) return;
    setProfileScreen('login');
    setAuthErrorModal('');
    setProfileDraft({
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      bio: user.bio ?? '',
      avatarUrl: user.avatarUrl ?? '',
      profilePublic: user.profilePublic !== false,
      showStatsPublic: user.showStatsPublic !== false,
      showRecentMatchesPublic: user.showRecentMatchesPublic === true,
    });
  }, [user]);

  useEffect(() => {
    if (user || profileScreen !== 'login' || activeUserTab !== 'profile') {
      setAuthErrorModal('');
    }
  }, [user, profileScreen, activeUserTab]);

  useEffect(() => {
    if (!user) return;
    const nextPlayerName = user.displayName?.trim() || user.username?.trim() || '';
    if (!nextPlayerName) return;
    if (playerName === nextPlayerName) return;
    setPlayerName(nextPlayerName);
  }, [user?.displayName, user?.username]);

  const resolvedUserPlayerName = user?.displayName?.trim() || user?.username?.trim() || '';

  useEffect(() => {
    if (!user || !session?.matchID || !session?.playerID || !session.credentials) return;
    void bindMatchSession({
      matchID: session.matchID,
      playerID: session.playerID,
      credentials: session.credentials,
      playerName: resolvedUserPlayerName || playerName,
    });
  }, [user, session?.matchID, session?.playerID, session?.credentials]);

  useEffect(() => {
    if (session?.matchID) {
      setAdminSelectedMatchID(session.matchID);
      return;
    }
    if (adminSelectedMatchID && matches.some((m) => m.matchID === adminSelectedMatchID)) return;
    setAdminSelectedMatchID(matches[0]?.matchID ?? '');
  }, [adminSelectedMatchID, matches, session?.matchID]);

  useEffect(() => {
    document.title = isAdminRoute ? t.adminTitle : t.gameTitle;
  }, [isAdminRoute, t.adminTitle, t.gameTitle]);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_STORAGE_MODE_STORAGE_KEY, adminStorageMode);
    window.localStorage.removeItem(LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY);
  }, [adminStorageMode]);

  // Profile handlers
  const {
    onLogin,
    onLogout,
    onSaveProfile,
    onChangePassword,
    onUploadAvatar,
    onRefreshSessions,
    onLogoutAllSessions,
    onLogoutSession,
    onOpenRegister,
  } = useProfileHandlers({
    user,
    lang,
    loginDraft,
    profileDraft,
    passwordDraft,
    loginUser,
    logoutUser,
    updateUserProfile,
    changePassword,
    uploadAvatar,
    refreshSessions,
    logoutAllSessions,
    logoutSession,
    setPlayerName,
    setAuthErrorModal,
    setProfileScreen,
    setProfileNotice,
    setLoginDraft,
    setPasswordDraft,
    setUserError,
    setUser,
    t,
  });

  // Auth handlers
  const {
    onRegister,
    onBackToLogin,
    onRequestPasswordReset,
    onResetPassword,
  } = useAuthHandlers({
    registerDraft,
    resetRequestDraft,
    resetPasswordDraft,
    registerUser,
    requestPasswordReset,
    resetPassword,
    setProfileScreen,
    setUserError,
  });

  // Game session handlers (effects only)
  useGameSessionHandlers({
    user,
    playerName,
    session,
    matches,
    adminSelectedMatchID,
    bindMatchSession,
    setAdminSelectedMatchID,
  });

  // Admin match controls
  const {
    onRestartServer,
    onResetMatch,
    onDeleteMatch,
    onStopGame,
  } = useAdminMatchControls({
    adminMatchID,
    adminFetch,
    setSnapshot,
    setAdminSelectedMatchID,
    refreshMatches,
    setDeletingAdminMatch,
    ADMIN_RESTART_API,
    ADMIN_MATCH_STATE_API,
    ADMIN_MATCH_STOP_API,
    ADMIN_MATCH_RESET_API,
    ADMIN_MATCH_DELETE_API,
  });

  // Deck handlers (simplified - imports directly from sharedConfig)
  const {
    onShuffleDeck,
    onAddCard,
    onAddCustomCard,
    onUpdateCard,
    onRemoveCard,
    onResetDeck,
    onSetBack,
    onExportTemplate,
    onImportTemplate,
    onSetRanks,
    onResetRanks,
  } = useDeckHandlers({
    sharedRanks,
    refreshSharedDeckTemplate,
    setSharedRanksState,
  });

  const shellUiVariant = isAdminRoute ? adminUiVariant : gameUiVariant;

  // Prepare context values with memoization to prevent unnecessary re-renders
  const lobbyContextValue = useMemo(() => ({
    matches,
    session,
    setSession,
    loading,
    error,
    setError,
    refreshMatches,
    createRoom,
    joinRoom,
    spectateRoom,
    leaveRoom,
    roomPlayerNames,
    canStart,
    lobbyGameUiConfig,
    adminMatchID,
    activeSessionMatch,
    activeSessionShareLink,
    activeSessionGameModeLabel,
    activeSessionInviteText,
  }), [
    matches, session, loading, error, roomPlayerNames, canStart,
    lobbyGameUiConfig, adminMatchID, activeSessionMatch,
    activeSessionShareLink, activeSessionGameModeLabel, activeSessionInviteText,
    setSession, setError, refreshMatches, createRoom, joinRoom, spectateRoom, leaveRoom,
  ]);

  const deckContextValue = useMemo(() => ({
    sharedDeckTemplate,
    cardCatalog,
    sharedRanks,
    setSharedRanksState,
    sharedConfigLoaded,
    refreshSharedDeckTemplate,
    syncRanksToServer,
    sharedDeckStats,
    optionalLobbyModules,
    rollbackTemplate,
    applyTemplateChange,
    rollbackRanks,
  }), [
    sharedDeckTemplate, cardCatalog, sharedRanks, sharedConfigLoaded,
    sharedDeckStats, optionalLobbyModules,
    setSharedRanksState, refreshSharedDeckTemplate, syncRanksToServer,
    rollbackTemplate, applyTemplateChange, rollbackRanks,
  ]);

  const galleryContextValue = useMemo(() => ({
    optionalLobbyModules,
    galleryCards,
    cardImageById,
  }), [optionalLobbyModules, galleryCards, cardImageById]);

  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > window.innerHeight);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <LobbyProvider value={lobbyContextValue}>
      <DeckProvider value={deckContextValue}>
        <GalleryProvider value={galleryContextValue}>
          <main className={`app app-${shellUiVariant}${shellUiVariant === 'v1' ? ' app-v1' : ' app-v2'}`} data-bug-report-capture-root="true">
            <AppHeader
              isAdminRoute={isAdminRoute}
              lang={lang}
              setLang={setLang}
              activeUserTab={activeUserTab}
              setActiveUserTab={setActiveUserTab}
              gameUiVariant={gameUiVariant}
              setGameUiVariant={setGameUiVariant}
              theme={theme}
              setTheme={setTheme}
              t={t}
            />
            <p className="app-link-row">
              {isAdminRoute ? <a href="/">{t.openGame}</a> : null}
            </p>

            {isAdminRoute && (!adminAuthorized || adminAuthChecking) ? (
              <section className={`admin-shell-v4 admin-panel-v4 admin-shell-v2 admin-panel-v2 admin-auth-shell${adminUiVariant === 'v1' ? ' admin-shell-v1 admin-panel-v1' : ''}`}>
                <h2>{t.adminTitle}</h2>
                <p className="admin-auth-status">{adminAuthChecking ? t.loading : (adminAuthError || (adminAuthEnabled === false ? t.adminAuthDisabledHint : t.adminUnauthorized))}</p>
                {!adminAuthChecking ? (
                  <p className="admin-controls admin-auth-actions">
                    <button type="button" onClick={() => { void verifyAdminToken(); }}>{t.refreshRooms}</button>
                  </p>
                ) : null}
              </section>
            ) : null}

            <LobbyFeature
              visible={!isAdminRoute && activeUserTab === 'games' && !session}
              t={t}
              playerName={playerName}
              fallbackPlayerName={user?.displayName?.trim() || user?.username?.trim() || ''}
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
              selectedOptionalModuleIds={selectedOptionalModuleIds}
              setSelectedOptionalModuleIds={setSelectedOptionalModuleIds}
              uiVariant={gameUiVariant}
            />

            <ActiveGameFeature
              visible={!isAdminRoute && activeUserTab === 'games' && Boolean(session) && Boolean(activeSessionMatch) && canStart}
              loadingLabel={t.loading}
              gameUiVariant={gameUiVariant}
              session={session}
              lang={lang}
              playerName={playerName}
              spectatorJoinedLabel={t.spectatorJoinedLabel}
              roomPlayerNames={roomPlayerNames}
            />

            <ProfileFeature
              visible={!isAdminRoute && activeUserTab === 'profile' && (Boolean(user) || profileScreen === 'login')}
              t={t}
              lang={lang}
              user={user}
              loading={userLoading}
              busy={userBusy}
              error={userError}
              notice={profileNotice}
              loginDraft={loginDraft}
              setLoginDraft={setLoginDraft}
              onLogin={onLogin}
              onLogout={onLogout}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              onSaveProfile={onSaveProfile}
              passwordDraft={passwordDraft}
              setPasswordDraft={setPasswordDraft}
              onChangePassword={onChangePassword}
              stats={userStats}
              awards={userAwards}
              matchHistory={matchHistory}
              sessions={userSessions}
              onRefreshSessions={onRefreshSessions}
              onLogoutAllSessions={onLogoutAllSessions}
              onLogoutSession={onLogoutSession}
              onOpenRegister={onOpenRegister}
              onUploadAvatar={onUploadAvatar}
              uiVariant={gameUiVariant}
            />

            <RegisterFeature
              visible={!isAdminRoute && activeUserTab === 'profile' && !user && profileScreen === 'register'}
              t={t}
              busy={userBusy}
              error={userError}
              registerDraft={registerDraft}
              setRegisterDraft={setRegisterDraft}
              onRegister={onRegister}
              onBackToLogin={onBackToLogin}
              uiVariant={gameUiVariant}
            />

            <PasswordResetFeature
              visible={!isAdminRoute && activeUserTab === 'profile' && !user && profileScreen === 'reset'}
              t={t}
              busy={userBusy}
              error={userError}
              resetRequestDraft={resetRequestDraft}
              setResetRequestDraft={setResetRequestDraft}
              onRequestPasswordReset={onRequestPasswordReset}
              resetPasswordDraft={resetPasswordDraft}
              setResetPasswordDraft={setResetPasswordDraft}
              onResetPassword={onResetPassword}
              onBackToLogin={onBackToLogin}
              uiVariant={gameUiVariant}
            />

            <StatisticsFeature
              visible={!isAdminRoute && activeUserTab === 'statistics'}
              t={t}
              lang={lang}
              user={user}
              stats={userStats}
              awards={userAwards}
              matchHistory={matchHistory}
              sessions={userSessions}
              onLogoutSession={onLogoutSession}
              uiVariant={gameUiVariant}
            />

            <GalleryFeature
              visible={!isAdminRoute && activeUserTab === 'gallery'}
              t={t}
              lang={lang}
              galleryCategoryFilter={galleryCategoryFilter}
              setGalleryCategoryFilter={setGalleryCategoryFilter}
              effectLabel={effectLabel}
              uiVariant={gameUiVariant}
              cardCatalog={cardCatalog}
            />

            <RulesFeature visible={!isAdminRoute && activeUserTab === 'rules'} t={t} rules={rules} uiVariant={gameUiVariant} />

            <AdminFeature
              visible={isAdminRoute && adminAuthorized}
              loadingLabel={t.loading}
              uiVariant={adminUiVariant}
              lang={lang}
              serverUrl={SERVER_URL}
              serverUrlDraft={serverUrlDraft}
              setServerUrlDraft={setServerUrlDraft}
              saveServerUrl={saveServerUrl}
              resetServerUrl={resetServerUrl}
              adminStorageMode={adminStorageMode}
              setAdminStorageMode={setAdminStorageMode}
              adminDbConfigDraft={adminDbConfigDraft}
              setAdminDbConfigDraft={setAdminDbConfigDraft}
              saveDbConfigDraft={saveDbConfigDraft}
              testDbConnection={testDbConnection}
              exportDbSchema={exportDbSchema}
              importDbSchema={importDbSchema}
              importJsonConfigToDb={importJsonConfigToDb}
              checkDbConfigSync={checkDbConfigSync}
              exportDbBackup={exportDbBackup}
              restoreDbBackup={restoreDbBackup}
              dbConfigSaveStatus={dbConfigSaveStatus}
              dbConnectionTestStatus={dbConnectionTestStatus}
              dbConnectionTestError={dbConnectionTestError}
              dbConnectionTestRunning={dbConnectionTestRunning}
              dbExportSchemaStatus={dbExportSchemaStatus}
              dbExportSchemaError={dbExportSchemaError}
              dbExportSchemaRunning={dbExportSchemaRunning}
              dbImportSchemaStatus={dbImportSchemaStatus}
              dbImportSchemaError={dbImportSchemaError}
              dbImportSchemaRunning={dbImportSchemaRunning}
              dbImportJsonConfigStatus={dbImportJsonConfigStatus}
              dbImportJsonConfigError={dbImportJsonConfigError}
              dbImportJsonConfigRunning={dbImportJsonConfigRunning}
              dbCheckSyncStatus={dbCheckSyncStatus}
              dbCheckSyncError={dbCheckSyncError}
              dbCheckSyncRunning={dbCheckSyncRunning}
              dbExportBackupStatus={dbExportBackupStatus}
              dbExportBackupError={dbExportBackupError}
              dbExportBackupRunning={dbExportBackupRunning}
              dbRestoreBackupStatus={dbRestoreBackupStatus}
              dbRestoreBackupError={dbRestoreBackupError}
              dbRestoreBackupRunning={dbRestoreBackupRunning}
              dbSyncMigrationsStatus={dbSyncMigrationsStatus}
              dbSyncMigrationsError={dbSyncMigrationsError}
              dbSyncMigrationsRunning={dbSyncMigrationsRunning}
              syncDbMigrations={syncDbMigrations}
              matches={matches}
              adminMatchID={adminMatchID}
              setAdminSelectedMatchID={setAdminSelectedMatchID}
              snapshot={snapshot}
              sharedDeckStats={sharedDeckStats}
              sharedDeckTemplate={sharedDeckTemplate}
              cardCatalog={cardCatalog}
              sharedRanks={sharedRanks}
              sharedConfigLoaded={sharedConfigLoaded}
              createRoom={createRoom}
              onResetMatch={onResetMatch}
              onDeleteMatch={onDeleteMatch}
              deletingAdminMatch={deletingAdminMatch}
              clearSessionState={() => {
                window.localStorage.removeItem(SESSION_STORAGE_KEY);
                window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
                setSession(null);
                setPlayerName('');
                setError('');
                void refreshMatches();
              }}
              onRestartServer={onRestartServer}
              onShuffleDeck={onShuffleDeck}
              onAddCard={onAddCard}
              onAddCustomCard={onAddCustomCard}
              onUpdateCard={onUpdateCard}
              onRemoveCard={onRemoveCard}
              onResetDeck={onResetDeck}
              onSetBack={onSetBack}
              onExportTemplate={onExportTemplate}
              onImportTemplate={onImportTemplate}
              onSetRanks={onSetRanks}
              onResetRanks={onResetRanks}
              onStopGame={onStopGame}
              runGameSimulations={(players, simulations, options) =>
                runGameSimulations(players, simulations, 0, options)
              }
            />

            <AuthErrorFeature
              visible={!isAdminRoute}
              t={t}
              open={!user && activeUserTab === 'profile' && profileScreen === 'login' && Boolean(authErrorModal)}
              error={authErrorModal}
              onClose={() => setAuthErrorModal('')}
              onOpenReset={() => {
                setAuthErrorModal('');
                setActiveUserTab('profile');
                setProfileScreen('reset');
              }}
            />
            <BugReportFeature
              visible={!isAdminRoute}
              lang={lang}
              serverUrl={SERVER_URL}
              session={session}
              user={user}
              playerName={playerName}
              gameUiVariant={gameUiVariant}
            />
            <AppFooter buildLabel={buildLabel} />
          </main>
          {showScrollTop && (
              <button
                onClick={scrollToTop}
                className="scroll-to-top-button"
                aria-label="Наверх"
                title="Наверх"
              >
                ↑
              </button>
            )}
        </GalleryProvider>
      </DeckProvider>
    </LobbyProvider>
  );
};
