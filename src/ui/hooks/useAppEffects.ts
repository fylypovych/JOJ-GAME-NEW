import { useEffect } from 'react';
import {
  clampBotCountToAllowed,
  clampRoomCapacityToAllowed,
  getAvailableBotCounts,
} from '../../game/lobbyConfig';

/**
 * Custom hook для управління побічними ефектами в App компоненті.
 * Об'єднує кілька useEffect hooks для кращої організації коду.
 */
interface UseAppEffectsProps {
  optionalLobbyModules: Array<{ alwaysOn?: boolean; id: string }>;
  setSelectedOptionalModuleIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  roomCapacity: number;
  lobbyGameUiConfig: { allowedRoomCapacities: number[]; allowedBotCounts: number[]; defaultBotCount: number };
  setRoomCapacity: (capacity: number) => void;
  createWithBots: boolean;
  setCreateWithBots: (value: boolean) => void;
  botCount: number;
  setBotCount: (count: number) => void;
  user: { displayName?: string; username?: string; email?: string | null; bio?: string; avatarUrl?: string | null; profilePublic?: boolean; showStatsPublic?: boolean; showRecentMatchesPublic?: boolean } | null;
  setProfileScreen: (screen: 'login' | 'register' | 'reset') => void;
  setAuthErrorModal: (error: string) => void;
  setProfileDraft: (draft: {
    displayName: string;
    email: string;
    bio: string;
    avatarUrl: string;
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  }) => void;
  profileScreen: string;
  activeUserTab: string;
  setPlayerName: (name: string) => void;
  playerName: string;
  session: { matchID?: string; playerID?: string; credentials?: string } | null;
  bindMatchSession: (params: { matchID: string; playerID: string; credentials: string; playerName: string }) => void;
  adminSelectedMatchID: string;
  setAdminSelectedMatchID: (id: string) => void;
  matches: Array<{ matchID: string }>;
  adminMatches: Array<{ matchID: string }>;
  isAdminRoute: boolean;
  gameTitle: string;
  adminTitle: string;
  adminStorageMode: string;
  ADMIN_STORAGE_MODE_STORAGE_KEY: string;
  LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY: string;
}

export const useAppEffects = ({
  optionalLobbyModules,
  setSelectedOptionalModuleIds,
  roomCapacity,
  lobbyGameUiConfig,
  setRoomCapacity,
  createWithBots,
  setCreateWithBots,
  botCount,
  setBotCount,
  user,
  setProfileScreen,
  setAuthErrorModal,
  setProfileDraft,
  profileScreen,
  activeUserTab,
  setPlayerName,
  playerName,
  session,
  bindMatchSession,
  adminSelectedMatchID,
  setAdminSelectedMatchID,
  matches,
  adminMatches,
  isAdminRoute,
  gameTitle,
  adminTitle,
  adminStorageMode,
  ADMIN_STORAGE_MODE_STORAGE_KEY,
  LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY,
}: UseAppEffectsProps) => {
  // Set always-on modules
  useEffect(() => {
    const alwaysOn = optionalLobbyModules.filter((module) => module.alwaysOn).map((module) => module.id);
    setSelectedOptionalModuleIds((prev) => {
      const merged = Array.from(new Set([...prev, ...alwaysOn]));
      const allowed = new Set(optionalLobbyModules.map((module) => module.id));
      return merged.filter((id) => allowed.has(id));
    });
  }, [optionalLobbyModules, setSelectedOptionalModuleIds]);

  // Validate and adjust room capacity and bot count
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
  }, [lobbyGameUiConfig, roomCapacity, createWithBots, botCount, setRoomCapacity, setCreateWithBots, setBotCount]);

  // Update profile screen when user changes
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
  }, [user, setProfileScreen, setAuthErrorModal, setProfileDraft]);

  // Clear auth error when navigating
  useEffect(() => {
    if (user || profileScreen !== 'login' || activeUserTab !== 'profile') {
      setAuthErrorModal('');
    }
  }, [user, profileScreen, activeUserTab, setAuthErrorModal]);

  // Update player name from user profile
  useEffect(() => {
    if (!user) return;
    const nextPlayerName = user.displayName?.trim() || user.username?.trim() || '';
    if (!nextPlayerName) return;
    if (playerName === nextPlayerName) return;
    setPlayerName(nextPlayerName);
  }, [user?.displayName, user?.username, playerName, setPlayerName]);

  // Bind match session when user is in a game
  useEffect(() => {
    if (!user || !session?.matchID || !session?.playerID || !session?.credentials) return;
    const resolvedPlayerName = user.displayName?.trim() || user.username?.trim() || '';
    bindMatchSession({
      matchID: session.matchID,
      playerID: session.playerID,
      credentials: session.credentials,
      playerName: resolvedPlayerName || playerName,
    });
  }, [user, session?.matchID, session?.playerID, session?.credentials, bindMatchSession, playerName]);

  // Update admin selected match ID
  useEffect(() => {
    if (session?.matchID) {
      setAdminSelectedMatchID(session.matchID);
      return;
    }
    if (adminSelectedMatchID && adminMatches.some((m) => m.matchID === adminSelectedMatchID)) return;
    setAdminSelectedMatchID(adminMatches[0]?.matchID ?? '');
  }, [adminSelectedMatchID, adminMatches, session?.matchID, setAdminSelectedMatchID]);

  // Update document title
  useEffect(() => {
    document.title = isAdminRoute ? adminTitle : gameTitle;
  }, [isAdminRoute, gameTitle, adminTitle]);

  // Persist admin storage mode
  useEffect(() => {
    window.localStorage.setItem(ADMIN_STORAGE_MODE_STORAGE_KEY, adminStorageMode);
    window.localStorage.removeItem(LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY);
  }, [adminStorageMode, ADMIN_STORAGE_MODE_STORAGE_KEY, LEGACY_ADMIN_STORAGE_MODE_STORAGE_KEY]);
};
