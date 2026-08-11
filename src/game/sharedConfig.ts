import type { CardDefinition, CardCategory, RankDefinition } from './types';

export type DeckModuleType = 'MAIN_DECK_MODULE' | 'SEPARATE_DECK_MODULE' | 'SYSTEM_MODULE' | 'VISUAL_TRACK_MODULE';
export type DeckModuleCategory = 'LYAP' | 'SCANDAL' | 'SUPPORT' | 'COMMAND' | 'LEGENDARY' | 'VVNZ' | 'RANK';
export type LegendaryDeckMode = 'separate' | 'merged';
export type DeckTarget = 'deck' | 'legendaryDeck' | 'rankTrack';
export type SharedRanks = RankDefinition[];
export type OptionalGameModuleId = 'vvnz' | 'legendary';

export type DeckModuleDefinition = {
  id: string;
  name: string;
  moduleType: DeckModuleType;
  category: DeckModuleCategory;
  cardCount: number;
  enabled: boolean;
  target: DeckTarget;
  cardIds: string[];
  defaultCategory?: CardCategory;
  deckBackImage?: string;
};

export type SharedGameSetup = {
  lyapModuleId?: string;
  scandalModuleId?: string;
  supportModuleId?: string;
  commandModuleId?: string;
  optionalMainDeckModuleIds: string[];
  legendaryModuleId?: string;
  rankModuleId?: string;
  legendaryDeckMode: LegendaryDeckMode;
};

export interface SharedDeckTemplate {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
  extraCatalog: CardDefinition[];
  deckBackImage?: string;
  modules: DeckModuleDefinition[];
  gameSetup: SharedGameSetup;
  [key: string]: unknown;
}

export type DeckModuleBuildResult = {
  baseDeck: CardDefinition[];
  mainDeck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
  optionalMainDeckModules: Record<string, CardDefinition[]>;
  optionalLegendaryDeckModules: Record<string, CardDefinition[]>;
  modules: DeckModuleDefinition[];
  gameSetup: SharedGameSetup;
};

import { sharedConfigService, SharedConfigService } from './sharedConfigService';

// Re-export the class for DI/Testing
export { SharedConfigService, sharedConfigService };

// Backward compatible function exports (proxies to singleton)
export const repairGeneratedRankVisualData = () => sharedConfigService.repairGeneratedRankVisualData();
export const regenerateRankVisualData = () => sharedConfigService.regenerateRankVisualData();
export const getActiveRanks = () => sharedConfigService.getActiveRanks();
export const getTopRankId = () => sharedConfigService.getTopRankId();
export const getSharedRanks = () => sharedConfigService.getSharedRanks();
export const exportSharedRanksJson = () => sharedConfigService.exportSharedRanksJson();
export const setSharedRanks = (next: SharedRanks) => sharedConfigService.setSharedRanks(next);
export const importSharedRanksJson = (text: string) => sharedConfigService.importSharedRanksJson(text);
export const resolveRandomRankImage = (rankId: string) => sharedConfigService.resolveRandomRankImage(rankId);
export const resetSharedRanks = () => sharedConfigService.resetSharedRanks();
export const getSharedDeckTemplateStats = () => sharedConfigService.getSharedDeckTemplateStats();
export const getSharedDeckTemplate = () => sharedConfigService.getSharedDeckTemplate();
export const buildDeckModulesFromTemplate = (
  template: SharedDeckTemplate,
  setupOverride?: Partial<SharedGameSetup>,
) => sharedConfigService.buildDeckModulesFromTemplate(template, setupOverride);
export const getCardCatalog = () => sharedConfigService.getCardCatalog();
export const getModules = () => sharedConfigService.getModules();
export const exportSharedDeckTemplateJson = () => sharedConfigService.exportSharedDeckTemplateJson();
export const importSharedDeckTemplateJson = (text: string) => sharedConfigService.importSharedDeckTemplateJson(text);
export const validateSharedDeckTemplateJson = (text: string) => sharedConfigService.validateSharedDeckTemplateJson(text);
export const resetSharedDeckTemplate = () => sharedConfigService.resetSharedDeckTemplate();
export const shuffle = sharedConfigService.shuffle;
export const shuffleSharedDeckTemplate = () => sharedConfigService.shuffleSharedDeckTemplate();
export const setSharedDeckBackImage = (path?: string) => sharedConfigService.setSharedDeckBackImage(path);
export const addCardToSharedDeckTemplate = (target: DeckTarget, cardId: string) =>
  sharedConfigService.addCardToSharedDeckTemplate(target, cardId);
export const addCustomCardToSharedDeckTemplate = (target: DeckTarget, card: CardDefinition) =>
  sharedConfigService.addCustomCardToSharedDeckTemplate(target, card);
export const removeCardAtFromSharedDeckTemplate = (target: DeckTarget, index: number) =>
  sharedConfigService.removeCardAtFromSharedDeckTemplate(target, index);
export const updateCardAtInSharedDeckTemplate = (target: DeckTarget, index: number, card: CardDefinition) =>
  sharedConfigService.updateCardAtInSharedDeckTemplate(target, index, card);

export { categorizeModuleByCardCategory } from './sharedConfigHelpers';
