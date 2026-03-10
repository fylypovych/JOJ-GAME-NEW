import type { DeckModuleDefinition, DeckTarget, SharedGameSetup, SimulationReport } from '../../game/jojGame';
import type { CardCategory, CardDefinition, GameMode, RankDefinition } from '../../game/types';
import type { Language } from '../i18n';
export type AdminStorageMode = 'file' | 'db';
export type AdminDbConfigDraft = {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  sslMode: 'disable' | 'require';
};

export type MatchInfo = { id: string; createdAt: number };

export type Snapshot = {
  G: unknown;
  ctx: unknown;
  updatedAt: number;
};

export type GitUpdateStatus = {
  branch: string;
  remote: string;
  upstream: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  canUpdate: boolean;
  head: string;
  note?: string;
};

export type AdminDbActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
  details?: string;
};

export type DeckStats = {
  deck: number;
  discard: number;
  legendary: number;
  rankTrack: number;
};

export type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
  deckBackImage?: string;
  modules: DeckModuleDefinition[];
  gameSetup: SharedGameSetup;
};

export type AdminPageProps = {
  uiVariant: 'v1' | 'v2';
  lang: Language;
  adminToken: string;
  serverUrl: string;
  serverUrlDraft: string;
  onServerUrlDraftChange: (value: string) => void;
  onSaveServerUrl: (value: string) => void;
  onResetServerUrl: () => void;
  storageMode: AdminStorageMode;
  onStorageModeChange: (mode: AdminStorageMode) => void;
  dbConfigDraft: AdminDbConfigDraft;
  onDbConfigDraftChange: (next: AdminDbConfigDraft) => void;
  onSaveDbConfigDraft: () => void;
  onTestDbConnection: () => Promise<void>;
  onExportDbSchema: () => Promise<void>;
  onImportDbSchema: () => Promise<void>;
  onImportJsonConfigToDb: () => Promise<void>;
  onExportDbBackup: () => Promise<void>;
  onRestoreDbBackup: (file: File | null) => Promise<void>;
  dbConfigSaveStatus: string;
  dbConnectionTestStatus: string;
  dbConnectionTestError: string;
  dbConnectionTestRunning: boolean;
  dbExportSchemaStatus: string;
  dbExportSchemaError: string;
  dbExportSchemaRunning: boolean;
  dbImportSchemaStatus: string;
  dbImportSchemaError: string;
  dbImportSchemaRunning: boolean;
  dbImportJsonConfigStatus: string;
  dbImportJsonConfigError: string;
  dbImportJsonConfigRunning: boolean;
  dbExportBackupStatus: string;
  dbExportBackupError: string;
  dbExportBackupRunning: boolean;
  dbRestoreBackupStatus: string;
  dbRestoreBackupError: string;
  dbRestoreBackupRunning: boolean;
  matches: MatchInfo[];
  activeMatchId: string;
  onActiveMatchIdChange: (matchID: string) => void;
  snapshot: Snapshot | null;
  deckStats: DeckStats;
  sharedDeckTemplate: SharedDeckTemplate;
  cardCatalog: CardDefinition[];
  sharedRanks: RankDefinition[];
  sharedConfigLoaded: boolean;
  onCreateMatch: () => void;
  onResetMatch: () => void;
  onDeleteMatch: () => void;
  onResetAll: () => void;
  onRestartServer: () => Promise<boolean>;
  onShuffleDeck: () => void;
  onAddCard: (target: DeckTarget, cardId: string) => boolean;
  onAddCustomCard: (target: DeckTarget, card: CardDefinition) => void;
  onUpdateCard: (target: DeckTarget, index: number, card: CardDefinition) => void;
  onRemoveCard: (target: DeckTarget, index: number) => void;
  onResetTemplate: () => void;
  onSetDeckBackImage: (path?: string) => void;
  onExportTemplate: () => string;
  onImportTemplate: (json: string) => string | null;
  onUpdateRanks: (nextRanks: RankDefinition[]) => boolean;
  onResetRanks: () => void;
  onStopGame: (matchID: string) => Promise<{ ok: boolean; error?: string }>;
  onRunSimulations: (
    players: number,
    simulations: number,
    options?: { gameMode?: GameMode; gameSetup?: Partial<SharedGameSetup> },
  ) => SimulationReport;
};

export type ImportCategoryMode = CardCategory | 'AS_IS';
export type CategoryFilter = CardCategory | 'ALL' | 'CORE';
export type AdminTab = 'matches' | 'deck' | 'import' | 'state' | 'ranks' | 'database' | 'settings' | 'simulation' | 'users';

export type CropDraft = {
  filename: string;
  sourceBlob: Blob;
  sourceUrl: string;
  mime: string;
  sourceWidth: number;
  sourceHeight: number;
  topPx: number;
  rightPx: number;
  bottomPx: number;
  leftPx: number;
};
