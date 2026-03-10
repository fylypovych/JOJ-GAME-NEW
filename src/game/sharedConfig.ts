import { cloneCard, cloneRank } from './cloneUtils';
import { defaultSharedDeckTemplateSeed, defaultSharedRanksSeed } from './defaultData';
import { GENERAL_RANK_ID } from './ranks';
import {
  buildTemplateWithDefaults,
} from './sharedConfigHelpers';
import {
  addCardToSharedDeckTemplateState,
  addCustomCardToSharedDeckTemplateState,
  buildCardCatalog,
  buildDeckModulesFromTemplateState,
  cloneSharedDeckTemplate,
  exportSharedDeckTemplateState,
  importSharedDeckTemplateState,
  removeCardAtFromSharedDeckTemplateState,
  setSharedDeckBackImageState,
  shuffleItems,
  shuffleSharedDeckTemplateState,
  updateCardAtInSharedDeckTemplateState,
} from './sharedConfigTemplate';
import { isValidRank, normalizeSharedRanks, resolveRandomRankImageFromRanks } from './sharedConfigRanks';
import { parseImportedRanksPayload, serializeSharedRanksDocument } from './sharedConfigSchema';
import type { CardCategory, CardDefinition, RankDefinition } from './types';

export type DeckModuleType = 'MAIN_DECK_MODULE' | 'SEPARATE_DECK_MODULE' | 'SYSTEM_MODULE' | 'VISUAL_TRACK_MODULE';
export type DeckModuleCategory = 'LYAP' | 'SCANDAL' | 'SUPPORT' | 'COMMAND' | 'LEGENDARY' | 'VVNZ' | 'RANK';
export type LegendaryDeckMode = 'separate' | 'merged';

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

export type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
  deckBackImage?: string;
  modules: DeckModuleDefinition[];
  gameSetup: SharedGameSetup;
};

export type DeckTarget = 'deck' | 'legendaryDeck' | 'rankTrack';
export type SharedRanks = RankDefinition[];
export type OptionalGameModuleId = 'vvnz' | 'legendary';

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

const defaultSharedDeckTemplate = (): SharedDeckTemplate => buildTemplateWithDefaults(defaultSharedDeckTemplateSeed);

let sharedDeckTemplate: SharedDeckTemplate = defaultSharedDeckTemplate();
let sharedRanks: SharedRanks = defaultSharedRanksSeed.map(cloneRank);
let sharedExtraCatalog: CardDefinition[] = [];

export const getActiveRanks = (): SharedRanks => sharedRanks;
export const getTopRankId = (): string => {
  const active = getActiveRanks();
  return active[active.length - 1]?.id ?? GENERAL_RANK_ID;
};

export const getSharedRanks = (): SharedRanks => sharedRanks.map(cloneRank);

export const exportSharedRanksJson = (): string => JSON.stringify(serializeSharedRanksDocument(sharedRanks), null, 2);

export const setSharedRanks = (next: SharedRanks): boolean => {
  if (!Array.isArray(next) || next.length === 0) return false;
  if (!next.every((rank) => isValidRank(rank))) return false;
  const ids = next.map((rank) => rank.id.trim());
  if (new Set(ids).size !== ids.length) return false;
  sharedRanks = normalizeSharedRanks(next);
  return true;
};

export const importSharedRanksJson = (text: string): { ok: true } | { ok: false; error: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  const ranks = parseImportedRanksPayload(parsed);
  if (!ranks) return { ok: false, error: 'Invalid ranks schema' };
  return setSharedRanks(ranks) ? { ok: true } : { ok: false, error: 'Invalid ranks schema' };
};

export const resolveRandomRankImage = (rankId: string): string | undefined => resolveRandomRankImageFromRanks(sharedRanks, rankId);

export const resetSharedRanks = () => {
  sharedRanks = defaultSharedRanksSeed.map(cloneRank);
};

export const getSharedDeckTemplateStats = () => ({
  deck: sharedDeckTemplate.deck.length,
  legendary: sharedDeckTemplate.legendaryDeck.length,
  rankTrack: sharedDeckTemplate.rankTrack.length,
});

export const getSharedDeckTemplate = (): SharedDeckTemplate => cloneSharedDeckTemplate(sharedDeckTemplate);

export const buildDeckModulesFromTemplate = (
  template: SharedDeckTemplate,
  setupOverride?: Partial<SharedGameSetup>,
): DeckModuleBuildResult => buildDeckModulesFromTemplateState(template, sharedExtraCatalog, setupOverride);

export const getCardCatalog = (): CardDefinition[] => buildCardCatalog(sharedDeckTemplate, sharedExtraCatalog);

export const exportSharedDeckTemplateJson = (): string => exportSharedDeckTemplateState(sharedDeckTemplate, sharedExtraCatalog);

export const importSharedDeckTemplateJson = (text: string): { ok: true } | { ok: false; error: string } => {
  const result = importSharedDeckTemplateState(text);
  if (!result.ok) return result;
  sharedDeckTemplate = result.template;
  sharedExtraCatalog = result.extraCatalog.map(cloneCard);
  return { ok: true };
};

export const validateSharedDeckTemplateJson = (text: string): { ok: true } | { ok: false; error: string } => {
  const prevTemplate = getSharedDeckTemplate();
  const prevExtraCatalog = sharedExtraCatalog.map(cloneCard);
  const result = importSharedDeckTemplateJson(text);
  sharedDeckTemplate = prevTemplate;
  sharedExtraCatalog = prevExtraCatalog;
  return result;
};

export const resetSharedDeckTemplate = () => {
  sharedDeckTemplate = defaultSharedDeckTemplate();
  sharedExtraCatalog = [];
};

export const shuffle = shuffleItems;

export const shuffleSharedDeckTemplate = () => {
  sharedDeckTemplate = shuffleSharedDeckTemplateState(sharedDeckTemplate);
};

export const setSharedDeckBackImage = (path?: string) => {
  sharedDeckTemplate = setSharedDeckBackImageState(sharedDeckTemplate, path);
};

export const addCardToSharedDeckTemplate = (target: DeckTarget, cardId: string): boolean => {
  const nextTemplate = addCardToSharedDeckTemplateState(sharedDeckTemplate, getCardCatalog(), target, cardId);
  if (!nextTemplate) return false;
  sharedDeckTemplate = nextTemplate;
  return true;
};

export const addCustomCardToSharedDeckTemplate = (target: DeckTarget, card: CardDefinition): void => {
  const nextTemplate = addCustomCardToSharedDeckTemplateState(sharedDeckTemplate, target, card);
  if (!nextTemplate) return;
  sharedDeckTemplate = nextTemplate;
};

export const removeCardAtFromSharedDeckTemplate = (target: DeckTarget, index: number): boolean => {
  const nextTemplate = removeCardAtFromSharedDeckTemplateState(sharedDeckTemplate, target, index);
  if (!nextTemplate) return false;
  sharedDeckTemplate = nextTemplate;
  return true;
};

export const updateCardAtInSharedDeckTemplate = (target: DeckTarget, index: number, card: CardDefinition): boolean => {
  const nextTemplate = updateCardAtInSharedDeckTemplateState(sharedDeckTemplate, target, index, card);
  if (!nextTemplate) return false;
  sharedDeckTemplate = nextTemplate;
  return true;
};

export { categorizeModuleByCardCategory } from './sharedConfigHelpers';
