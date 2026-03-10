import { cloneCard } from './cloneUtils';
import { normalizeImagePath } from './imagePaths';
import type { CardDefinition, ResourceKey } from './types';

const validCategories = new Set<CardDefinition['category']>(['LYAP', 'SCANDAL', 'SUPPORT', 'COMMAND', 'VVNZ', 'LEGENDARY']);
const validEffectResources = new Set<string>(['time', 'reputation', 'discipline', 'documents', 'tech', 'rank']);

export const isLegendaryDeckOnlyCardId = (id: string) => /^legendary-/i.test(id);

export const parseImportedCard = (value: unknown): CardDefinition | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  if (raw.titleEn !== undefined && typeof raw.titleEn !== 'string') return null;
  const rawCategory = raw.category === 'DECISION' ? 'COMMAND' : raw.category;
  if (!validCategories.has(rawCategory as CardDefinition['category'])) return null;
  const normalizedCategory = rawCategory as CardDefinition['category'];
  const image = normalizeImagePath(typeof raw.image === 'string' ? raw.image : undefined);
  let effects: CardDefinition['effects'];
  if (raw.effects !== undefined) {
    if (!Array.isArray(raw.effects)) return null;
    const parsedEffects: NonNullable<CardDefinition['effects']> = [];
    for (const effect of raw.effects) {
      if (!effect || typeof effect !== 'object') return null;
      const row = effect as Record<string, unknown>;
      if (typeof row.resource !== 'string' || !validEffectResources.has(row.resource)) return null;
      if (typeof row.value !== 'number') return null;
      parsedEffects.push({ resource: row.resource as 'rank' | ResourceKey, value: row.value });
    }
    effects = parsedEffects;
  }
  const flavor = typeof raw.flavor === 'string' ? raw.flavor : undefined;
  const titleEn = typeof raw.titleEn === 'string' ? raw.titleEn : undefined;
  const flavorEn = typeof raw.flavorEn === 'string' ? raw.flavorEn : undefined;
  const grantRank = typeof raw.grantRank === 'string' && raw.grantRank.trim() ? raw.grantRank.trim() : undefined;
  return { id: raw.id, title: raw.title, titleEn, category: normalizedCategory, image, grantRank, effects, flavor, flavorEn };
};

export const importTemplateCardsByFullRows = (raw: Record<string, unknown>) => {
  if (!Array.isArray(raw.deck) || !Array.isArray(raw.legendaryDeck)) {
    return { ok: false as const, error: 'Template must contain deck and legendaryDeck arrays' };
  }
  const deck = raw.deck.map(parseImportedCard);
  const legendaryDeck = raw.legendaryDeck.map(parseImportedCard);
  const rankTrack = (Array.isArray(raw.rankTrack) ? raw.rankTrack : []).map(parseImportedCard);
  if (deck.some((card) => !card) || legendaryDeck.some((card) => !card) || rankTrack.some((card) => !card)) {
    return { ok: false as const, error: 'One or more cards have invalid schema' };
  }

  const typedDeck = (deck as CardDefinition[]).map(cloneCard);
  const typedLegendaryDeck = (legendaryDeck as CardDefinition[]).map(cloneCard);
  const typedRankTrack = (rankTrack as CardDefinition[]).map(cloneCard);
  let typedExtraCatalog: CardDefinition[] = [];

  if (Array.isArray(raw.catalog)) {
    const catalogParsed = raw.catalog.map(parseImportedCard);
    if (catalogParsed.some((card) => !card)) return { ok: false as const, error: 'One or more catalog cards have invalid schema' };
    const inMain = new Set<string>([
      ...typedDeck.map((card) => card.id),
      ...typedLegendaryDeck.map((card) => card.id),
      ...typedRankTrack.map((card) => card.id),
    ]);
    typedExtraCatalog = (catalogParsed as CardDefinition[]).filter((card) => !inMain.has(card.id)).map(cloneCard);
  }

  return {
    ok: true as const,
    deck: typedDeck,
    legendaryDeck: typedLegendaryDeck,
    rankTrack: typedRankTrack,
    extraCatalog: typedExtraCatalog,
  };
};

export const importTemplateCardsByCatalogIds = (raw: Record<string, unknown>) => {
  if (!Array.isArray(raw.catalog) || !Array.isArray(raw.deckIds) || !Array.isArray(raw.legendaryDeckIds)) {
    return { ok: false as const, error: 'Template must contain catalog, deckIds and legendaryDeckIds arrays' };
  }
  const catalogParsed = raw.catalog.map(parseImportedCard);
  if (catalogParsed.some((card) => !card)) return { ok: false as const, error: 'One or more catalog cards have invalid schema' };
  const byId = new Map<string, CardDefinition>();
  (catalogParsed as CardDefinition[]).forEach((card) => { if (!byId.has(card.id)) byId.set(card.id, cloneCard(card)); });

  const resolveIds = (ids: unknown[], field: string): CardDefinition[] | null => {
    const out: CardDefinition[] = [];
    for (const idRaw of ids) {
      if (typeof idRaw !== 'string') return null;
      const card = byId.get(idRaw);
      if (!card) throw new Error(`Unknown card id in ${field}: ${idRaw}`);
      out.push(cloneCard(card));
    }
    return out;
  };

  try {
    const deck = resolveIds(raw.deckIds as unknown[], 'deckIds');
    const legendaryDeck = resolveIds(raw.legendaryDeckIds as unknown[], 'legendaryDeckIds');
    const rankTrack = resolveIds(Array.isArray(raw.rankTrackIds) ? raw.rankTrackIds : [], 'rankTrackIds');
    if (!deck || !legendaryDeck || !rankTrack) return { ok: false as const, error: 'Template id arrays must contain strings only' };
    const used = new Set<string>([
      ...deck.map((card) => card.id),
      ...legendaryDeck.map((card) => card.id),
      ...rankTrack.map((card) => card.id),
    ]);
    const extraCatalog = (catalogParsed as CardDefinition[]).filter((card) => !used.has(card.id)).map(cloneCard);
    return {
      ok: true as const,
      deck,
      legendaryDeck,
      rankTrack,
      extraCatalog,
    };
  } catch (error) {
    return { ok: false as const, error: String(error instanceof Error ? error.message : error) };
  }
};
