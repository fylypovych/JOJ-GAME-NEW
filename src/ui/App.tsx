import { Suspense, lazy, useEffect, useMemo } from 'react';
import type { CardDefinition, RankDefinition } from '../game/types';
import {
  addCustomCardToSharedDeckTemplate,
  addCardToSharedDeckTemplate,
  type DeckTarget,
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  getSharedRanks,
  getSharedDeckTemplateStats,
  importSharedDeckTemplateJson,
  removeCardAtFromSharedDeckTemplate,
  runGameSimulations,
  setSharedRanks,
  resetSharedRanks,
  resetSharedDeckTemplate,
  setSharedDeckBackImage,
  shuffleSharedDeckTemplate,
  updateCardAtInSharedDeckTemplate,
} from '../game/jojGame';
import { text } from './i18n';
import { formatModuleDisplayName } from './moduleDisplay';
import {
  clampBotCountToAllowed,
  clampRoomCapacityToAllowed,
  getAvailableBotCounts,
} from '../game/lobbyConfig';
import { SERVER_URL } from './app/clientConfig';
import {
  DEFAULT_SERVER_URL,
  PLAYER_NAME_STORAGE_KEY,
  RANKS_STORAGE_KEY,
  SERVER_URL_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  galleryCategories,
  normalizeServerUrl,
} from './app/model';
import {
  AuthErrorModal,
  GallerySection,
  LobbySection,
  PasswordResetSection,
  ProfileSection,
  RegisterSection,
  RulesSection,
  StatisticsSection,
} from './app/sections';
import { useAdminSnapshot } from './app/useAdminSnapshot';
import { BugReportWidget } from './app/BugReportWidget';
import { buildRoomShareLink } from './app/share';
import { AppHeader } from './app/AppHeader';
import { AppFooter } from './app/AppFooter';
import { useAppShellState } from './app/useAppShellState';
import { useAppGameState } from './app/useAppGameState';
import { useAppUserState } from './app/useAppUserState';
import { useAppAdminState } from './app/useAppAdminState';
import { useProfileHandlers } from './app/useProfileHandlers';
import { useAuthHandlers } from './app/useAuthHandlers';
import { useGameSessionHandlers } from './app/useGameSessionHandlers';

const AdminPage = lazy(async () => import('./AdminPage').then((module) => ({ default: module.AdminPage })));
const NetworkClientV1 = lazy(async () => import('./app/networkClients').then((module) => ({ default: module.NetworkClientV1 })));
const NetworkClientV2 = lazy(async () => import('./app/networkClients').then((module) => ({ default: module.NetworkClientV2 })));
const RANKS_API = `${SERVER_URL}/api/shared-ranks`;
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
    // setGameUiVariant, // moved to AppHeader
    adminUiVariant,
    // setAdminUiVariant, // moved to AppHeader
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
    dbExportBackupStatus,
    dbExportBackupError,
    dbExportBackupRunning,
    dbRestoreBackupStatus,
    dbRestoreBackupError,
    dbRestoreBackupRunning,
    saveDbConfigDraft,
    testDbConnection,
    exportDbSchema,
    importDbSchema,
    importJsonConfigToDb,
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

  // Consolidated game state (replaces useSharedConfigSync + useLobbySession)
  const {
    sharedDeckTemplate,
    cardCatalog,
    sharedRanks,
    setSharedRanksState,
    sharedConfigLoaded,
    refreshSharedDeckTemplate,
    syncRanksToServer,
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
  } = useAppGameState({
    serverUrl: SERVER_URL,
    playerName,
    user,
    lang,
    gameMode,
    roomCapacity,
    createWithBots,
    botCount,
    botDifficulty,
    botProfile,
    selectedOptionalModuleIds,
    t: {
      serverUnavailable: t.serverUnavailable,
      enterName: t.enterName,
      roomFull: t.roomFull,
      createFailed: t.createFailed,
      joinFailed: t.joinFailed,
    },
    bindMatchSession,
  });

  const sharedDeckStats = getSharedDeckTemplateStats();
  const rollbackTemplate = (json: string) => {
    const result = importSharedDeckTemplateJson(json);
    if (result.ok) void refreshSharedDeckTemplate(false);
  };
  const applyTemplateChange = async (mutate: () => void, previousJson = exportSharedDeckTemplateJson()) => {
    mutate();
    const ok = await refreshSharedDeckTemplate();
    if (!ok) rollbackTemplate(previousJson);
    return ok;
  };
  const rollbackRanks = (previousRanks: RankDefinition[]) => {
    if (!setSharedRanks(previousRanks)) return;
    setSharedRanksState(getSharedRanks());
    window.localStorage.setItem(RANKS_STORAGE_KEY, exportSharedRanksJson());
  };
  const optionalLobbyModules = useMemo(
    () => (sharedDeckTemplate.modules ?? [])
      .filter((module) => module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck')
      .map((module) => ({
        id: module.id,
        name: formatModuleDisplayName(module.name, module.id),
        alwaysOn: module.category === 'VVNZ',
      })),
    [sharedDeckTemplate.modules],
  );
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
  const galleryCards = useMemo(() => {
    const rankTrackIds = new Set(sharedDeckTemplate.rankTrack.map((card) => card.id));
    if (galleryCategoryFilter === 'RANK') {
      return [...sharedDeckTemplate.rankTrack]
        .sort((a, b) => a.title.localeCompare(b.title));
    }
    return [...cardCatalog]
      .filter((card) => galleryCategoryFilter === 'ALL'
        ? !rankTrackIds.has(card.id)
        : card.category === galleryCategoryFilter && !rankTrackIds.has(card.id))
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [cardCatalog, galleryCategoryFilter, sharedDeckTemplate.rankTrack]);
  const cardImageById = useMemo<Record<string, string>>(
    () =>
      cardCatalog.reduce<Record<string, string>>((acc, card) => {
        if (typeof card.image === 'string' && card.image.trim()) acc[card.id] = card.image;
        return acc;
      }, {}),
    [cardCatalog],
  );
  const activeSessionMatch = session
    ? matches.find((match) => match.matchID === session.matchID) ?? null
    : null;
  const activeSessionShareLink = session ? buildRoomShareLink(session.matchID) : '';
  const activeSessionGameModeLabel = activeSessionMatch?.setupData?.gameMode === 'standard_plus'
    ? t.gameModeStandardPlus
    : activeSessionMatch?.setupData?.gameMode === 'simplified'
      ? t.gameModeSimplified
      : t.gameModeStandard;
  const activeSessionInviteText = session
    ? `${t.activeRoom}: ${session.matchID}\n${t.gameModeLabel}: ${activeSessionGameModeLabel}\n${t.roomSummaryPlayers}: ${activeSessionMatch ? `${activeSessionMatch.players.filter((player) => Boolean(player.name?.trim())).length}/${activeSessionMatch.players.length}` : '-'}\n${activeSessionShareLink}`
    : '';
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
  const adminMatchID = useMemo(() => {
    if (session?.matchID) return session.matchID;
    if (adminSelectedMatchID && matches.some((m) => m.matchID === adminSelectedMatchID)) return adminSelectedMatchID;
    return matches[0]?.matchID ?? '';
  }, [adminSelectedMatchID, matches, session?.matchID]);
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
    if (resolvedUserPlayerName && playerName.trim() === resolvedUserPlayerName) return;
    void bindMatchSession({
      matchID: session.matchID,
      playerID: session.playerID,
      credentials: session.credentials,
      playerName: resolvedUserPlayerName || playerName,
    });
  }, [user, session?.matchID, session?.playerID, session?.credentials, resolvedUserPlayerName, playerName]);

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
    setProfileDraft,
    setPasswordDraft,
    setUserError,
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

  const shellUiVariant = isAdminRoute ? adminUiVariant : gameUiVariant;

  return (
    <main className={`app app-${shellUiVariant}${shellUiVariant === 'v1' ? ' app-v1' : ' app-v2'}`} data-bug-report-capture-root="true">
      <AppHeader
        isAdminRoute={isAdminRoute}
        lang={lang}
        setLang={setLang}
        activeUserTab={activeUserTab}
        setActiveUserTab={setActiveUserTab}
        gameUiVariant={gameUiVariant}
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

      {!isAdminRoute && activeUserTab === 'games' && !session ? (
        <LobbySection
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

      <div style={{ display: (!isAdminRoute && activeUserTab === 'games' && Boolean(session) && Boolean(activeSessionMatch) && canStart) ? 'block' : 'none' }}>
        {session ? (
          <Suspense fallback={<p>{t.loading}</p>}>
            {gameUiVariant === 'v1' ? <NetworkClientV1
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
            /> : <NetworkClientV2
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
            />}
          </Suspense>
        ) : null}
      </div>

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
      ) : null}

      {!isAdminRoute && activeUserTab === 'profile' && !user && profileScreen === 'register' ? (
        <RegisterSection
          t={t}
          busy={userBusy}
          error={userError}
          registerDraft={registerDraft}
          setRegisterDraft={setRegisterDraft}
          onRegister={onRegister}
          onBackToLogin={onBackToLogin}
          uiVariant={gameUiVariant}
        />
      ) : null}

      {!isAdminRoute && activeUserTab === 'profile' && !user && profileScreen === 'reset' ? (
        <PasswordResetSection
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
      ) : null}

      {!isAdminRoute && activeUserTab === 'statistics' ? (
        <StatisticsSection
          t={t}
          lang={lang}
          user={user}
          stats={userStats}
          awards={userAwards}
          matchHistory={matchHistory}
          sessions={userSessions}
          uiVariant={gameUiVariant}
        />
      ) : null}

      {!isAdminRoute && activeUserTab === 'gallery' ? (
        <GallerySection
          t={t}
          lang={lang}
          galleryCategoryFilter={galleryCategoryFilter}
          setGalleryCategoryFilter={setGalleryCategoryFilter}
          galleryCards={galleryCards}
          galleryCategories={galleryCategories}
          effectLabel={effectLabel}
          uiVariant={gameUiVariant}
        />
      ) : null}

      {!isAdminRoute && activeUserTab === 'rules' ? (
        <RulesSection t={t} rules={rules} uiVariant={gameUiVariant} />
      ) : null}

      {isAdminRoute && adminAuthorized ? (
        <Suspense fallback={<p>{t.loading}</p>}>
          <AdminPage
          uiVariant={adminUiVariant}
          lang={lang}
          serverUrl={SERVER_URL}
          serverUrlDraft={serverUrlDraft}
          onServerUrlDraftChange={setServerUrlDraft}
          onSaveServerUrl={saveServerUrl}
          onResetServerUrl={resetServerUrl}
          storageMode={adminStorageMode}
          onStorageModeChange={setAdminStorageMode}
          dbConfigDraft={adminDbConfigDraft}
          onDbConfigDraftChange={setAdminDbConfigDraft}
          onSaveDbConfigDraft={saveDbConfigDraft}
          onTestDbConnection={testDbConnection}
          onExportDbSchema={exportDbSchema}
          onImportDbSchema={importDbSchema}
          onImportJsonConfigToDb={importJsonConfigToDb}
          onExportDbBackup={exportDbBackup}
          onRestoreDbBackup={restoreDbBackup}
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
          dbExportBackupStatus={dbExportBackupStatus}
          dbExportBackupError={dbExportBackupError}
          dbExportBackupRunning={dbExportBackupRunning}
          dbRestoreBackupStatus={dbRestoreBackupStatus}
          dbRestoreBackupError={dbRestoreBackupError}
          dbRestoreBackupRunning={dbRestoreBackupRunning}
          matches={matches.map((m) => ({
            id: m.matchID,
            createdAt: typeof m.createdAt === 'number'
              ? m.createdAt
              : typeof m.createdAt === 'string'
                ? (Date.parse(m.createdAt) || 0)
                : 0,
          }))}
          activeMatchId={adminMatchID}
          onActiveMatchIdChange={setAdminSelectedMatchID}
          snapshot={snapshot}
          deckStats={{
            deck: sharedDeckStats.deck,
            discard: 0,
            legendary: sharedDeckStats.legendary,
            rankTrack: sharedDeckStats.rankTrack,
          }}
          sharedDeckTemplate={sharedDeckTemplate}
          cardCatalog={cardCatalog}
          sharedRanks={sharedRanks}
          sharedConfigLoaded={sharedConfigLoaded}
          onCreateMatch={createRoom}
          onResetMatch={() => {
            if (!adminMatchID) return;
            void (async () => {
              try {
                const response = await adminFetch(`${ADMIN_MATCH_RESET_API}?matchID=${encodeURIComponent(adminMatchID)}`, { method: 'POST' });
                if (!response.ok) return;
                const payload = (await response.json()) as {
                  snapshot?: { G: unknown; ctx: unknown; updatedAt?: number };
                };
                if (payload.snapshot) {
                  setSnapshot({
                    G: payload.snapshot.G,
                    ctx: payload.snapshot.ctx,
                    updatedAt: payload.snapshot.updatedAt ?? Date.now(),
                  });
                }
                await refreshMatches();
              } catch {
                // ignore UI toast for now
              }
            })();
          }}
          onDeleteMatch={() => {
            if (!adminMatchID || deletingAdminMatch) return;
            void (async () => {
              setDeletingAdminMatch(true);
              try {
                const response = await adminFetch(`${ADMIN_MATCH_DELETE_API}?matchID=${encodeURIComponent(adminMatchID)}`, { method: 'POST' });
                if (!response.ok) return;
                setSnapshot(null);
                setAdminSelectedMatchID('');
                await refreshMatches();
              } catch {
                // ignore UI toast for now
              } finally {
                setDeletingAdminMatch(false);
              }
            })();
          }}
          deletingMatch={deletingAdminMatch}
          onResetAll={() => {
            window.localStorage.removeItem(SESSION_STORAGE_KEY);
            window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
            setSession(null);
            setPlayerName('');
            setError('');
            void refreshMatches();
          }}
          onRestartServer={async () => {
            try {
              const response = await adminFetch(ADMIN_RESTART_API, { method: 'POST' });
              return response.ok;
            } catch {
              return false;
            }
          }}
          onShuffleDeck={() => {
            void applyTemplateChange(() => {
              shuffleSharedDeckTemplate();
            });
          }}
          onAddCard={(target: DeckTarget, cardId: string) => {
            const previousJson = exportSharedDeckTemplateJson();
            const added = addCardToSharedDeckTemplate(target, cardId);
            if (added) void refreshSharedDeckTemplate().then((ok) => {
              if (!ok) rollbackTemplate(previousJson);
            });
            return added;
          }}
          onAddCustomCard={(target: DeckTarget, card: CardDefinition) => {
            void applyTemplateChange(() => {
              addCustomCardToSharedDeckTemplate(target, card);
            });
          }}
          onUpdateCard={(target: DeckTarget, index: number, card: CardDefinition) => {
            void applyTemplateChange(() => {
              updateCardAtInSharedDeckTemplate(target, index, card);
            });
          }}
          onRemoveCard={(target: DeckTarget, index: number) => {
            void applyTemplateChange(() => {
              removeCardAtFromSharedDeckTemplate(target, index);
            });
          }}
          onResetTemplate={() => {
            void applyTemplateChange(() => {
              resetSharedDeckTemplate();
            });
          }}
          onSetDeckBackImage={(path?: string) => {
            void applyTemplateChange(() => {
              setSharedDeckBackImage(path);
            });
          }}
          onExportTemplate={() => exportSharedDeckTemplateJson()}
          onImportTemplate={(json: string) => {
            const previousJson = exportSharedDeckTemplateJson();
            const result = importSharedDeckTemplateJson(json);
            if (!result.ok) return result.error;
            void refreshSharedDeckTemplate().then((ok) => {
              if (!ok) rollbackTemplate(previousJson);
            });
            return null;
          }}
          onUpdateRanks={(nextRanks: RankDefinition[]) => {
            const previousRanks = sharedRanks.map((rank) => ({ ...rank }));
            const ok = setSharedRanks(nextRanks);
            if (!ok) return false;
            const normalized = getSharedRanks();
            setSharedRanksState(normalized);
            window.localStorage.setItem(RANKS_STORAGE_KEY, exportSharedRanksJson());
            void syncRanksToServer(normalized).then((saved) => {
              if (!saved) rollbackRanks(previousRanks);
            });
            return true;
          }}
          onResetRanks={() => {
            const previousRanks = sharedRanks.map((rank) => ({ ...rank }));
            resetSharedRanks();
            const normalized = getSharedRanks();
            setSharedRanksState(normalized);
            window.localStorage.setItem(RANKS_STORAGE_KEY, exportSharedRanksJson());
            void adminFetch(`${RANKS_API}/reset`, { method: 'POST' }).then((response) => {
              if (!response.ok) rollbackRanks(previousRanks);
            }).catch(() => {
              rollbackRanks(previousRanks);
            });
          }}
          onStopGame={async (matchID: string) => {
            try {
              const response = await adminFetch(`${ADMIN_MATCH_STOP_API}?matchID=${encodeURIComponent(matchID)}`, { method: 'POST' });
              if (!response.ok) {
                let error = 'Failed to stop game';
                try {
                  const payload = (await response.json()) as { error?: string };
                  if (typeof payload.error === 'string' && payload.error.trim()) error = payload.error;
                } catch {
                  // ignore json parse failure
                }
                return { ok: false, error };
              }
              const payload = (await response.json()) as {
                snapshot?: { G: unknown; ctx: unknown; updatedAt?: number };
              };
              if (payload.snapshot) {
                setSnapshot({
                  G: payload.snapshot.G,
                  ctx: payload.snapshot.ctx,
                  updatedAt: payload.snapshot.updatedAt ?? Date.now(),
                });
              }
              return { ok: true };
            } catch {
              return { ok: false, error: 'Failed to stop game' };
            }
          }}
          onRunSimulations={(players: number, simulations: number, options) =>
            runGameSimulations(players, simulations, 0, options)
          }
          />
        </Suspense>
      ) : null}

      {!isAdminRoute ? (
        <AuthErrorModal
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
      ) : null}
      {!isAdminRoute ? (
        <BugReportWidget
          lang={lang}
          serverUrl={SERVER_URL}
          session={session}
          user={user}
          playerName={playerName}
          gameUiVariant={gameUiVariant}
        />
      ) : null}
      <AppFooter buildLabel={buildLabel} />
    </main>
  );
};
