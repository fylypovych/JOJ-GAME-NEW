import type { DeckModuleDefinition, SharedGameSetup } from '../../game/jojGame';
import type { CardCategory, CardDefinition } from '../../game/types';

const STARTER_RELEASE_YEAR = '2026';

export const baseStarterNameById: Record<string, string> = {
  lyap_core: `${STARTER_RELEASE_YEAR}.LYAP.STARTER`,
  scandal_core: `${STARTER_RELEASE_YEAR}.SCANDAL.STARTER`,
  support_core: `${STARTER_RELEASE_YEAR}.SUPPORT.STARTER`,
  command_core: `${STARTER_RELEASE_YEAR}.COMMAND.STARTER`,
};

export const normalizeDeckModules = (modules: DeckModuleDefinition[]): DeckModuleDefinition[] =>
  modules.map((module) => {
    const forced = baseStarterNameById[module.id];
    return { ...module, name: forced ?? module.name, cardIds: [...module.cardIds] };
  });

export const buildSeededDeckModules = (cardCatalog: CardDefinition[]): {
  modules: DeckModuleDefinition[];
  gameSetup: SharedGameSetup;
} => {
  const byCategory = (category: CardCategory) => cardCatalog.filter((card) => card.category === category).map((card) => card.id);
  const byLegendary = () => cardCatalog
    .filter((card) => /^legendary-/i.test(card.id) || card.category === 'LEGENDARY')
    .map((card) => card.id);
  const byRankTrack = () => cardCatalog.filter((card) => /^rank[-_]/i.test(card.id)).map((card) => card.id);
  const lyap = byCategory('LYAP');
  const scandal = byCategory('SCANDAL');
  const support = byCategory('SUPPORT');
  const command = byCategory('COMMAND');
  const vvnz = byCategory('VVNZ');
  const legendary = byLegendary();
  const rank = byRankTrack();
  return {
    modules: [
      { id: 'lyap_core', name: baseStarterNameById.lyap_core, moduleType: 'MAIN_DECK_MODULE', category: 'LYAP', cardCount: 20, enabled: true, target: 'deck', defaultCategory: 'LYAP', cardIds: lyap },
      { id: 'scandal_core', name: baseStarterNameById.scandal_core, moduleType: 'MAIN_DECK_MODULE', category: 'SCANDAL', cardCount: 20, enabled: true, target: 'deck', defaultCategory: 'SCANDAL', cardIds: scandal },
      { id: 'support_core', name: baseStarterNameById.support_core, moduleType: 'MAIN_DECK_MODULE', category: 'SUPPORT', cardCount: 30, enabled: true, target: 'deck', defaultCategory: 'SUPPORT', cardIds: support },
      { id: 'command_core', name: baseStarterNameById.command_core, moduleType: 'MAIN_DECK_MODULE', category: 'COMMAND', cardCount: 30, enabled: true, target: 'deck', defaultCategory: 'COMMAND', cardIds: command },
      { id: 'vvnz_default', name: 'VVNZ_DEFAULT', moduleType: 'SYSTEM_MODULE', category: 'VVNZ', cardCount: vvnz.length, enabled: true, target: 'deck', defaultCategory: 'VVNZ', cardIds: vvnz },
      { id: 'legendary_default', name: 'LEGENDARY_DEFAULT', moduleType: 'SEPARATE_DECK_MODULE', category: 'LEGENDARY', cardCount: legendary.length, enabled: true, target: 'legendaryDeck', defaultCategory: 'LEGENDARY', cardIds: legendary },
      { id: 'rank_default', name: 'RANK_DEFAULT', moduleType: 'VISUAL_TRACK_MODULE', category: 'RANK', cardCount: rank.length, enabled: true, target: 'rankTrack', defaultCategory: undefined, cardIds: rank },
    ],
    gameSetup: {
      lyapModuleId: 'lyap_core',
      scandalModuleId: 'scandal_core',
      supportModuleId: 'support_core',
      commandModuleId: 'command_core',
      optionalMainDeckModuleIds: ['vvnz_default'],
      legendaryModuleId: 'legendary_default',
      rankModuleId: 'rank_default',
      legendaryDeckMode: 'separate',
    },
  };
};
