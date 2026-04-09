import type { BotDifficulty, BotProfile, CardDefinition, RankDefinition } from '../../game/types';
import type { AuthUser } from './useUserAccount';
import { getSharedDeckTemplateStats } from '../../game/jojGame';
import { DEFAULT_LOBBY_GAME_UI_CONFIG } from '../../game/lobbyConfig';
import { useLobbyData } from './useLobbyData';
import { useDeckData } from './useDeckData';
import { useGalleryData } from './useGalleryData';
import { RANKS_STORAGE_KEY, SHARED_TEMPLATE_STORAGE_KEY } from './model';

export interface UseAppGameStateArgs {
  serverUrl: string;
  playerName: string;
  user: AuthUser | null;
  gameMode: 'standard' | 'standard_plus' | 'simplified';
  roomCapacity: number;
  createWithBots: boolean;
  botCount: number;
  botDifficulty: BotDifficulty;
  botProfile: BotProfile;
  selectedOptionalModuleIds: string[];
  adminSelectedMatchID: string;
  t: {
    serverUnavailable: string;
    enterName: string;
    roomFull: string;
    createFailed: string;
    joinFailed: string;
    gameModeStandardPlus: string;
    gameModeSimplified: string;
    gameModeStandard: string;
    activeRoom: string;
    gameModeLabel: string;
    roomSummaryPlayers: string;
  };
  bindMatchSession: (args: {
    matchID: string;
    playerID: string;
    credentials: string;
    playerName: string;
  }) => Promise<unknown>;
}

export interface UseAppGameStateResult {
  // Lobby
  matches: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['matches'];
  session: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['session'];
  setSession: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['setSession'];
  loading: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['loading'];
  error: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['error'];
  setError: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['setError'];
  refreshMatches: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['refreshMatches'];
  createRoom: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['createRoom'];
  joinRoom: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['joinRoom'];
  spectateRoom: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['spectateRoom'];
  leaveRoom: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['leaveRoom'];
  roomPlayerNames: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['roomPlayerNames'];
  canStart: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['canStart'];
  lobbyGameUiConfig: typeof DEFAULT_LOBBY_GAME_UI_CONFIG;
  
  // Shared Config
  sharedDeckTemplate: ReturnType<typeof import('./useDeckData')['useDeckData']>['sharedDeckTemplate'];
  cardCatalog: ReturnType<typeof import('./useDeckData')['useDeckData']>['cardCatalog'];
  sharedRanks: ReturnType<typeof import('./useDeckData')['useDeckData']>['sharedRanks'];
  setSharedRanksState: ReturnType<typeof import('./useDeckData')['useDeckData']>['setSharedRanksState'];
  sharedConfigLoaded: ReturnType<typeof import('./useDeckData')['useDeckData']>['sharedConfigLoaded'];
  refreshSharedDeckTemplate: ReturnType<typeof import('./useDeckData')['useDeckData']>['refreshSharedDeckTemplate'];
  syncRanksToServer: ReturnType<typeof import('./useDeckData')['useDeckData']>['syncRanksToServer'];
  
  // Derived
  sharedDeckStats: ReturnType<typeof getSharedDeckTemplateStats>;
  optionalLobbyModules: Array<{ id: string; name: string; alwaysOn: boolean }>;
  galleryCards: CardDefinition[];
  cardImageById: Record<string, string>;
  
  // Admin
  adminMatchID: string;
  
  // Session-related
  activeSessionMatch: ReturnType<typeof import('./useLobbyData')['useLobbyData']>['activeSessionMatch'];
  activeSessionShareLink: string;
  activeSessionGameModeLabel: string;
  activeSessionInviteText: string;
  
  // Helpers
  rollbackTemplate: (json: string) => void;
  applyTemplateChange: (mutate: () => void, previousJson?: string) => Promise<boolean>;
  rollbackRanks: (previousRanks: RankDefinition[]) => void;
}

export const useAppGameState = (args: UseAppGameStateArgs): UseAppGameStateResult => {
  const {
    serverUrl,
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
    t,
    bindMatchSession,
  } = args;

  // Use the smaller hooks
  const lobbyData = useLobbyData({
    serverUrl,
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
    t,
    bindMatchSession,
  });

  const deckData = useDeckData({
    serverUrl,
    sharedTemplateStorageKey: SHARED_TEMPLATE_STORAGE_KEY,
    ranksStorageKey: RANKS_STORAGE_KEY,
  });

  const galleryData = useGalleryData({
    cardCatalog: deckData.cardCatalog,
    sharedDeckTemplate: deckData.sharedDeckTemplate,
  });

  // Combine sharedDeckStats from separate calculation
  const sharedDeckStats = getSharedDeckTemplateStats();

  return {
    // Lobby data
    matches: lobbyData.matches,
    session: lobbyData.session,
    setSession: lobbyData.setSession,
    loading: lobbyData.loading,
    error: lobbyData.error,
    setError: lobbyData.setError,
    refreshMatches: lobbyData.refreshMatches,
    createRoom: lobbyData.createRoom,
    joinRoom: lobbyData.joinRoom,
    spectateRoom: lobbyData.spectateRoom,
    leaveRoom: lobbyData.leaveRoom,
    roomPlayerNames: lobbyData.roomPlayerNames,
    canStart: lobbyData.canStart,
    lobbyGameUiConfig: lobbyData.lobbyGameUiConfig,
    adminMatchID: lobbyData.adminMatchID,
    activeSessionMatch: lobbyData.activeSessionMatch,
    activeSessionShareLink: lobbyData.activeSessionShareLink,
    activeSessionGameModeLabel: lobbyData.activeSessionGameModeLabel,
    activeSessionInviteText: lobbyData.activeSessionInviteText,
    
    // Deck data
    sharedDeckTemplate: deckData.sharedDeckTemplate,
    cardCatalog: deckData.cardCatalog,
    sharedRanks: deckData.sharedRanks,
    setSharedRanksState: deckData.setSharedRanksState,
    sharedConfigLoaded: deckData.sharedConfigLoaded,
    refreshSharedDeckTemplate: deckData.refreshSharedDeckTemplate,
    syncRanksToServer: deckData.syncRanksToServer,
    sharedDeckStats,
    rollbackTemplate: deckData.rollbackTemplate,
    applyTemplateChange: deckData.applyTemplateChange,
    rollbackRanks: deckData.rollbackRanks,
    
    // Gallery data
    optionalLobbyModules: galleryData.optionalLobbyModules,
    galleryCards: galleryData.galleryCards,
    cardImageById: galleryData.cardImageById,
  };
};
