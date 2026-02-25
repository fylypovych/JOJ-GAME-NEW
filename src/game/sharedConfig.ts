import { baseDeck, legendaryCards } from './cards';
import { GENERAL_RANK_ID, ranks as baseRanks } from './ranks';
import { cloneCard, cloneRank } from './cloneUtils';
import { normalizeImagePath } from './imagePaths';
import { resourceKeys } from './resourceMeta';
import type { CardDefinition, RankDefinition, ResourceKey } from './types';

export type SharedDeckTemplate = {
  deck: CardDefinition[];
  legendaryDeck: CardDefinition[];
  rankTrack: CardDefinition[];
  deckBackImage?: string;
};

export type DeckTarget = 'deck' | 'legendaryDeck' | 'rankTrack';
export type SharedRanks = RankDefinition[];

const defaultSharedDeckTemplate = (): SharedDeckTemplate => ({
  deck: baseDeck.map(cloneCard),
  legendaryDeck: legendaryCards.map(cloneCard),
  rankTrack: [],
  deckBackImage: undefined,
});

let sharedDeckTemplate: SharedDeckTemplate = defaultSharedDeckTemplate();
let sharedRanks: SharedRanks = baseRanks.map(cloneRank);

export const getActiveRanks = (): SharedRanks => sharedRanks;
export const getTopRankId = (): string => {
  const active = getActiveRanks();
  return active[active.length - 1]?.id ?? GENERAL_RANK_ID;
};

const isValidRank = (rank: unknown): rank is RankDefinition => {
  if (!rank || typeof rank !== 'object') return false;
  const raw = rank as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return false;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return false;
  if (!raw.requirement || typeof raw.requirement !== 'object') return false;
  if (raw.effect !== undefined && (!raw.effect || typeof raw.effect !== 'object')) return false;
  if (raw.cost !== undefined && (!raw.cost || typeof raw.cost !== 'object')) return false;
  if (raw.bonus !== undefined && (!raw.bonus || typeof raw.bonus !== 'object')) return false;
  if (raw.image !== undefined && typeof raw.image !== 'string') return false;
  if (raw.victory !== undefined && typeof raw.victory !== 'boolean') return false;
  if (raw.flavor !== undefined && typeof raw.flavor !== 'string') return false;
  const req = raw.requirement as Record<string, unknown>;
  const costSource = (raw.cost as Record<string, unknown> | undefined) ?? {};
  const effectSource = (raw.effect as Record<string, unknown> | undefined) ?? {};
  const bonusSource = ((raw.bonus as Record<string, unknown> | undefined) ?? effectSource) as Record<string, unknown>;
  for (const key of Object.keys(req)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof req[key] !== 'number') return false;
  }
  for (const key of Object.keys(costSource)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof costSource[key] !== 'number') return false;
  }
  for (const key of Object.keys(bonusSource)) {
    if (!resourceKeys.includes(key as ResourceKey)) return false;
    if (typeof bonusSource[key] !== 'number') return false;
  }
  return true;
};

export const getSharedRanks = (): SharedRanks => sharedRanks.map(cloneRank);

export const setSharedRanks = (next: SharedRanks): boolean => {
  if (!Array.isArray(next) || next.length === 0) return false;
  if (!next.every((rank) => isValidRank(rank))) return false;
  const ids = next.map((rank) => rank.id.trim());
  if (new Set(ids).size !== ids.length) return false;
  sharedRanks = next.map((rank) => {
    const rawRank = rank as RankDefinition & { effect?: Partial<Record<ResourceKey, number>> };
    const costSource = rawRank.cost ? { ...rawRank.cost } : {};
    const bonusSource = rawRank.bonus ? { ...rawRank.bonus } : { ...(rawRank.effect ?? {}) };
    const cost: Partial<Record<ResourceKey, number>> = {};
    resourceKeys.forEach((key) => {
      const rawValue = costSource[key] ?? 0;
      if (rawValue !== 0) cost[key] = Math.abs(rawValue);
    });
    const bonus: Partial<Record<ResourceKey, number>> = {};
    resourceKeys.forEach((key) => {
      const rawValue = bonusSource[key] ?? 0;
      if (rawValue !== 0) bonus[key] = rawValue;
    });
    return cloneRank({
      ...rank,
      id: rank.id.trim(),
      name: rank.name.trim(),
      cost,
      bonus,
      image: normalizeImagePath(typeof rawRank.image === 'string' ? rawRank.image : undefined),
      victory: rawRank.victory === true ? true : undefined,
      flavor: typeof rawRank.flavor === 'string' ? rawRank.flavor : undefined,
    });
  });
  return true;
};

export const resetSharedRanks = () => {
  sharedRanks = baseRanks.map(cloneRank);
};

const buildCardCatalog = (template: SharedDeckTemplate): CardDefinition[] => {
  const byId = new Map<string, CardDefinition>();
  template.deck.forEach((card) => {
    if (!byId.has(card.id)) byId.set(card.id, cloneCard(card));
  });
  template.legendaryDeck.forEach((card) => {
    if (!byId.has(card.id)) byId.set(card.id, cloneCard({ ...card, category: 'LEGENDARY' }));
  });
  template.rankTrack.forEach((card) => {
    if (!byId.has(card.id)) byId.set(card.id, cloneCard(card));
  });
  return [...byId.values()];
};

export const getSharedDeckTemplateStats = () => ({
  deck: sharedDeckTemplate.deck.length,
  legendary: sharedDeckTemplate.legendaryDeck.length,
  rankTrack: sharedDeckTemplate.rankTrack.length,
});

export const getSharedDeckTemplate = (): SharedDeckTemplate => ({
  deck: sharedDeckTemplate.deck.map(cloneCard),
  legendaryDeck: sharedDeckTemplate.legendaryDeck.map(cloneCard),
  rankTrack: sharedDeckTemplate.rankTrack.map(cloneCard),
  deckBackImage: sharedDeckTemplate.deckBackImage,
});

export const getCardCatalog = (): CardDefinition[] => buildCardCatalog(sharedDeckTemplate);

export const exportSharedDeckTemplateJson = (): string => {
  const template = getSharedDeckTemplate();
  const catalog = buildCardCatalog(template);
  return JSON.stringify({
    version: 2,
    catalog,
    deckIds: template.deck.map((card) => card.id),
    legendaryDeckIds: template.legendaryDeck.map((card) => card.id),
    rankTrackIds: template.rankTrack.map((card) => card.id),
    deck: template.deck,
    legendaryDeck: template.legendaryDeck,
    rankTrack: template.rankTrack,
    deckBackImage: template.deckBackImage,
  }, null, 2);
};

const validCategories = new Set<CardDefinition['category']>(['LYAP', 'SCANDAL', 'SUPPORT', 'DECISION', 'NEUTRAL', 'VVNZ', 'LEGENDARY']);
const isLegendaryDeckOnlyCardId = (id: string) => /^legendary-/i.test(id);
const validEffectResources = new Set<string>(['time', 'reputation', 'discipline', 'documents', 'tech', 'rank']);

const parseCard = (value: unknown): CardDefinition | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  if (raw.titleEn !== undefined && typeof raw.titleEn !== 'string') return null;
  if (!validCategories.has(raw.category as CardDefinition['category'])) return null;
  const normalizedCategory = (raw.category === 'LEGENDARY' ? 'NEUTRAL' : raw.category) as CardDefinition['category'];
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

export const importSharedDeckTemplateJson = (text: string): { ok: true } | { ok: false; error: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Template must be an object' };

  const raw = parsed as Record<string, unknown>;
  let typedDeck: CardDefinition[] = [];
  let typedLegendaryDeck: CardDefinition[] = [];
  let typedRankTrack: CardDefinition[] = [];

  const importByFullCards = () => {
    if (!Array.isArray(raw.deck) || !Array.isArray(raw.legendaryDeck)) return { ok: false as const, error: 'Template must contain deck and legendaryDeck arrays' };
    const deck = raw.deck.map(parseCard);
    const legendaryDeck = raw.legendaryDeck.map(parseCard);
    const rankTrack = (Array.isArray(raw.rankTrack) ? raw.rankTrack : []).map(parseCard);
    if (deck.some((card) => !card) || legendaryDeck.some((card) => !card) || rankTrack.some((card) => !card)) return { ok: false as const, error: 'One or more cards have invalid schema' };
    typedDeck = (deck as CardDefinition[]).map(cloneCard);
    typedLegendaryDeck = (legendaryDeck as CardDefinition[]).map(cloneCard);
    typedRankTrack = (rankTrack as CardDefinition[]).map(cloneCard);
    return { ok: true as const };
  };

  const importByCatalogIds = () => {
    if (!Array.isArray(raw.catalog) || !Array.isArray(raw.deckIds) || !Array.isArray(raw.legendaryDeckIds)) return { ok: false as const, error: 'Template must contain catalog, deckIds and legendaryDeckIds arrays' };
    const catalogParsed = raw.catalog.map(parseCard);
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
      const legendary = resolveIds(raw.legendaryDeckIds as unknown[], 'legendaryDeckIds');
      const rankTrack = resolveIds(Array.isArray(raw.rankTrackIds) ? raw.rankTrackIds : [], 'rankTrackIds');
      if (!deck || !legendary || !rankTrack) return { ok: false as const, error: 'Template id arrays must contain strings only' };
      typedDeck = deck;
      typedLegendaryDeck = legendary;
      typedRankTrack = rankTrack;
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: String(error instanceof Error ? error.message : error) };
    }
  };

  if (Array.isArray(raw.catalog) && Array.isArray(raw.deckIds) && Array.isArray(raw.legendaryDeckIds)) {
    const result = importByCatalogIds();
    if (!result.ok) return result;
  } else {
    const result = importByFullCards();
    if (!result.ok) return result;
  }

  typedDeck = typedDeck.filter((card) => !isLegendaryDeckOnlyCardId(card.id));
  const deckBackImage = normalizeImagePath(typeof raw.deckBackImage === 'string' ? raw.deckBackImage : undefined);
  sharedDeckTemplate = {
    deck: typedDeck.map(cloneCard),
    legendaryDeck: typedLegendaryDeck.map(cloneCard),
    rankTrack: typedRankTrack.map(cloneCard),
    deckBackImage,
  };
  return { ok: true };
};

export const resetSharedDeckTemplate = () => {
  sharedDeckTemplate = defaultSharedDeckTemplate();
};

export const shuffle = <T,>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

export const shuffleSharedDeckTemplate = () => {
  sharedDeckTemplate = { ...sharedDeckTemplate, deck: shuffle(sharedDeckTemplate.deck) };
};

export const setSharedDeckBackImage = (path?: string) => {
  sharedDeckTemplate = { ...sharedDeckTemplate, deckBackImage: normalizeImagePath(path) };
};

export const addCardToSharedDeckTemplate = (target: DeckTarget, cardId: string): boolean => {
  if (target === 'deck' && isLegendaryDeckOnlyCardId(cardId)) return false;
  const card = getCardCatalog().find((item) => item.id === cardId);
  if (!card) return false;
  sharedDeckTemplate = { ...sharedDeckTemplate, [target]: [...sharedDeckTemplate[target], cloneCard(card)] };
  return true;
};

export const addCustomCardToSharedDeckTemplate = (target: DeckTarget, card: CardDefinition): void => {
  if (target === 'deck' && isLegendaryDeckOnlyCardId(card.id)) return;
  sharedDeckTemplate = { ...sharedDeckTemplate, [target]: [...sharedDeckTemplate[target], cloneCard(card)] };
};

export const removeCardAtFromSharedDeckTemplate = (target: DeckTarget, index: number): boolean => {
  if (index < 0 || index >= sharedDeckTemplate[target].length) return false;
  sharedDeckTemplate = { ...sharedDeckTemplate, [target]: sharedDeckTemplate[target].filter((_, i) => i !== index) };
  return true;
};

export const updateCardAtInSharedDeckTemplate = (target: DeckTarget, index: number, card: CardDefinition): boolean => {
  if (index < 0 || index >= sharedDeckTemplate[target].length) return false;
  if (target === 'deck' && isLegendaryDeckOnlyCardId(card.id)) return false;
  sharedDeckTemplate = { ...sharedDeckTemplate, [target]: sharedDeckTemplate[target].map((item, i) => (i === index ? cloneCard(card) : item)) };
  return true;
};
