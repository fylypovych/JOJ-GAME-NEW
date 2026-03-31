import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { LobbyClient } from 'boardgame.io/client';
import type { CardDefinition, RankDefinition } from '../game/types';
import {
  addCustomCardToSharedDeckTemplate,
  addCardToSharedDeckTemplate,
  type DeckTarget,
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  getCardCatalog,
  getSharedRanks,
  getSharedDeckTemplate,
  getSharedDeckTemplateStats,
  importSharedRanksJson,
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
import { useDbAdminTools } from './admin/useDbAdminTools';
import { text } from './i18n';
import { formatModuleDisplayName } from './moduleDisplay';
import {
  DEFAULT_LOBBY_GAME_UI_CONFIG,
  clampBotCountToAllowed,
  clampRoomCapacityToAllowed,
  getAvailableBotCounts,
  normalizeLobbyGameUiConfig,
} from '../game/lobbyConfig';
import { SERVER_URL } from './app/clientConfig';
import {
  DEFAULT_SERVER_URL,
  GAME_NAME,
  PLAYER_NAME_STORAGE_KEY,
  RANKS_STORAGE_KEY,
  SERVER_URL_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SHARED_TEMPLATE_STORAGE_KEY,
  galleryCategories,
  normalizeServerUrl,
  parseSession,
} from './app/model';
import {
  ActiveSessionSection,
  AuthErrorModal,
  GallerySection,
  LobbySection,
  PasswordResetSection,
  ProfileSection,
  RegisterSection,
  RulesSection,
  StatisticsSection,
  UserTabs,
} from './app/sections';
import { useAdminAuth } from './app/useAdminAuth';
import { useAdminSnapshot } from './app/useAdminSnapshot';
import { BugReportWidget } from './app/BugReportWidget';
import { useAppShellState } from './app/useAppShellState';
import { useLobbySession } from './app/useLobbySession';
import { useSharedConfigSync } from './app/useSharedConfigSync';
import { useUserAccount } from './app/useUserAccount';

const lobbyClient = new LobbyClient({ server: SERVER_URL });
const AdminPage = lazy(async () => import('./AdminPage').then((module) => ({ default: module.AdminPage })));
const NetworkClientV2 = lazy(async () => import('./app/networkClients').then((module) => ({ default: module.NetworkClientV2 })));
const NetworkClientV3 = lazy(async () => import('./app/networkClients').then((module) => ({ default: module.NetworkClientV3 })));
const NetworkClientV4 = lazy(async () => import('./app/networkClients').then((module) => ({ default: module.NetworkClientV4 })));

const TEMPLATE_API = `${SERVER_URL}/api/shared-deck-template`;
const RANKS_API = `${SERVER_URL}/api/shared-ranks`;
const ADMIN_RESTART_API = `${SERVER_URL}/api/admin/restart`;
const ADMIN_MATCH_STATE_API = `${SERVER_URL}/api/admin/match-state`;
const ADMIN_MATCH_STOP_API = `${SERVER_URL}/api/admin/match-stop`;
const ADMIN_MATCH_RESET_API = `${SERVER_URL}/api/admin/match-reset`;
const ADMIN_MATCH_DELETE_API = `${SERVER_URL}/api/admin/match-delete`;

export const App = () => {
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
    setAdminUiVariant,
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
  const [lobbyGameUiConfig, setLobbyGameUiConfig] = useState(DEFAULT_LOBBY_GAME_UI_CONFIG);
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
    changePassword,
    requestPasswordReset,
    resetPassword,
    refreshSessions,
    logoutAllSessions,
    logoutSession,
    bindMatchSession,
  } = useUserAccount({ serverUrl: SERVER_URL, lang });
  const {
    adminAuthChecking,
    adminAuthorized,
    adminAuthEnabled,
    adminAuthError,
    adminFetch,
    verifyAdminToken,
  } = useAdminAuth({
    isAdminRoute,
    serverUrl: SERVER_URL,
    defaultServerUrl: DEFAULT_SERVER_URL,
    serverUrlStorageKey: SERVER_URL_STORAGE_KEY,
    unauthorizedText: t.adminUnauthorized,
    serverUnavailableText: t.serverUnavailable,
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
  } = useDbAdminTools({
    lang,
    adminFetch,
    serverUrl: SERVER_URL,
    enabled: isAdminRoute && adminAuthorized,
  });
  const {
    sharedDeckTemplate,
    cardCatalog,
    sharedRanks,
    setSharedRanksState,
    sharedConfigLoaded,
    refreshSharedDeckTemplate,
    syncRanksToServer,
  } = useSharedConfigSync({
    adminFetch,
    templateApi: TEMPLATE_API,
    ranksApi: RANKS_API,
    sharedTemplateStorageKey: SHARED_TEMPLATE_STORAGE_KEY,
    ranksStorageKey: RANKS_STORAGE_KEY,
    getSharedDeckTemplate,
    getCardCatalog,
    getSharedRanks,
    exportSharedDeckTemplateJson,
    exportSharedRanksJson,
    importSharedDeckTemplateJson,
    importSharedRanksJson,
    setSharedRanks,
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
    sessionBroken,
    roomPlayerNames,
    canStart,
  } = useLobbySession({
    lobbyClient,
    gameName: GAME_NAME,
    playerName,
    fallbackPlayerName: user?.displayName?.trim() || user?.username?.trim() || '',
    roomCapacity,
    allowedRoomCapacities: lobbyGameUiConfig.allowedRoomCapacities,
    gameMode,
    selectedOptionalModuleIds,
    createWithBots,
    botCount,
    allowedBotCounts: lobbyGameUiConfig.allowedBotCounts,
    botDifficulty,
    botProfile,
    sessionStorageKey: SESSION_STORAGE_KEY,
    initialSession: parseSession(window.localStorage.getItem(SESSION_STORAGE_KEY)),
    serverUnavailableText: t.serverUnavailable,
    enterNameText: t.enterName,
    roomFullText: t.roomFull,
    createFailedText: t.createFailed,
    joinFailedText: t.joinFailed,
    onSessionEstablished: (nextSession, nextPlayerName) => {
      if (!nextSession.playerID || !nextSession.credentials) return;
      void bindMatchSession({
        matchID: nextSession.matchID,
        playerID: nextSession.playerID,
        credentials: nextSession.credentials,
        playerName: nextPlayerName,
      });
    },
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
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${SERVER_URL}/api/game/ui-config`, { credentials: 'include' });
        const payload = await response.json() as { ok?: boolean };
        if (!response.ok || payload.ok !== true) return;
        if (!cancelled) setLobbyGameUiConfig(normalizeLobbyGameUiConfig(payload));
      } catch {
        // keep defaults when public config is unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
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
  const galleryCards = useMemo(() => (
    [...cardCatalog]
      .filter((card) => galleryCategoryFilter === 'ALL' || card.category === galleryCategoryFilter)
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
  ), [cardCatalog, galleryCategoryFilter]);
  const cardImageById = useMemo<Record<string, string>>(
    () =>
      cardCatalog.reduce<Record<string, string>>((acc, card) => {
        if (typeof card.image === 'string' && card.image.trim()) acc[card.id] = card.image;
        return acc;
      }, {}),
    [cardCatalog],
  );
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
  }, [adminStorageMode]);

  const shellUiVariant = isAdminRoute ? adminUiVariant : gameUiVariant;

  return (
    <main className={`app app-${shellUiVariant}`} data-bug-report-capture-root="true">
      <h1>{isAdminRoute ? t.adminTitle : t.gameTitle}</h1>
      {!isAdminRoute ? (
        <section className={`app-top-toolbar${shellUiVariant === 'v2' ? ' app-top-toolbar-v2' : ''}${shellUiVariant === 'v3' ? ' app-top-toolbar-v3' : ''}`}>
          <div className="app-top-toolbar-left">
            <UserTabs t={t} activeUserTab={activeUserTab} setActiveUserTab={setActiveUserTab} uiVariant={gameUiVariant} />
          </div>
          <div className="app-top-toolbar-right">
            <p className="app-top-row">
              {t.language}:{' '}
              <button type="button" onClick={() => setLang('uk')} disabled={lang === 'uk'}>
                {t.langUk}
              </button>{' '}
              <button type="button" onClick={() => setLang('en')} disabled={lang === 'en'}>
                {t.langEn}
              </button>
              {' | '}
              {t.gameUiLabel}:{' '}
              <button type="button" onClick={() => setGameUiVariant('v2')} disabled={gameUiVariant === 'v2'}>
                {t.gameUiV2}
              </button>{' '}
              <button type="button" onClick={() => setGameUiVariant('v3')} disabled={gameUiVariant === 'v3'}>
                {t.gameUiV3}
              </button>
              {' '}
              <button type="button" onClick={() => setGameUiVariant('v4')} disabled={gameUiVariant === 'v4'}>
                {('gameUiV4' in t ? (t as typeof t & { gameUiV4: string }).gameUiV4 : 'v4')}
              </button>
              {' | '}
              <a className="app-toolbar-link-button" href="/admin">{t.openAdmin}</a>
            </p>
          </div>
        </section>
      ) : (
        <p className="app-top-row">
          {t.language}:{' '}
          <button type="button" onClick={() => setLang('uk')} disabled={lang === 'uk'}>
            {t.langUk}
          </button>{' '}
          <button type="button" onClick={() => setLang('en')} disabled={lang === 'en'}>
            {t.langEn}
          </button>
          {' | '}
          {t.gameUiLabel}:{' '}
          <button type="button" onClick={() => setAdminUiVariant('v2')} disabled={adminUiVariant === 'v2'}>
            {t.gameUiV2}
          </button>{' '}
              <button type="button" onClick={() => setAdminUiVariant('v3')} disabled={adminUiVariant === 'v3'}>
                {t.gameUiV3}
              </button>
              {' '}
              <button type="button" onClick={() => setAdminUiVariant('v4')} disabled={adminUiVariant === 'v4'}>
                {('gameUiV4' in t ? (t as typeof t & { gameUiV4: string }).gameUiV4 : 'v4')}
              </button>
        </p>
      )}
      <p className="app-link-row">
        {isAdminRoute ? <a href="/">{t.openGame}</a> : null}
      </p>

      {isAdminRoute && (!adminAuthorized || adminAuthChecking) ? (
        <section className={`board${adminUiVariant === 'v2' ? ' board-v2-panel' : ''}${adminUiVariant === 'v3' ? ' board-v3-panel' : ''}${adminUiVariant === 'v4' ? ' admin-panel-v4' : ''}`}>
          <h2>{t.adminTitle}</h2>
          <p>{adminAuthChecking ? t.loading : (adminAuthError || (adminAuthEnabled === false ? t.adminAuthDisabledHint : t.adminUnauthorized))}</p>
          {!adminAuthChecking ? (
            <p className="admin-controls">
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

      {!isAdminRoute && activeUserTab === 'games' && session ? (
        <ActiveSessionSection
          t={t}
          session={session}
          playerName={playerName}
          sessionBroken={sessionBroken}
          canStart={canStart}
          activeMatch={matches.find((match) => match.matchID === session.matchID) ?? null}
          roomPlayerNames={roomPlayerNames}
          roomDraft={{
            roomCapacity,
            gameMode,
            createWithBots,
            botCount,
            botDifficulty,
            selectedOptionalModuleIds,
          }}
          optionalModules={optionalLobbyModules}
          applyCurrentRoomToDraft={() => {
            const currentMatch = matches.find((match) => match.matchID === session.matchID);
            if (!currentMatch) return;
            const currentBots = Math.max(0, Math.floor(currentMatch.setupData?.bots?.count ?? 0));
            setRoomCapacity(currentMatch.players.length);
            setGameMode(currentMatch.setupData?.gameMode ?? 'standard');
            setCreateWithBots(currentBots > 0);
            setBotCount(currentBots);
            setBotDifficulty(currentMatch.setupData?.bots?.difficulty ?? 'normal');
            setSelectedOptionalModuleIds(currentMatch.setupData?.gameSetup?.optionalMainDeckModuleIds ?? []);
          }}
          leaveRoom={() => { void leaveRoom(); }}
          refreshMatches={() => { void refreshMatches(); }}
          loading={loading}
          uiVariant={gameUiVariant}
        />
      ) : null}

      <div style={{ display: !isAdminRoute && activeUserTab === 'games' && session && canStart ? 'block' : 'none' }}>
        {session ? (
          <Suspense fallback={<p>{t.loading}</p>}>
            {gameUiVariant === 'v4' ? <NetworkClientV4
              key={`${session.matchID}:${session.playerID ?? 'spectator'}:v4`}
              matchID={session.matchID}
              playerID={session.spectator ? (null as never) : session.playerID}
              credentials={session.credentials}
              lang={lang}
              playerName={session.spectator ? t.spectatorJoinedLabel : playerName}
              knownPlayerNames={roomPlayerNames}
              sharedRanks={sharedRanks}
              cardImageById={cardImageById}
              roomMeta={{ matchID: session.matchID, playerID: session.playerID }}
              onLeaveRoom={() => { void leaveRoom(); }}
            /> : gameUiVariant === 'v3' ? <NetworkClientV3
              key={`${session.matchID}:${session.playerID ?? 'spectator'}:v3`}
              matchID={session.matchID}
              playerID={session.spectator ? (null as never) : session.playerID}
              credentials={session.credentials}
              lang={lang}
              playerName={session.spectator ? t.spectatorJoinedLabel : playerName}
              knownPlayerNames={roomPlayerNames}
              sharedRanks={sharedRanks}
              cardImageById={cardImageById}
              roomMeta={{ matchID: session.matchID, playerID: session.playerID }}
              onLeaveRoom={() => { void leaveRoom(); }}
            /> : gameUiVariant === 'v2' ? <NetworkClientV2
              key={`${session.matchID}:${session.playerID ?? 'spectator'}:v2`}
              matchID={session.matchID}
              playerID={session.spectator ? (null as never) : session.playerID}
              credentials={session.credentials}
              lang={lang}
              playerName={session.spectator ? t.spectatorJoinedLabel : playerName}
              knownPlayerNames={roomPlayerNames}
              sharedRanks={sharedRanks}
              cardImageById={cardImageById}
              roomMeta={{ matchID: session.matchID, playerID: session.playerID }}
              onLeaveRoom={() => { void leaveRoom(); }}
            /> : <NetworkClientV3
              key={`${session.matchID}:${session.playerID ?? 'spectator'}:v3-fallback`}
              matchID={session.matchID}
              playerID={session.spectator ? (null as never) : session.playerID}
              credentials={session.credentials}
              lang={lang}
              playerName={session.spectator ? t.spectatorJoinedLabel : playerName}
              knownPlayerNames={roomPlayerNames}
              sharedRanks={sharedRanks}
              cardImageById={cardImageById}
              roomMeta={{ matchID: session.matchID, playerID: session.playerID }}
              onLeaveRoom={() => { void leaveRoom(); }}
            />}
          </Suspense>
        ) : null}
      </div>

      {!isAdminRoute && activeUserTab === 'profile' && (user || profileScreen === 'login') ? (
        <ProfileSection
          t={t}
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
                setPlayerName((prev) => prev.trim() ? prev : loginDraft.login.trim());
                setAuthErrorModal('');
                setProfileNotice(t.userLoginSuccess);
              })
              .catch((error) => {
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
              .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
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
              .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
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
              .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
          }}
          stats={userStats}
          awards={userAwards}
          matchHistory={matchHistory}
          sessions={userSessions}
          onRefreshSessions={() => { void refreshSessions().catch((error) => setUserError(String(error instanceof Error ? error.message : error))); }}
          onLogoutAllSessions={() => { void logoutAllSessions().catch((error) => setUserError(String(error instanceof Error ? error.message : error))); }}
          onLogoutSession={(sessionId) => { void logoutSession(sessionId).catch((error) => setUserError(String(error instanceof Error ? error.message : error))); }}
          onOpenRegister={() => setProfileScreen('register')}
        />
      ) : null}

      {!isAdminRoute && activeUserTab === 'profile' && !user && profileScreen === 'register' ? (
        <RegisterSection
          t={t}
          busy={userBusy}
          error={userError}
          registerDraft={registerDraft}
          setRegisterDraft={setRegisterDraft}
          onRegister={() => {
            void registerUser(registerDraft)
              .then(() => setProfileScreen('login'))
              .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
          }}
          onBackToLogin={() => setProfileScreen('login')}
        />
      ) : null}

      {!isAdminRoute && activeUserTab === 'profile' && !user && profileScreen === 'reset' ? (
        <PasswordResetSection
          t={t}
          busy={userBusy}
          error={userError}
          resetRequestDraft={resetRequestDraft}
          setResetRequestDraft={setResetRequestDraft}
          onRequestPasswordReset={() => {
            void requestPasswordReset(resetRequestDraft.login)
              .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
          }}
          resetPasswordDraft={resetPasswordDraft}
          setResetPasswordDraft={setResetPasswordDraft}
          onResetPassword={() => {
            void resetPassword(resetPasswordDraft)
              .then(() => setResetPasswordDraft({ token: '', nextPassword: '' }))
              .catch((error) => setUserError(String(error instanceof Error ? error.message : error)));
          }}
          onBackToLogin={() => setProfileScreen('login')}
        />
      ) : null}

      {!isAdminRoute && activeUserTab === 'statistics' ? (
        <StatisticsSection
          t={t}
          user={user}
          stats={userStats}
          awards={userAwards}
          matchHistory={matchHistory}
          sessions={userSessions}
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
      <footer className="app-footer">
        &copy; ALL RIGHTS RESERVED BY "SOHODNY LLC, <a href="mailto:zhurnal.zhurnaliv@gmail.com">zhurnal.zhurnaliv@gmail.com</a>"
      </footer>
    </main>
  );
};
