import { useEffect, useMemo, useState } from 'react';
import { LobbyClient } from 'boardgame.io/client';
import type { RankDefinition } from '../../game/types';
import {
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  getCardCatalog,
  getSharedRanks,
  getSharedDeckTemplate,
  getSharedDeckTemplateStats,
  importSharedRanksJson,
  importSharedDeckTemplateJson,
  setSharedRanks,
} from '../../game/jojGame';
import {
  DEFAULT_LOBBY_GAME_UI_CONFIG,
  clampBotCountToAllowed,
  clampRoomCapacityToAllowed,
  getAvailableBotCounts,
  normalizeLobbyGameUiConfig,
} from '../../game/lobbyConfig';
import { text } from '../i18n';
import { formatModuleDisplayName } from '../moduleDisplay';
import { SERVER_URL } from './clientConfig';
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
} from './model';
import { useAdminAuth } from './useAdminAuth';
import { useAdminSnapshot } from './useAdminSnapshot';
import { buildRoomShareLink } from './share';
import { useAppShellState } from './useAppShellState';
import { useDbAdminTools } from '../admin/useDbAdminTools';
import { useLobbySession } from './useLobbySession';
import { useSharedConfigSync } from './useSharedConfigSync';
import { useUserAccount } from './useUserAccount';

const lobbyClient = new LobbyClient({ server: SERVER_URL });
const TEMPLATE_API = `${SERVER_URL}/api/shared-deck-template`;
const RANKS_API = `${SERVER_URL}/api/shared-ranks`;
const ADMIN_MATCH_STATE_API = `${SERVER_URL}/api/admin/match-state`;

export const useAppState = () => {
  const buildLabel = __APP_BUILD_LABEL__;
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  const {
    lang, setLang, playerName, setPlayerName, roomCapacity, setRoomCapacity,
    gameMode, setGameMode, createWithBots, setCreateWithBots, botCount, setBotCount,
    botDifficulty, setBotDifficulty, botProfile, setBotProfile, selectedOptionalModuleIds,
    setSelectedOptionalModuleIds, adminSelectedMatchID, setAdminSelectedMatchID,
    activeUserTab, setActiveUserTab, profileScreen, setProfileScreen, authErrorModal,
    setAuthErrorModal, gameUiVariant, setGameUiVariant, adminUiVariant, setAdminUiVariant,
    galleryCategoryFilter, setGalleryCategoryFilter, deletingAdminMatch, setDeletingAdminMatch,
    loginDraft, setLoginDraft, registerDraft, setRegisterDraft, profileDraft, setProfileDraft,
    profileNotice, setProfileNotice, passwordDraft, setPasswordDraft, resetRequestDraft,
    setResetRequestDraft, resetPasswordDraft, setResetPasswordDraft, serverUrlDraft, setServerUrlDraft,
  } = useAppShellState(SERVER_URL);

  const t = text(lang);
  const [lobbyGameUiConfig, setLobbyGameUiConfig] = useState(DEFAULT_LOBBY_GAME_UI_CONFIG);

  const {
    user, stats: userStats, awards: userAwards, matchHistory, sessions: userSessions,
    loading: userLoading, busy: userBusy, error: userError, setError: setUserError,
    register: registerUser, login: loginUser, logout: logoutUser, updateProfile: updateUserProfile,
    uploadAvatar, changePassword, requestPasswordReset, resetPassword, refreshSessions,
    logoutAllSessions, logoutSession, bindMatchSession,
  } = useUserAccount({ serverUrl: SERVER_URL, lang });

  const {
    adminAuthChecking, adminAuthorized, adminAuthEnabled, adminAuthError, adminFetch, verifyAdminToken,
  } = useAdminAuth({
    isAdminRoute, serverUrl: SERVER_URL, defaultServerUrl: DEFAULT_SERVER_URL,
    serverUrlStorageKey: SERVER_URL_STORAGE_KEY, unauthorizedText: t.adminUnauthorized,
    serverUnavailableText: t.serverUnavailable,
  });

  const {
    adminStorageMode, setAdminStorageMode, adminDbConfigDraft, setAdminDbConfigDraft,
    dbConfigSaveStatus, dbConnectionTestStatus, dbConnectionTestError, dbConnectionTestRunning,
    dbExportSchemaStatus, dbExportSchemaError, dbExportSchemaRunning,
    dbImportSchemaStatus, dbImportSchemaError, dbImportSchemaRunning,
    dbImportJsonConfigStatus, dbImportJsonConfigError, dbImportJsonConfigRunning,
    dbExportBackupStatus, dbExportBackupError, dbExportBackupRunning,
    dbRestoreBackupStatus, dbRestoreBackupError, dbRestoreBackupRunning,
    saveDbConfigDraft, testDbConnection, exportDbSchema, importDbSchema,
    importJsonConfigToDb, exportDbBackup, restoreDbBackup, ADMIN_STORAGE_MODE_STORAGE_KEY,
    LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY,
  } = useDbAdminTools({ lang, adminFetch, serverUrl: SERVER_URL, enabled: isAdminRoute && adminAuthorized });

  const {
    sharedDeckTemplate, cardCatalog, sharedRanks, setSharedRanksState,
    sharedConfigLoaded, refreshSharedDeckTemplate, syncRanksToServer,
  } = useSharedConfigSync({
    adminFetch, templateApi: TEMPLATE_API, ranksApi: RANKS_API,
    sharedTemplateStorageKey: SHARED_TEMPLATE_STORAGE_KEY, ranksStorageKey: RANKS_STORAGE_KEY,
    getSharedDeckTemplate, getCardCatalog, getSharedRanks, exportSharedDeckTemplateJson,
    exportSharedRanksJson, importSharedDeckTemplateJson, importSharedRanksJson, setSharedRanks,
  });

  const {
    matches, session, setSession, loading, error, setError, refreshMatches,
    createRoom, joinRoom, spectateRoom, leaveRoom, roomPlayerNames, canStart,
  } = useLobbySession({
    lobbyClient, gameName: GAME_NAME, playerName,
    fallbackPlayerName: user?.displayName?.trim() || user?.username?.trim() || '',
    roomCapacity, allowedRoomCapacities: lobbyGameUiConfig.allowedRoomCapacities,
    gameMode, selectedOptionalModuleIds, createWithBots, botCount,
    allowedBotCounts: lobbyGameUiConfig.allowedBotCounts, botDifficulty, botProfile,
    sessionStorageKey: SESSION_STORAGE_KEY,
    initialSession: parseSession(window.localStorage.getItem(SESSION_STORAGE_KEY)),
    serverUnavailableText: t.serverUnavailable, enterNameText: t.enterName,
    roomFullText: t.roomFull, createFailedText: t.createFailed, joinFailedText: t.joinFailed,
    onSessionEstablished: (nextSession, nextPlayerName) => {
      if (!nextSession.playerID || !nextSession.credentials) return;
      void bindMatchSession({
        matchID: nextSession.matchID, playerID: nextSession.playerID,
        credentials: nextSession.credentials, playerName: nextPlayerName,
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

  const optionalLobbyModules = useMemo(() => (sharedDeckTemplate.modules ?? [])
    .filter((module) => module.moduleType === 'SYSTEM_MODULE' && module.target === 'deck')
    .map((module) => ({ id: module.id, name: formatModuleDisplayName(module.name, module.id), alwaysOn: module.category === 'VVNZ' })),
  [sharedDeckTemplate.modules]);

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
        if (!cancelled) {
          const normalizedConfig = normalizeLobbyGameUiConfig(payload);
          setLobbyGameUiConfig(normalizedConfig);
          setRoomCapacity((currentRoomCapacity) => {
            if (!normalizedConfig.allowedRoomCapacities.includes(currentRoomCapacity as typeof normalizedConfig.allowedRoomCapacities[number])) {
              return normalizedConfig.defaultRoomCapacity;
            }
            return currentRoomCapacity === DEFAULT_LOBBY_GAME_UI_CONFIG.defaultRoomCapacity
              ? normalizedConfig.defaultRoomCapacity
              : currentRoomCapacity;
          });
        }
      } catch { /* keep defaults */ }
    })();
    return () => { cancelled = true; };
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
    const nextBotCount = clampBotCountToAllowed(botCount || lobbyGameUiConfig.defaultBotCount, lobbyGameUiConfig.allowedBotCounts, roomCapacity);
    if (createWithBots && nextBotCount > 0 && botCount !== nextBotCount) {
      setBotCount(nextBotCount);
      return;
    }
    if (!createWithBots && availableBotCounts.length > 0 && botCount !== lobbyGameUiConfig.defaultBotCount) {
      const fallbackBotCount = clampBotCountToAllowed(lobbyGameUiConfig.defaultBotCount, lobbyGameUiConfig.allowedBotCounts, roomCapacity);
      if (fallbackBotCount > 0 && botCount !== fallbackBotCount) setBotCount(fallbackBotCount);
    }
  }, [lobbyGameUiConfig, roomCapacity, createWithBots, botCount]);

  const galleryCards = useMemo(() => {
    const rankTrackIds = new Set(sharedDeckTemplate.rankTrack.map((card) => card.id));
    if (galleryCategoryFilter === 'RANK') {
      return [...sharedDeckTemplate.rankTrack].sort((a, b) => a.title.localeCompare(b.title));
    }
    return [...cardCatalog]
      .filter((card) => galleryCategoryFilter === 'ALL' ? !rankTrackIds.has(card.id) : card.category === galleryCategoryFilter && !rankTrackIds.has(card.id))
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [cardCatalog, galleryCategoryFilter, sharedDeckTemplate.rankTrack]);

  const cardImageById = useMemo<Record<string, string>>(() =>
    cardCatalog.reduce<Record<string, string>>((acc, card) => {
      if (typeof card.image === 'string' && card.image.trim()) acc[card.id] = card.image;
      return acc;
    }, {}),
  [cardCatalog]);

  const activeSessionMatch = session ? matches.find((match) => match.matchID === session.matchID) ?? null : null;
  const activeSessionShareLink = session ? buildRoomShareLink(session.matchID) : '';
  const activeSessionGameModeLabel = activeSessionMatch?.setupData?.gameMode === 'standard_plus'
    ? t.gameModeStandardPlus : activeSessionMatch?.setupData?.gameMode === 'simplified'
      ? t.gameModeSimplified : t.gameModeStandard;
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
    isAdminRoute, adminAuthorized, adminMatchID, adminFetch, adminMatchStateApi: ADMIN_MATCH_STATE_API,
  });

  useEffect(() => {
    if (!user) return;
    setProfileScreen('login');
    setAuthErrorModal('');
    setProfileDraft({
      displayName: user.displayName ?? '', email: user.email ?? '',
      bio: user.bio ?? '', avatarUrl: user.avatarUrl ?? '',
      profilePublic: user.profilePublic !== false, showStatsPublic: user.showStatsPublic !== false,
      showRecentMatchesPublic: user.showRecentMatchesPublic === true,
    });
  }, [user]);

  useEffect(() => {
    if (user || profileScreen !== 'login' || activeUserTab !== 'profile') {
      setProfileNotice('');
      return;
    }
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) return;
    setProfileNotice('Введіть новий пароль');
    setResetPasswordDraft((prev) => ({ ...prev, token: code }));
    setProfileScreen('reset');
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    window.history.replaceState({}, '', url.toString());
  }, [user, profileScreen, activeUserTab, lang]);

  return {
    buildLabel, isAdminRoute, lang, setLang, playerName, setPlayerName, roomCapacity, setRoomCapacity,
    gameMode, setGameMode, createWithBots, setCreateWithBots, botCount, setBotCount,
    botDifficulty, setBotDifficulty, botProfile, setBotProfile, selectedOptionalModuleIds,
    setSelectedOptionalModuleIds, adminSelectedMatchID, setAdminSelectedMatchID,
    activeUserTab, setActiveUserTab, profileScreen, setProfileScreen, authErrorModal,
    setAuthErrorModal, gameUiVariant, setGameUiVariant, adminUiVariant, setAdminUiVariant,
    galleryCategoryFilter, setGalleryCategoryFilter, deletingAdminMatch, setDeletingAdminMatch,
    loginDraft, setLoginDraft, registerDraft, setRegisterDraft, profileDraft, setProfileDraft,
    profileNotice, setProfileNotice, passwordDraft, setPasswordDraft, resetRequestDraft,
    setResetRequestDraft, resetPasswordDraft, setResetPasswordDraft, serverUrlDraft, setServerUrlDraft,
    t, lobbyGameUiConfig, setLobbyGameUiConfig, user, userStats, userAwards, matchHistory, userSessions,
    userLoading, userBusy, userError, setUserError, registerUser, loginUser, logoutUser,
    updateUserProfile, uploadAvatar, changePassword, requestPasswordReset, resetPassword,
    refreshSessions, logoutAllSessions, logoutSession, bindMatchSession, adminAuthChecking,
    adminAuthorized, adminAuthEnabled, adminAuthError, adminFetch, verifyAdminToken,
    adminStorageMode, setAdminStorageMode, adminDbConfigDraft, setAdminDbConfigDraft,
    dbConfigSaveStatus, dbConnectionTestStatus, dbConnectionTestError, dbConnectionTestRunning,
    dbExportSchemaStatus, dbExportSchemaError, dbExportSchemaRunning,
    dbImportSchemaStatus, dbImportSchemaError, dbImportSchemaRunning,
    dbImportJsonConfigStatus, dbImportJsonConfigError, dbImportJsonConfigRunning,
    dbExportBackupStatus, dbExportBackupError, dbExportBackupRunning,
    dbRestoreBackupStatus, dbRestoreBackupError, dbRestoreBackupRunning,
    saveDbConfigDraft, testDbConnection, exportDbSchema, importDbSchema,
    importJsonConfigToDb, exportDbBackup, restoreDbBackup, sharedDeckTemplate, cardCatalog,
    sharedRanks, setSharedRanksState, sharedConfigLoaded, refreshSharedDeckTemplate,
    syncRanksToServer, matches, session, setSession, loading, error, setError,
    refreshMatches, createRoom, joinRoom, spectateRoom, leaveRoom, roomPlayerNames, canStart,
    sharedDeckStats, rollbackTemplate, applyTemplateChange, rollbackRanks, optionalLobbyModules,
    galleryCards, cardImageById, activeSessionMatch, activeSessionShareLink,
    activeSessionGameModeLabel, activeSessionInviteText, effectLabel, rules,
    saveServerUrl, resetServerUrl, adminMatchID, snapshot, setSnapshot,
    SERVER_URL, TEMPLATE_API, RANKS_API, ADMIN_STORAGE_MODE_STORAGE_KEY,
    LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY, lobbyClient, GAME_NAME, SESSION_STORAGE_KEY,
    PLAYER_NAME_STORAGE_KEY, RANKS_STORAGE_KEY, SHARED_TEMPLATE_STORAGE_KEY,
    DEFAULT_SERVER_URL, galleryCategories,
  };
};
