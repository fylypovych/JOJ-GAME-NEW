import type { DeckTarget, SimulationReport } from '../../game/jojGame';
import type { CardCategory, CardDefinition, RankDefinition } from '../../game/types';
import type { Language } from '../i18n';

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
};

export type AdminPageProps = {
  lang: Language;
  adminToken: string;
  serverUrl: string;
  serverUrlDraft: string;
  onServerUrlDraftChange: (value: string) => void;
  onSaveServerUrl: (value: string) => void;
  onResetServerUrl: () => void;
  matches: MatchInfo[];
  activeMatchId: string;
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
  onAddCard: (target: DeckTarget, cardId: string) => void;
  onAddCustomCard: (target: DeckTarget, card: CardDefinition) => void;
  onUpdateCard: (target: DeckTarget, index: number, card: CardDefinition) => void;
  onRemoveCard: (target: DeckTarget, index: number) => void;
  onResetTemplate: () => void;
  onSetDeckBackImage: (path?: string) => void;
  onExportTemplate: () => string;
  onImportTemplate: (json: string) => string | null;
  onUpdateRanks: (nextRanks: RankDefinition[]) => boolean;
  onResetRanks: () => void;
  onRunSimulations: (
    players: number,
    simulations: number,
    options?: { useMainDeck?: boolean; useLegendaryDeck?: boolean },
  ) => SimulationReport;
};

export type ImportCategoryMode = CardCategory | 'AS_IS';
export type CategoryFilter = CardCategory | 'ALL';
export type AdminTab = 'matches' | 'deck' | 'import' | 'state' | 'ranks' | 'settings' | 'simulation';

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
