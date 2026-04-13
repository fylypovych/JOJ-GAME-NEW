import { cloneCard, cloneRank } from './cloneUtils';
import { defaultSharedDeckTemplateSeed, defaultSharedExtraCatalogSeed, defaultSharedRanksSeed } from './defaultData';
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
import { CARD_ASSET_BASE_PATH } from './imagePaths';
import type { CardDefinition, RankDefinition } from './types';
import type {
  DeckModuleDefinition,
  DeckModuleBuildResult,
  DeckTarget,
  SharedDeckTemplate,
  SharedGameSetup,
  SharedRanks,
} from './sharedConfig';

const buildRankAssetPath = (index: number) => `${CARD_ASSET_BASE_PATH}${String(index).padStart(2, '0')}-1.webp`;
const generatedRankCardCopies = (rankId: string) => (rankId === 'recruit' ? 6 : 4);
const isGeneratedRankTrackCardId = (cardId: string) => /^rank-[a-z0-9_]+-(set-\d+|extra-\d+)$/i.test(cardId);

const defaultSharedDeckTemplate = (): SharedDeckTemplate => buildTemplateWithDefaults(defaultSharedDeckTemplateSeed);

export class SharedConfigService {
  private sharedDeckTemplate: SharedDeckTemplate;
  private sharedRanks: SharedRanks;
  private sharedExtraCatalog: CardDefinition[];

  constructor() {
    this.sharedDeckTemplate = defaultSharedDeckTemplate();
    this.sharedRanks = defaultSharedRanksSeed.map(cloneRank);
    this.sharedExtraCatalog = defaultSharedExtraCatalogSeed.map(cloneCard);
  }

  private hydrateSharedRanksWithGeneratedImages(ranks: SharedRanks) {
    let changed = false;
    const nextRanks = ranks.map((rank: RankDefinition, index: number) => {
      if (rank.image || (rank.imageVariants?.length ?? 0) > 0) return cloneRank(rank);
      changed = true;
      const imagePath = buildRankAssetPath(index);
      return cloneRank({
        ...rank,
        image: imagePath,
        imageVariants: [imagePath],
      });
    });
    return { nextRanks, changed };
  }

  private buildGeneratedRankTrackFromRanks(ranks: SharedRanks): CardDefinition[] {
    return ranks.flatMap((rank: RankDefinition, index: number) => {
      const copies = generatedRankCardCopies(rank.id);
      const baseImage = rank.imageVariants?.[0] || rank.image || buildRankAssetPath(index);
      return Array.from({ length: copies }, (_, copyIndex) => {
        const isExtraRecruit = rank.id === 'recruit' && copyIndex >= 4;
        const suffix = isExtraRecruit ? `extra-${copyIndex - 3}` : `set-${copyIndex + 1}`;
        return cloneCard({
          id: `rank-${rank.id}-${suffix}`,
          title: rank.name,
          category: 'COMMAND',
          image: baseImage,
          grantRank: rank.id,
          flavor: rank.flavor,
        });
      });
    });
  }

  private syncGeneratedRankVisualData(force = false): { ranksChanged: boolean; templateChanged: boolean } {
    let ranksChanged = false;
    let templateChanged = false;

    if (this.sharedRanks.length === 0) {
      return { ranksChanged: false, templateChanged: false };
    }

    const hydratedRanks = this.hydrateSharedRanksWithGeneratedImages(this.sharedRanks);
    if (hydratedRanks.changed) {
      this.sharedRanks = hydratedRanks.nextRanks;
      ranksChanged = true;
    }

    const expectedRankTrackCount = this.sharedRanks.reduce((acc: number, rank: RankDefinition) => acc + generatedRankCardCopies(rank.id), 0);
    const hasOnlyGeneratedRankCards = this.sharedDeckTemplate.rankTrack.every((card) => isGeneratedRankTrackCardId(card.id));
    const needsRankTrackRepair = force
      || this.sharedDeckTemplate.rankTrack.length === 0
      || (hasOnlyGeneratedRankCards && this.sharedDeckTemplate.rankTrack.length !== expectedRankTrackCount);

    if (!needsRankTrackRepair) {
      return { ranksChanged, templateChanged };
    }

    const generatedRankTrack = this.buildGeneratedRankTrackFromRanks(this.sharedRanks);
    const rankModuleId = 'rank_default';
    const rankModuleName = '2026.RANK.CARDS';
    const nextModules = [...(this.sharedDeckTemplate.modules ?? [])];
    const existingRankModuleIndex = nextModules.findIndex((module) => module.target === 'rankTrack' && module.category === 'RANK');
    const nextRankModule: DeckModuleDefinition = {
      id: rankModuleId,
      name: rankModuleName,
      moduleType: 'VISUAL_TRACK_MODULE',
      category: 'RANK',
      cardCount: generatedRankTrack.length,
      enabled: true,
      target: 'rankTrack',
      cardIds: generatedRankTrack.map((card) => card.id),
    };
    if (existingRankModuleIndex >= 0) nextModules.splice(existingRankModuleIndex, 1, nextRankModule);
    else nextModules.push(nextRankModule);

    this.sharedDeckTemplate = {
      ...this.sharedDeckTemplate,
      rankTrack: generatedRankTrack,
      modules: nextModules,
      gameSetup: {
        ...this.sharedDeckTemplate.gameSetup,
        rankModuleId,
      },
    };
    templateChanged = true;

    return { ranksChanged, templateChanged };
  }

  repairGeneratedRankVisualData(): { ranksChanged: boolean; templateChanged: boolean } {
    return this.syncGeneratedRankVisualData(false);
  }

  getActiveRanks(): SharedRanks {
    return this.sharedRanks;
  }

  getTopRankId(): string {
    const active = this.getActiveRanks();
    return active[active.length - 1]?.id ?? GENERAL_RANK_ID;
  }

  getSharedRanks(): SharedRanks {
    return this.sharedRanks.map(cloneRank);
  }

  exportSharedRanksJson(): string {
    return JSON.stringify(serializeSharedRanksDocument(this.sharedRanks), null, 2);
  }

  setSharedRanks(next: SharedRanks): boolean {
    if (!Array.isArray(next) || next.length === 0) return false;
    if (!next.every((rank) => isValidRank(rank))) return false;
    const ids = next.map((rank) => rank.id.trim());
    if (new Set(ids).size !== ids.length) return false;
    this.sharedRanks = normalizeSharedRanks(next);
    this.syncGeneratedRankVisualData(true);
    return true;
  }

  importSharedRanksJson(text: string): { ok: true } | { ok: false; error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Invalid JSON' };
    }
    const ranks = parseImportedRanksPayload(parsed);
    if (!ranks) return { ok: false, error: 'Invalid ranks schema' };
    return this.setSharedRanks(ranks) ? { ok: true } : { ok: false, error: 'Invalid ranks schema' };
  }

  resolveRandomRankImage(rankId: string): string | undefined {
    return resolveRandomRankImageFromRanks(this.sharedRanks, rankId);
  }

  resetSharedRanks(): void {
    this.sharedRanks = defaultSharedRanksSeed.map(cloneRank);
    this.syncGeneratedRankVisualData(true);
  }

  getSharedDeckTemplateStats() {
    return {
      deck: this.sharedDeckTemplate.deck.length,
      legendary: this.sharedDeckTemplate.legendaryDeck.length,
      rankTrack: this.sharedDeckTemplate.rankTrack.length,
    };
  }

  getSharedDeckTemplate(): SharedDeckTemplate {
    const template = cloneSharedDeckTemplate(this.sharedDeckTemplate);
    return { ...template, extraCatalog: this.sharedExtraCatalog.map(cloneCard) };
  }

  buildDeckModulesFromTemplate(
    template: SharedDeckTemplate,
    setupOverride?: Partial<SharedGameSetup>,
  ): DeckModuleBuildResult {
    return buildDeckModulesFromTemplateState(template, this.sharedExtraCatalog, setupOverride);
  }

  getCardCatalog(): CardDefinition[] {
    return buildCardCatalog(this.sharedDeckTemplate, this.sharedExtraCatalog);
  }

  getModules(): unknown[] {
    return this.sharedDeckTemplate.modules || [];
  }

  exportSharedDeckTemplateJson(): string {
    return exportSharedDeckTemplateState(this.sharedDeckTemplate, this.sharedExtraCatalog);
  }

  importSharedDeckTemplateJson(text: string): { ok: true } | { ok: false; error: string } {
    const result = importSharedDeckTemplateState(text);
    if (!result.ok) return result;
    this.sharedDeckTemplate = result.template;
    this.sharedExtraCatalog = result.extraCatalog.map(cloneCard);
    return { ok: true };
  }

  validateSharedDeckTemplateJson(text: string): { ok: true } | { ok: false; error: string } {
    const prevTemplate = this.getSharedDeckTemplate();
    const prevExtraCatalog = this.sharedExtraCatalog.map(cloneCard);
    const result = this.importSharedDeckTemplateJson(text);
    this.sharedDeckTemplate = prevTemplate;
    this.sharedExtraCatalog = prevExtraCatalog;
    return result;
  }

  resetSharedDeckTemplate(): void {
    this.sharedDeckTemplate = defaultSharedDeckTemplate();
    this.sharedExtraCatalog = defaultSharedExtraCatalogSeed.map(cloneCard);
  }

  shuffle = shuffleItems;

  shuffleSharedDeckTemplate(): void {
    this.sharedDeckTemplate = shuffleSharedDeckTemplateState(this.sharedDeckTemplate);
  }

  setSharedDeckBackImage(path?: string): void {
    this.sharedDeckTemplate = setSharedDeckBackImageState(this.sharedDeckTemplate, path);
  }

  addCardToSharedDeckTemplate(target: DeckTarget, cardId: string): boolean {
    const nextTemplate = addCardToSharedDeckTemplateState(this.sharedDeckTemplate, this.getCardCatalog(), target, cardId);
    if (!nextTemplate) return false;
    this.sharedDeckTemplate = nextTemplate;
    return true;
  }

  addCustomCardToSharedDeckTemplate(target: DeckTarget, card: CardDefinition): void {
    const nextTemplate = addCustomCardToSharedDeckTemplateState(this.sharedDeckTemplate, target, card);
    if (!nextTemplate) return;
    this.sharedDeckTemplate = nextTemplate;
  }

  removeCardAtFromSharedDeckTemplate(target: DeckTarget, index: number): boolean {
    const nextTemplate = removeCardAtFromSharedDeckTemplateState(this.sharedDeckTemplate, target, index);
    if (!nextTemplate) return false;
    this.sharedDeckTemplate = nextTemplate;
    return true;
  }

  updateCardAtInSharedDeckTemplate(target: DeckTarget, index: number, card: CardDefinition): boolean {
    const nextTemplate = updateCardAtInSharedDeckTemplateState(this.sharedDeckTemplate, target, index, card);
    if (!nextTemplate) return false;
    this.sharedDeckTemplate = nextTemplate;
    return true;
  }

  // Internal state access for advanced use cases
  getInternalState(): { template: SharedDeckTemplate; ranks: SharedRanks; extraCatalog: CardDefinition[] } {
    return {
      template: cloneSharedDeckTemplate(this.sharedDeckTemplate),
      ranks: this.sharedRanks.map(cloneRank),
      extraCatalog: this.sharedExtraCatalog.map(cloneCard),
    };
  }

  setInternalState(state: { template?: SharedDeckTemplate; ranks?: SharedRanks; extraCatalog?: CardDefinition[] }): void {
    if (state.template) this.sharedDeckTemplate = cloneSharedDeckTemplate(state.template);
    if (state.ranks) this.sharedRanks = state.ranks.map(cloneRank);
    if (state.extraCatalog) this.sharedExtraCatalog = state.extraCatalog.map(cloneCard);
  }
}

// Singleton instance for backward compatibility
export const sharedConfigService = new SharedConfigService();
