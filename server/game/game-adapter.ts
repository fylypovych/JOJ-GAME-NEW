/**
 * Game Adapter - isolates server-specific game functionality
 * Re-exports game functions to avoid direct imports from server into src/game
 */

// Re-export game logic functions that server needs
export {
  jojGame,
} from '../../src/game/jojGame';

// Re-export shared config functions
export {
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  getCardCatalog,
  getModules,
  getSharedRanks,
  getSharedDeckTemplateStats,
  importSharedRanksJson,
  importSharedDeckTemplateJson,
  repairGeneratedRankVisualData,
  regenerateRankVisualData,
  resetSharedRanks,
  resetSharedDeckTemplate,
  setSharedRanks,
} from '../../src/game/sharedConfig';

// Re-export types needed by server
export type {
  SharedDeckTemplate,
  SharedRanks,
  SharedGameSetup,
  DeckModuleDefinition,
  DeckTarget,
} from '../../src/game/sharedConfig';
