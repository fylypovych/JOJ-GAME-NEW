import type { Ctx, Game } from 'boardgame.io';
import { baseDeck, legendaryCards } from './cards';
import { GENERAL_RANK_ID, ranks as baseRanks } from './ranks';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from './types';

const INVALID_MOVE = 'INVALID_MOVE' as const;
const STARTING_HAND_SIZE = 5;
const STARTING_LEGENDARY_HAND_SIZE = 5;
const HAND_LIMIT = 8;
const DRAW_STAGE = 'draw';
const PLAY_STAGE = 'play';
const END_STAGE = 'end';
const IDLE_STAGE = 'idle';
const CHAT_LIMIT = 200;

const resourceKeys: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];
const resourceLabelsUk: Record<ResourceKey, string> = {
  time: 'Час',
  reputation: 'Авторитет',
  discipline: 'Дисципліна',
  documents: 'Документи',
  tech: 'Технології',
};
const lyapIntros = [
  'Бюрократичний всесвіт тихо поплескав у долоні',
  'Канцелярський маятник хитнувся не в той бік',
  'Архівні боги перегорнули сторінку з виразом "ой-йой"',
  'Службовий таймер ввічливо нагадав, що ідеальність переоцінена',
  'Печатка долі поставила штамп "з несподіванкою"',
];
const scandalIntros = [
  'Інфопривід вийшов у прямий ефір без попередження',
  'Редакція внутрішніх мемів отримала новий сюжет',
  'Пресслужба попросила всіх дихати рівно, але запізно',
  'Новина дня постукала в двері й одразу зайшла',
  'У стрічці подій раптом зʼявився розділ "гаряче"',
];
const lyapClosers = [
  'Кава зробила вигляд, що це просто планове тренування.',
  'Папки зберегли спокій, але нервово.',
  'Протокол зітхнув і пішов на другу ітерацію.',
  'Саркастичний метроном урочисто відбив такт.',
  'Усе під контролем. Майже.',
];
const scandalClosers = [
  'Нарада офіційно отримала новий порядок денний.',
  'Система не панікує, вона "динамічно адаптується".',
  'Журнали попросили додаткову закладку для епічних моментів.',
  'Офіційна версія: так і було задумано.',
  'Робоча атмосфера стала помітно сюжетнішою.',
];
const supportIntros = [
  'Штаб добрих намірів увімкнув режим допомоги',
  'Логістика посміхнулась і кивнула',
  'Канцелярський всесвіт раптом став трохи людянішим',
  'Система зробила вигляд, що все під контролем, і це спрацювало',
  'Внутрішній відділ підтримки відповів швидше, ніж очікували',
];
export const normalizeImagePath = (input?: string): string | undefined => {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;

  const normalized = raw.replace(/\\/g, '/');
  if (/^(https?:\/\/|data:|blob:)/i.test(normalized)) return normalized;
  if (normalized.startsWith('/cards/')) return normalized;
  if (normalized.startsWith('cards/')) return `/${normalized}`;
  if (normalized.startsWith('/public/cards/')) return normalized.replace('/public', '');
  if (normalized.startsWith('public/cards/')) return `/${normalized.replace(/^public\//, '')}`;
  if (/^[^/]+\.(png|webp|jpg|jpeg|gif|svg)$/i.test(normalized)) return `/cards/${normalized}`;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const cloneCard = (card: CardDefinition): CardDefinition => ({
  ...card,
  cost: card.cost ? { ...card.cost } : undefined,
  image: normalizeImagePath(card.image),
  grantRank: typeof card.grantRank === 'string' ? card.grantRank : undefined,
  effects: card.effects?.map((effect) => ({ ...effect })),
});

const cloneRank = (rank: RankDefinition): RankDefinition => ({
  ...rank,
  requirement: { ...rank.requirement },
  cost: { ...rank.cost },
  bonus: { ...rank.bonus },
  image: normalizeImagePath(rank.image),
  victory: rank.victory === true ? true : undefined,
  flavor: typeof rank.flavor === 'string' ? rank.flavor : undefined,
});

const getPlayerLabel = (G: JojGameState, playerID: string) => {
  const name = G.playerNames[playerID]?.trim();
  return name || 'Гравець';
};

const appendChat = (
  G: JojGameState,
  entry: { type: 'player' | 'system'; text: string; playerID?: string },
) => {
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...entry,
  };
  G.chat.push(row);
  if (G.chat.length > CHAT_LIMIT) {
    G.chat = G.chat.slice(-CHAT_LIMIT);
  }
};

const nextSystemMessageSeq = (G: JojGameState): number => {
  const next = (G.systemMessageSeq ?? 0) + 1;
  G.systemMessageSeq = next;
  return next;
};

const stableIndex = (seed: string, modulo: number): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return modulo > 0 ? h % modulo : 0;
};

type SharedDeckTemplate = {
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

const getActiveRanks = (): SharedRanks => sharedRanks;
const getTopRankId = (): string => {
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
  [...template.deck, ...template.legendaryDeck, ...template.rankTrack].forEach((card) => {
    if (!byId.has(card.id)) {
      byId.set(card.id, cloneCard(card));
    }
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
  const payload = {
    version: 2,
    catalog,
    deckIds: template.deck.map((card) => card.id),
    legendaryDeckIds: template.legendaryDeck.map((card) => card.id),
    rankTrackIds: template.rankTrack.map((card) => card.id),
    deck: template.deck,
    legendaryDeck: template.legendaryDeck,
    rankTrack: template.rankTrack,
    deckBackImage: template.deckBackImage,
  };
  return JSON.stringify(payload, null, 2);
};

const validCategories = new Set<CardDefinition['category']>([
  'LYAP',
  'SCANDAL',
  'SUPPORT',
  'DECISION',
  'NEUTRAL',
  'VVNZ',
  'LEGENDARY',
]);
const isLegendaryDeckOnlyCardId = (id: string) => /^legendary-/i.test(id);
const validEffectResources = new Set<string>([
  'time',
  'reputation',
  'discipline',
  'documents',
  'tech',
  'rank',
]);

const parseCard = (value: unknown): CardDefinition | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
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
  const grantRank = typeof raw.grantRank === 'string' && raw.grantRank.trim() ? raw.grantRank.trim() : undefined;
  return {
    id: raw.id,
    title: raw.title,
    category: normalizedCategory,
    image,
    grantRank,
    effects,
    flavor,
  };
};

export const importSharedDeckTemplateJson = (
  text: string,
): { ok: true } | { ok: false; error: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Template must be an object' };
  }

  const raw = parsed as Record<string, unknown>;
  let typedDeck: CardDefinition[] = [];
  let typedLegendaryDeck: CardDefinition[] = [];
  let typedRankTrack: CardDefinition[] = [];

  const importByFullCards = () => {
    if (!Array.isArray(raw.deck) || !Array.isArray(raw.legendaryDeck)) {
      return { ok: false as const, error: 'Template must contain deck and legendaryDeck arrays' };
    }
    const deck = raw.deck.map(parseCard);
    const legendaryDeck = raw.legendaryDeck.map(parseCard);
    const rankTrackRaw = Array.isArray(raw.rankTrack) ? raw.rankTrack : [];
    const rankTrack = rankTrackRaw.map(parseCard);
    if (deck.some((card) => !card) || legendaryDeck.some((card) => !card) || rankTrack.some((card) => !card)) {
      return { ok: false as const, error: 'One or more cards have invalid schema' };
    }
    typedDeck = (deck as CardDefinition[]).map(cloneCard);
    typedLegendaryDeck = (legendaryDeck as CardDefinition[]).map(cloneCard);
    typedRankTrack = (rankTrack as CardDefinition[]).map(cloneCard);
    return { ok: true as const };
  };

  const importByCatalogIds = () => {
    if (!Array.isArray(raw.catalog) || !Array.isArray(raw.deckIds) || !Array.isArray(raw.legendaryDeckIds)) {
      return { ok: false as const, error: 'Template must contain catalog, deckIds and legendaryDeckIds arrays' };
    }
    const catalogParsed = raw.catalog.map(parseCard);
    if (catalogParsed.some((card) => !card)) {
      return { ok: false as const, error: 'One or more catalog cards have invalid schema' };
    }
    const byId = new Map<string, CardDefinition>();
    (catalogParsed as CardDefinition[]).forEach((card) => {
      if (!byId.has(card.id)) byId.set(card.id, cloneCard(card));
    });
    const resolveIds = (ids: unknown[], field: string): CardDefinition[] | null => {
      const out: CardDefinition[] = [];
      for (const idRaw of ids) {
        if (typeof idRaw !== 'string') return null;
        const card = byId.get(idRaw);
        if (!card) {
          throw new Error(`Unknown card id in ${field}: ${idRaw}`);
        }
        out.push(cloneCard(card));
      }
      return out;
    };
    try {
      const deck = resolveIds(raw.deckIds as unknown[], 'deckIds');
      const legendary = resolveIds(raw.legendaryDeckIds as unknown[], 'legendaryDeckIds');
      const rankTrack = resolveIds(Array.isArray(raw.rankTrackIds) ? raw.rankTrackIds : [], 'rankTrackIds');
      if (!deck || !legendary || !rankTrack) {
        return { ok: false as const, error: 'Template id arrays must contain strings only' };
      }
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

  // New rule: legendary cards exist only in legendaryDeck (not in main deck),
  // even if older templates/categories still contain LEGENDARY or legendary-* ids.
  typedDeck = typedDeck.filter((card) => !isLegendaryDeckOnlyCardId(card.id));

  const deckBackImage = normalizeImagePath(
    typeof raw.deckBackImage === 'string' ? raw.deckBackImage : undefined,
  );

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

export const shuffleSharedDeckTemplate = () => {
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    deck: shuffle(sharedDeckTemplate.deck),
  };
};

export const setSharedDeckBackImage = (path?: string) => {
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    deckBackImage: normalizeImagePath(path),
  };
};

export const addCardToSharedDeckTemplate = (target: DeckTarget, cardId: string): boolean => {
  if (target === 'deck' && isLegendaryDeckOnlyCardId(cardId)) return false;
  const card = getCardCatalog().find((item) => item.id === cardId);
  if (!card) return false;
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    [target]: [...sharedDeckTemplate[target], cloneCard(card)],
  };
  return true;
};

export const addCustomCardToSharedDeckTemplate = (target: DeckTarget, card: CardDefinition): void => {
  if (target === 'deck' && isLegendaryDeckOnlyCardId(card.id)) return;
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    [target]: [...sharedDeckTemplate[target], cloneCard(card)],
  };
};

export const removeCardAtFromSharedDeckTemplate = (target: DeckTarget, index: number): boolean => {
  if (index < 0 || index >= sharedDeckTemplate[target].length) return false;
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    [target]: sharedDeckTemplate[target].filter((_, i) => i !== index),
  };
  return true;
};

export const updateCardAtInSharedDeckTemplate = (
  target: DeckTarget,
  index: number,
  card: CardDefinition,
): boolean => {
  if (index < 0 || index >= sharedDeckTemplate[target].length) return false;
  if (target === 'deck' && isLegendaryDeckOnlyCardId(card.id)) return false;
  sharedDeckTemplate = {
    ...sharedDeckTemplate,
    [target]: sharedDeckTemplate[target].map((item, i) => (i === index ? cloneCard(card) : item)),
  };
  return true;
};

const shuffle = <T,>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const hasResources = (resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>): boolean =>
  resourceKeys.every((key) => (resources[key] ?? 0) >= (cost[key] ?? 0));

const spendResources = (resources: Record<ResourceKey, number>, cost: Partial<Record<ResourceKey, number>>) => {
  resourceKeys.forEach((key) => {
    const value = Math.max(0, cost[key] ?? 0);
    if (value > 0) resources[key] -= value;
  });
};

const applyResourceDelta = (
  resources: Record<ResourceKey, number>,
  delta: Partial<Record<ResourceKey, number>>,
) => {
  resourceKeys.forEach((key) => {
    resources[key] += delta[key] ?? 0;
  });
};

const clampNonNegativeResources = (resources: Record<ResourceKey, number>) => {
  resourceKeys.forEach((key) => {
    if (resources[key] < 0) resources[key] = 0;
  });
};

const replacementCostUnits = (
  _resources: Record<ResourceKey, number>,
  _effects: CardDefinition['effects'],
): number => {
  void _resources;
  void _effects;
  return 0;
};

const planReplacementResources = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): ResourceKey[] | null => {
  void resources;
  void effects;
  return [];
};

export const getReplacementUnitsForCard = (
  resources: Record<ResourceKey, number>,
  card: CardDefinition,
): number => replacementCostUnits(resources, card.effects);

const shiftRank = (G: JojGameState, playerID: string, delta: number) => {
  if (delta === 0) return;
  const ranks = getActiveRanks();
  const currentRankId = G.ranks[playerID];
  const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
  const nextIdx = Math.max(0, Math.min(ranks.length - 1, currentRankIdx + delta));
  G.ranks[playerID] = ranks[nextIdx].id;
};

const applyCardEffects = (
  G: JojGameState,
  playerID: string,
  effects: CardDefinition['effects'],
  replacementResources: ResourceKey[] = [],
): boolean => {
  if (!effects?.length) return true;
  const playerResources = G.resources[playerID];
  if (replacementResources.length !== 0) {
    // Legacy clients may still send replacements; ignore only if empty contract is respected.
    return false;
  }

  effects.forEach((effect) => {
    if (effect.resource === 'rank') {
      return;
    }

    if (effect.value < 0) {
      playerResources[effect.resource] = Math.max(0, playerResources[effect.resource] + effect.value);
      return;
    }

    playerResources[effect.resource] += effect.value;
  });
  effects.forEach((effect) => {
    if (effect.resource === 'rank') {
      shiftRank(G, playerID, effect.value);
    }
  });
  clampNonNegativeResources(playerResources);
  return true;
};

const applyCardEffectsSoft = (
  G: JojGameState,
  playerID: string,
  effects: CardDefinition['effects'],
): { resources: Partial<Record<ResourceKey, number>>; rank: number } => {
  const summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } = { resources: {}, rank: 0 };
  if (!effects?.length) return summary;
  const beforeResources = { ...G.resources[playerID] };
  const beforeRankId = G.ranks[playerID];
  try {
    const applied = applyCardEffects(G, playerID, effects, []);
    if (applied) {
      return summarizeAppliedDiff(
        beforeResources,
        G.resources[playerID],
        beforeRankId,
        G.ranks[playerID],
      );
    }
  } catch {
    // fallback to safe clamp below
  }

  const resources = G.resources[playerID];
  effects.forEach((effect) => {
    if (effect.resource === 'rank') return;
    if (effect.value < 0) {
      const next = Math.max(0, resources[effect.resource] + effect.value);
      const delta = next - resources[effect.resource];
      resources[effect.resource] = next;
      summary.resources[effect.resource] = (summary.resources[effect.resource] ?? 0) + delta;
      return;
    }
    resources[effect.resource] += effect.value;
    summary.resources[effect.resource] = (summary.resources[effect.resource] ?? 0) + effect.value;
  });
  effects.forEach((effect) => {
    if (effect.resource === 'rank') {
      shiftRank(G, playerID, effect.value);
      summary.rank += effect.value;
    }
  });
  clampNonNegativeResources(resources);
  return summary;
};

const invertEffectsForCancellation = (
  effects: CardDefinition['effects'],
): NonNullable<CardDefinition['effects']> => (effects ?? []).map((effect) => ({
  ...effect,
  value: effect.value * -1,
}));

const cancelLastLyapOrScandalForPlayer = (
  G: JojGameState,
  playerID: string,
): { canceledCard: CardDefinition | null; summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } } => {
  for (let i = G.discard.length - 1; i >= 0; i -= 1) {
    const card = G.discard[i];
    if (!card || (card.category !== 'LYAP' && card.category !== 'SCANDAL')) continue;
    const beforeResources = { ...G.resources[playerID] };
    const beforeRankId = G.ranks[playerID];
    try {
      const applied = applyCardEffects(G, playerID, invertEffectsForCancellation(card.effects), []);
      if (!applied) {
        return { canceledCard: null, summary: { resources: {}, rank: 0 } };
      }
    } catch {
      return { canceledCard: null, summary: { resources: {}, rank: 0 } };
    }
    const summary = summarizeAppliedDiff(beforeResources, G.resources[playerID], beforeRankId, G.ranks[playerID]);
    return { canceledCard: card, summary };
  }
  return { canceledCard: null, summary: { resources: {}, rank: 0 } };
};

const cancelLastScandalForPlayer = (
  G: JojGameState,
  playerID: string,
): { canceledCard: CardDefinition | null; summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } } => {
  for (let i = G.discard.length - 1; i >= 0; i -= 1) {
    const card = G.discard[i];
    if (!card || card.category !== 'SCANDAL') continue;
    const beforeResources = { ...G.resources[playerID] };
    const beforeRankId = G.ranks[playerID];
    try {
      const applied = applyCardEffects(G, playerID, invertEffectsForCancellation(card.effects), []);
      if (!applied) return { canceledCard: null, summary: { resources: {}, rank: 0 } };
    } catch {
      return { canceledCard: null, summary: { resources: {}, rank: 0 } };
    }
    const summary = summarizeAppliedDiff(beforeResources, G.resources[playerID], beforeRankId, G.ranks[playerID]);
    return { canceledCard: card, summary };
  }
  return { canceledCard: null, summary: { resources: {}, rank: 0 } };
};

const isProtectedFromLyapScandal = (G: JojGameState, ctx: Ctx | { turn?: number }, playerID: string): boolean => {
  const currentTurn = Number(ctx?.turn ?? 0);
  const untilTurn = Number(G.lyapScandalShieldUntilTurn?.[playerID] ?? 0);
  return untilTurn > 0 && currentTurn < untilTurn;
};

const computeShieldUntilNextOwnTurn = (ctx: Ctx, playerID: string): number => {
  const playOrder = ctx.playOrder ?? [];
  const currentTurn = Number(ctx.turn ?? 0);
  if (playOrder.length === 0) return currentTurn + 1;
  const currentIndex = playOrder.indexOf(ctx.currentPlayer);
  const targetIndex = playOrder.indexOf(playerID);
  if (currentIndex < 0 || targetIndex < 0) return currentTurn + playOrder.length;
  if (targetIndex === currentIndex) return currentTurn + playOrder.length;
  if (targetIndex > currentIndex) return currentTurn + (targetIndex - currentIndex);
  return currentTurn + (playOrder.length - currentIndex + targetIndex);
};

const triggerSukhpayZsuOnScandal = (
  G: JojGameState,
  ctx: Ctx | { turn?: number },
  scandalSourcePlayerID: string,
) => {
  const currentTurn = Number(ctx?.turn ?? 0);
  Object.keys(G.players ?? {}).forEach((pid) => {
    if (pid === scandalSourcePlayerID) return;
    const pending = G.sukhpayZsuPendingBonus?.[pid] ?? false;
    const untilTurn = Number(G.sukhpayZsuWatchUntilTurn?.[pid] ?? 0);
    if (!pending) return;
    if (!(untilTurn > 0 && currentTurn < untilTurn)) return;
    G.resources[pid].discipline = (G.resources[pid].discipline ?? 0) + 1;
    clampNonNegativeResources(G.resources[pid]);
    G.sukhpayZsuPendingBonus[pid] = false;
    syncPlayerState(G, pid);
    const seq = nextSystemMessageSeq(G);
    appendChat(G, {
      type: 'system',
      text: `🥫 [${seq}] «Сухпай ЗСУ» спрацював: ${getPlayerLabel(G, pid)} отримує +1 Дисципліна після чужого скандалу.`,
    });
  });
};

const effectSummaryToText = (summary: { resources: Partial<Record<ResourceKey, number>>; rank: number }) => {
  const parts: string[] = [];
  resourceKeys.forEach((key) => {
    const value = summary.resources[key] ?? 0;
    if (value !== 0) {
      parts.push(`${resourceLabelsUk[key]} ${value > 0 ? `+${value}` : value}`);
    }
  });
  if (summary.rank !== 0) {
    parts.push(`Звання ${summary.rank > 0 ? `+${summary.rank}` : summary.rank}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'без змін';
};

const summarizeAppliedDiff = (
  beforeResources: Record<ResourceKey, number>,
  afterResources: Record<ResourceKey, number>,
  beforeRankId: string,
  afterRankId: string,
): { resources: Partial<Record<ResourceKey, number>>; rank: number } => {
  const summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } = { resources: {}, rank: 0 };
  resourceKeys.forEach((key) => {
    const delta = (afterResources[key] ?? 0) - (beforeResources[key] ?? 0);
    if (delta !== 0) summary.resources[key] = delta;
  });
  const ranks = getActiveRanks();
  const from = ranks.findIndex((row) => row.id === beforeRankId);
  const to = ranks.findIndex((row) => row.id === afterRankId);
  if (from >= 0 && to >= 0) {
    summary.rank = to - from;
  }
  return summary;
};

const categoryLabelUk = (category: CardDefinition['category']) => {
  switch (category) {
    case 'LYAP':
      return 'ЛЯП';
    case 'SCANDAL':
      return 'СКАНДАЛ';
    case 'SUPPORT':
      return 'ПІДТРИМКА';
    case 'DECISION':
      return 'РІШЕННЯ';
    case 'NEUTRAL':
      return 'НЕЙТРАЛЬНА';
    case 'VVNZ':
      return 'ВВНЗ';
    case 'LEGENDARY':
      return 'ЛЕГЕНДАРНА';
    default:
      return category;
  }
};

const rankNameById = (rankId: string): string =>
  getActiveRanks().find((row) => row.id === rankId)?.name ?? rankId;

const resourceDeltaToText = (delta: Partial<Record<ResourceKey, number>>) => {
  const parts = resourceKeys
    .map((key) => {
      const value = delta[key] ?? 0;
      if (value === 0) return null;
      return `${resourceLabelsUk[key]} ${value > 0 ? `+${value}` : value}`;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : 'без змін';
};

const costToDelta = (cost: Partial<Record<ResourceKey, number>>): Partial<Record<ResourceKey, number>> => {
  const delta: Partial<Record<ResourceKey, number>> = {};
  resourceKeys.forEach((key) => {
    const value = cost[key] ?? 0;
    if (value > 0) delta[key] = -value;
  });
  return delta;
};

const cardFlavorSnippet = (card: CardDefinition) => {
  const raw = card.flavor?.trim();
  if (!raw) return 'без офіційного коментаря';
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
};

const buildLyapSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const seed = `${seq}:${card.id}:${card.title}:lyap`;
  const intro = lyapIntros[stableIndex(seed, lyapIntros.length)];
  const closer = lyapClosers[stableIndex(`${seed}:closer`, lyapClosers.length)];
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `⚠️ [${seq}] ${intro}: ${playerLabel} дістав «${card.title}» (${category}). Цитата з польового щоденника: "${flavor}". Ефект: ${effectSummaryToText(summary)}. ${closer}`;
};

const buildScandalSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  const seed = `${seq}:${card.id}:${card.title}:scandal`;
  const intro = scandalIntros[stableIndex(seed, scandalIntros.length)];
  const closer = scandalClosers[stableIndex(`${seed}:closer`, scandalClosers.length)];
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `🗞️ [${seq}] ${intro}: ${playerLabel} підняв «${card.title}» (${category}). Нотатка редакції: "${flavor}". Кому прилетіло: ${targetSummaries.join(' | ')}. ${closer}`;
};

const buildSupportSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const seed = `${seq}:${card.id}:${card.title}:support`;
  const intro = supportIntros[stableIndex(seed, supportIntros.length)];
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `🤝 [${seq}] ${intro}: ${playerLabel} розіграв «${card.title}» (${category}). Коментар: "${flavor}". Ефект: ${effectSummaryToText(summary)}.`;
};

const buildPlayedLyapSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  targetPlayerLabel: string,
  card: CardDefinition,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `🎯 [${seq}] ${sourcePlayerLabel} розіграв «${card.title}» (${category}) на ${targetPlayerLabel}. "${flavor}". Ефект: ${effectSummaryToText(summary)}.`;
};

const buildPlayedScandalSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  const category = categoryLabelUk(card.category);
  const flavor = cardFlavorSnippet(card);
  return `📣 [${seq}] ${sourcePlayerLabel} запустив «${card.title}» (${category}) по столу. "${flavor}". Кому прилетіло: ${targetSummaries.join(' | ')}.`;
};

const buildPlayedDecisionSystemMessage = (
  seq: number,
  sourcePlayerLabel: string,
  card: CardDefinition,
  targetSummaries: string[],
) => {
  const flavor = cardFlavorSnippet(card);
  return `🧭 [${seq}] ${sourcePlayerLabel} оголосив «${card.title}» (РІШЕННЯ КОМАНДУВАННЯ). "${flavor}". Наслідки для столу: ${targetSummaries.join(' | ')}.`;
};

const buildPromotionSystemMessage = (
  seq: number,
  playerLabel: string,
  fromRankId: string,
  toRankId: string,
  cost: Partial<Record<ResourceKey, number>>,
  bonus: Partial<Record<ResourceKey, number>>,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const costText = resourceDeltaToText(costToDelta(cost));
  const bonusText = resourceDeltaToText(bonus);
  const totalText = effectSummaryToText(summary);
  return `🎖️ [${seq}] ${playerLabel} підвищився: ${rankNameById(fromRankId)} → ${rankNameById(toRankId)}. Вартість: ${costText}. Бонус: ${bonusText}. Підсумок: ${totalText}.`;
};

const drawCards = (G: JojGameState, playerID: string, amount: number): void => {
  for (let i = 0; i < amount; i += 1) {
    if (G.deck.length === 0) break;
    const card = G.deck.pop();
    if (card) G.hands[playerID].push(card);
  }
};

const drawLegendaryCards = (G: JojGameState, playerID: string, amount: number): void => {
  G.legendaryHands[playerID] = shuffle(sharedDeckTemplate.legendaryDeck.map(cloneCard)).slice(0, Math.max(0, amount));
};

const syncPlayerState = (G: JojGameState, playerID: string): void => {
  G.players[playerID].hand = G.hands[playerID];
  G.players[playerID].rankId = G.ranks[playerID];
  G.players[playerID].resources = G.resources[playerID];
};

const rankSeatLimit = (playerCount: number): number => {
  if (playerCount <= 2) return 1;
  if (playerCount <= 4) return 2;
  return 3;
};

const promoteRank = (G: JojGameState, playerID: string, playerCount: number): boolean => {
  const ranks = getActiveRanks();
  const currentRankId = G.ranks[playerID];
  const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
  const nextRank = ranks[currentRankIdx + 1];
  if (!nextRank) return false;

  const occupied = Object.entries(G.ranks)
    .filter(([pid, rankId]) => pid !== playerID && rankId === nextRank.id)
    .length;
  if (occupied >= rankSeatLimit(playerCount)) return false;

  const playerResources = G.resources[playerID];
  if (!hasResources(playerResources, nextRank.requirement)) return false;
  if (!hasResources(playerResources, nextRank.cost)) return false;
  spendResources(playerResources, nextRank.cost);
  applyResourceDelta(playerResources, nextRank.bonus);
  clampNonNegativeResources(playerResources);
  G.ranks[playerID] = nextRank.id;
  syncPlayerState(G, playerID);
  return true;
};

const promoteToSpecificRank = (
  G: JojGameState,
  playerID: string,
  targetRankId: string,
  playerCount: number,
): { ok: true; rank: RankDefinition } | { ok: false } => {
  const ranks = getActiveRanks();
  const currentRankId = G.ranks[playerID];
  const currentRankIdx = Math.max(0, ranks.findIndex((r) => r.id === currentRankId));
  const targetRankIdx = ranks.findIndex((r) => r.id === targetRankId);
  if (targetRankIdx <= currentRankIdx) return { ok: false };
  const targetRank = ranks[targetRankIdx];
  if (!targetRank) return { ok: false };

  const occupied = Object.entries(G.ranks)
    .filter(([pid, rankId]) => pid !== playerID && rankId === targetRank.id)
    .length;
  if (occupied >= rankSeatLimit(playerCount)) return { ok: false };

  const playerResources = G.resources[playerID];
  if (!hasResources(playerResources, targetRank.requirement)) return { ok: false };
  if (!hasResources(playerResources, targetRank.cost)) return { ok: false };

  spendResources(playerResources, targetRank.cost);
  applyResourceDelta(playerResources, targetRank.bonus);
  clampNonNegativeResources(playerResources);
  G.ranks[playerID] = targetRank.id;
  syncPlayerState(G, playerID);
  return { ok: true, rank: targetRank };
};

const grantSpecificRankIgnoringRequirements = (
  G: JojGameState,
  playerID: string,
  targetRankId: string,
  playerCount: number,
): { ok: true; rank: RankDefinition; fromRankId: string; applied: boolean }
  | { ok: false; reason: 'invalid-rank' | 'no-seat' } => {
  const ranks = getActiveRanks();
  const currentRankId = G.ranks[playerID];
  const currentRankIdx = ranks.findIndex((r) => r.id === currentRankId);
  const targetRankIdx = ranks.findIndex((r) => r.id === targetRankId);
  if (targetRankIdx < 0) return { ok: false, reason: 'invalid-rank' };
  const targetRank = ranks[targetRankIdx];
  if (!targetRank) return { ok: false, reason: 'invalid-rank' };

  // If player already has this rank or higher, do not downgrade / reapply bonus.
  if (currentRankIdx >= targetRankIdx) {
    return { ok: true, rank: targetRank, fromRankId: currentRankId, applied: false };
  }

  const occupied = Object.entries(G.ranks)
    .filter(([pid, rankId]) => pid !== playerID && rankId === targetRank.id)
    .length;
  if (occupied >= rankSeatLimit(playerCount)) return { ok: false, reason: 'no-seat' };

  const playerResources = G.resources[playerID];
  applyResourceDelta(playerResources, targetRank.bonus);
  clampNonNegativeResources(playerResources);
  G.ranks[playerID] = targetRank.id;
  syncPlayerState(G, playerID);
  return { ok: true, rank: targetRank, fromRankId: currentRankId, applied: true };
};

const demoteByOneRankWithSeatCheck = (
  G: JojGameState,
  targetPlayerID: string,
  playerCount: number,
): { ok: true; fromRankId: string; toRankId: string } | { ok: false; reason: 'min-rank' | 'no-seat' | 'invalid-rank' } => {
  const ranks = getActiveRanks();
  const currentRankId = G.ranks[targetPlayerID];
  const currentRankIdx = ranks.findIndex((r) => r.id === currentRankId);
  if (currentRankIdx < 0) return { ok: false, reason: 'invalid-rank' };
  if (currentRankIdx === 0) return { ok: false, reason: 'min-rank' };
  const lowerRank = ranks[currentRankIdx - 1];
  if (!lowerRank) return { ok: false, reason: 'invalid-rank' };

  const occupied = Object.entries(G.ranks)
    .filter(([pid, rankId]) => pid !== targetPlayerID && rankId === lowerRank.id)
    .length;
  if (occupied >= rankSeatLimit(playerCount)) return { ok: false, reason: 'no-seat' };

  G.ranks[targetPlayerID] = lowerRank.id;
  syncPlayerState(G, targetPlayerID);
  return { ok: true, fromRankId: currentRankId, toRankId: lowerRank.id };
};

const buildVvnzRankSystemMessage = (
  seq: number,
  playerLabel: string,
  card: CardDefinition,
  fromRankId: string,
  toRankId: string,
  cost: Partial<Record<ResourceKey, number>>,
  bonus: Partial<Record<ResourceKey, number>>,
  summary: { resources: Partial<Record<ResourceKey, number>>; rank: number },
) => {
  const flavor = cardFlavorSnippet(card);
  const costText = resourceDeltaToText(costToDelta(cost));
  const bonusText = resourceDeltaToText(bonus);
  const totalText = effectSummaryToText(summary);
  return `🎓 [${seq}] ${playerLabel} розіграв «${card.title}» (ВВНЗ) і отримав звання: ${rankNameById(fromRankId)} → ${rankNameById(toRankId)}. "${flavor}". Вартість: ${costText}. Бонус звання: ${bonusText}. Підсумок: ${totalText}.`;
};

const getWinner = (G: JojGameState): string | undefined => {
  const activeRanks = getActiveRanks();
  const victoryRankIds = new Set(activeRanks.filter((rank) => rank.victory).map((rank) => rank.id));
  if (victoryRankIds.size > 0) {
    const byVictoryFlag = Object.entries(G.ranks).find(([, rankId]) => victoryRankIds.has(rankId))?.[0];
    if (byVictoryFlag) return byVictoryFlag;
  } else {
    const topRankId = getTopRankId();
    const topRankPlayer = Object.entries(G.ranks).find(([, rankId]) => rankId === topRankId)?.[0];
    if (topRankPlayer) return topRankPlayer;
  }
  if (G.deck.length === 0) {
    const hasCardsInHands = Object.values(G.hands).some((hand) => hand.length > 0);
    if (hasCardsInHands) return undefined;
    return Object.entries(G.resources)
      .sort(([, a], [, b]) =>
        resourceKeys.reduce((sum, key) => sum + (b[key] - a[key]), 0),
      )
      .at(0)?.[0];
  }
  return undefined;
};

export type SimulationReport = {
  input: {
    players: number;
    simulations: number;
    maxTurns: number;
  };
  generatedAt: string;
  summary: {
    finished: number;
    stalled: number;
    avgTurns: number;
    avgDeckDepletionTurn: number;
    rankWins: number;
    scoreWins: number;
    avgPassesPerGame: number;
  };
  seatWinRates: Array<{
    playerID: string;
    wins: number;
    winRatePct: number;
  }>;
  rankReached: Record<string, number>;
  topReachedRanks: Array<{
    rankId: string;
    games: number;
    pct: number;
  }>;
  topReachedRanksByPct: Array<{
    rankId: string;
    games: number;
    pct: number;
  }>;
  lastGame: {
    winnerPlayerID: string;
    winnerRankId: string;
    winnerResources: Record<ResourceKey, number>;
    turns: number;
  };
  issues: string[];
};

const chooseLyapTarget = (G: JojGameState, sourcePlayerID: string): string | null => {
  const activeRanks = getActiveRanks();
  const rankIndex = (playerID: string) => activeRanks.findIndex((r) => r.id === G.ranks[playerID]);
  const score = (playerID: string) =>
    resourceKeys.reduce((sum, key) => sum + (G.resources[playerID][key] ?? 0), 0) + rankIndex(playerID) * 2;
  const candidates = Object.keys(G.players).filter((pid) => pid !== sourcePlayerID);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
};

const buildReplacementPlan = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): ResourceKey[] | null => planReplacementResources(resources, effects);

const simulateSingleMatch = (
  numPlayers: number,
  maxTurns: number,
): {
  winner: string;
  turns: number;
  stalled: boolean;
  deckDepletionTurn: number;
  wonByRank: boolean;
  passes: number;
  reachedRanks: Record<string, string>;
  finalResources: Record<string, Record<ResourceKey, number>>;
} => {
  const playerIDs = Array.from({ length: numPlayers }, (_, i) => String(i));
  const G: JojGameState = {
    deck: shuffle(sharedDeckTemplate.deck.map(cloneCard)),
    discard: [],
    legendaryDeck: shuffle(sharedDeckTemplate.legendaryDeck.map(cloneCard)),
    legendaryDiscard: [],
    deckBackImage: sharedDeckTemplate.deckBackImage,
    systemMessageSeq: 0,
    playerNames: {},
    chat: [],
    players: {},
    hands: {},
    legendaryHands: {},
    ranks: {},
    resources: {},
    promotedThisTurn: {},
    lyapScandalShieldUntilTurn: {},
    extraHandPlayTokens: {},
    sukhpayZsuWatchUntilTurn: {},
    sukhpayZsuPendingBonus: {},
  };

  playerIDs.forEach((pid, index) => {
    G.hands[pid] = [];
    G.legendaryHands[pid] = [];
    G.ranks[pid] = getActiveRanks()[0]?.id ?? 'cadet';
    G.resources[pid] = { time: 2, reputation: 2, discipline: 2, documents: 2, tech: 2 };
    G.players[pid] = { hand: G.hands[pid], rankId: G.ranks[pid], resources: G.resources[pid] };
    G.playerNames[pid] = `P${index + 1}`;
    G.promotedThisTurn[pid] = false;
    G.lyapScandalShieldUntilTurn[pid] = 0;
    G.extraHandPlayTokens[pid] = 0;
    G.sukhpayZsuWatchUntilTurn[pid] = 0;
    G.sukhpayZsuPendingBonus[pid] = false;
    drawCards(G, pid, STARTING_HAND_SIZE);
    drawLegendaryCards(G, pid, STARTING_LEGENDARY_HAND_SIZE);
    syncPlayerState(G, pid);
  });

  let currentIdx = 0;
  let turns = 0;
  let deckDepletionTurn = -1;
  let passes = 0;
  const tryPromoteOnce = (pid: string) => promoteRank(G, pid, numPlayers);

  while (turns < maxTurns) {
    const playerID = playerIDs[currentIdx];
    const hand = G.hands[playerID];
    let stage: 'play' | 'end' = 'play';

    if (G.deck.length > 0) {
      const card = G.deck.pop();
      if (card) {
        if (card.category === 'LYAP') {
          applyCardEffectsSoft(G, playerID, card.effects);
          G.discard.push(card);
          stage = 'end';
        } else if (card.category === 'SCANDAL') {
          playerIDs.forEach((pid) => {
            applyCardEffectsSoft(G, pid, card.effects);
            syncPlayerState(G, pid);
          });
          triggerSukhpayZsuOnScandal(G, { turn: turns + 1 }, playerID);
          G.discard.push(card);
          stage = 'end';
        } else {
          hand.push(card);
          stage = 'play';
        }
      }
      if (G.deck.length === 0 && deckDepletionTurn < 0) {
        deckDepletionTurn = turns + 1;
      }
    }

    if (stage === 'play') {
      let promotedThisTurn = tryPromoteOnce(playerID);
      let played = false;
      for (let i = 0; i < hand.length; i += 1) {
        const card = hand[i];
        const allPlayerIDs = playerIDs;

        if (card.category === 'LYAP') {
          const target = chooseLyapTarget(G, playerID);
          if (!target) continue;
          applyCardEffectsSoft(G, target, card.effects);
          syncPlayerState(G, target);
        } else if (card.category === 'SCANDAL') {
          allPlayerIDs.filter((pid) => pid !== playerID).forEach((pid) => {
            applyCardEffectsSoft(G, pid, card.effects);
            syncPlayerState(G, pid);
          });
          triggerSukhpayZsuOnScandal(G, { turn: turns + 1 }, playerID);
        } else if (card.category === 'DECISION') {
          allPlayerIDs.forEach((pid) => {
            applyCardEffectsSoft(G, pid, card.effects);
            syncPlayerState(G, pid);
          });
        } else if (card.category === 'VVNZ' && card.grantRank) {
          const promoted = promoteToSpecificRank(G, playerID, card.grantRank, numPlayers);
          if (!promoted.ok) continue;
          try {
            const ok = applyCardEffects(G, playerID, card.effects, []);
            if (!ok) continue;
          } catch {
            continue;
          }
          syncPlayerState(G, playerID);
        } else {
          const replacement = buildReplacementPlan(G.resources[playerID], card.effects);
          if (replacement === null) continue;
          try {
            const ok = applyCardEffects(G, playerID, card.effects, replacement);
            if (!ok) continue;
          } catch {
            continue;
          }
        }

        hand.splice(i, 1);
        G.discard.push(card);
        syncPlayerState(G, playerID);
        if (!promotedThisTurn) {
          promotedThisTurn = tryPromoteOnce(playerID);
        }
        played = true;
        break;
      }

      if (!played) {
        passes += 1;
      }
    } else {
      passes += 1;
    }

    turns += 1;
    const winner = getWinner(G);
    if (winner) {
      return {
        winner,
        turns,
        stalled: false,
        deckDepletionTurn,
        wonByRank: G.ranks[winner] === getTopRankId(),
        passes,
        reachedRanks: { ...G.ranks },
        finalResources: Object.fromEntries(
          Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }]),
        ) as Record<string, Record<ResourceKey, number>>,
      };
    }

    currentIdx = (currentIdx + 1) % playerIDs.length;
  }

  const fallbackWinner = Object.entries(G.resources)
    .sort(([, a], [, b]) => resourceKeys.reduce((sum, key) => sum + (b[key] - a[key]), 0))
    .at(0)?.[0] ?? '0';

  return {
    winner: fallbackWinner,
    turns: maxTurns,
    stalled: true,
    deckDepletionTurn,
    wonByRank: G.ranks[fallbackWinner] === getTopRankId(),
    passes,
    reachedRanks: { ...G.ranks },
    finalResources: Object.fromEntries(
      Object.entries(G.resources).map(([pid, row]) => [pid, { ...row }]),
    ) as Record<string, Record<ResourceKey, number>>,
  };
};

export const runGameSimulations = (
  players: number,
  simulations: number,
  maxTurns = 600,
): SimulationReport => {
  const clampedPlayers = Math.max(2, Math.min(6, Math.floor(players || 2)));
  const clampedSims = Math.max(1, Math.min(5000, Math.floor(simulations || 1)));
  const clampedMaxTurns = Math.max(20, Math.min(4000, Math.floor(maxTurns || 600)));
  const wins: Record<string, number> = {};
  const rankReached: Record<string, number> = {};
  let totalTurns = 0;
  let stalled = 0;
  let rankWins = 0;
  let scoreWins = 0;
  let passesTotal = 0;
  let deckDepletionTotal = 0;
  let deckDepletionKnown = 0;
  const highestRankReachedByGame: Record<string, number> = {};
  let lastGame: SimulationReport['lastGame'] = {
    winnerPlayerID: '0',
    winnerRankId: getActiveRanks()[0]?.id ?? 'cadet',
    winnerResources: { time: 0, reputation: 0, discipline: 0, documents: 0, tech: 0 },
    turns: 0,
  };

  for (let i = 0; i < clampedSims; i += 1) {
    const result = simulateSingleMatch(clampedPlayers, clampedMaxTurns);
    wins[result.winner] = (wins[result.winner] ?? 0) + 1;
    totalTurns += result.turns;
    passesTotal += result.passes;
    if (result.stalled) stalled += 1;
    if (result.wonByRank) rankWins += 1;
    else scoreWins += 1;
    if (result.deckDepletionTurn >= 0) {
      deckDepletionTotal += result.deckDepletionTurn;
      deckDepletionKnown += 1;
    }
    Object.values(result.reachedRanks).forEach((rankId) => {
      rankReached[rankId] = (rankReached[rankId] ?? 0) + 1;
    });
    const activeRanks = getActiveRanks();
    const highest = Object.values(result.reachedRanks)
      .map((rankId) => ({ rankId, idx: activeRanks.findIndex((r) => r.id === rankId) }))
      .sort((a, b) => b.idx - a.idx)[0];
    if (highest?.rankId) {
      highestRankReachedByGame[highest.rankId] = (highestRankReachedByGame[highest.rankId] ?? 0) + 1;
    }
    lastGame = {
      winnerPlayerID: result.winner,
      winnerRankId: result.reachedRanks[result.winner] ?? (getActiveRanks()[0]?.id ?? 'cadet'),
      winnerResources: { ...result.finalResources[result.winner] },
      turns: result.turns,
    };
  }

  const activeRanks = getActiveRanks();
  const topReachedRanks = Object.entries(highestRankReachedByGame)
    .map(([rankId, games]) => ({
      rankId,
      games,
      pct: Number(((games / clampedSims) * 100).toFixed(2)),
      idx: activeRanks.findIndex((r) => r.id === rankId),
    }))
    .sort((a, b) => b.idx - a.idx || b.games - a.games)
    .slice(0, 3)
    .map(({ rankId, games, pct }) => ({ rankId, games, pct }));
  const topReachedRanksByPct = Object.entries(highestRankReachedByGame)
    .map(([rankId, games]) => ({
      rankId,
      games,
      pct: Number(((games / clampedSims) * 100).toFixed(2)),
      idx: activeRanks.findIndex((r) => r.id === rankId),
    }))
    .sort((a, b) => b.games - a.games || b.pct - a.pct || b.idx - a.idx)
    .slice(0, 3)
    .map(({ rankId, games, pct }) => ({ rankId, games, pct }));

  const seatWinRates = Array.from({ length: clampedPlayers }, (_, i) => String(i)).map((playerID) => {
    const seatWins = wins[playerID] ?? 0;
    return {
      playerID,
      wins: seatWins,
      winRatePct: Number(((seatWins / clampedSims) * 100).toFixed(2)),
    };
  });

  const issues: string[] = [];
  if (stalled > 0) {
    issues.push(
      `Виявлено ${stalled} зациклених/довгих матчів із ${clampedSims} (ліміт ${clampedMaxTurns} ходів).`,
    );
  }
  const bestSeat = [...seatWinRates].sort((a, b) => b.winRatePct - a.winRatePct)[0];
  const worstSeat = [...seatWinRates].sort((a, b) => a.winRatePct - b.winRatePct)[0];
  if (bestSeat && worstSeat && bestSeat.winRatePct - worstSeat.winRatePct >= 12) {
    issues.push(
      `Можлива перевага порядку ходу: seat ${bestSeat.playerID} (${bestSeat.winRatePct}%) vs seat ${worstSeat.playerID} (${worstSeat.winRatePct}%).`,
    );
  }
  if (rankWins === 0) {
    issues.push('У симуляціях не зафіксовано перемог через звання Генерала (можливо завеликі вимоги або замалий темп ресурсів).');
  }

  return {
    input: {
      players: clampedPlayers,
      simulations: clampedSims,
      maxTurns: clampedMaxTurns,
    },
    generatedAt: new Date().toISOString(),
    summary: {
      finished: clampedSims - stalled,
      stalled,
      avgTurns: Number((totalTurns / clampedSims).toFixed(2)),
      avgDeckDepletionTurn: Number(
        (deckDepletionKnown > 0 ? deckDepletionTotal / deckDepletionKnown : 0).toFixed(2),
      ),
      rankWins,
      scoreWins,
      avgPassesPerGame: Number((passesTotal / clampedSims).toFixed(2)),
    },
    seatWinRates,
    rankReached,
    topReachedRanks,
    topReachedRanksByPct,
    lastGame,
    issues,
  };
};

export const jojGame: Game<JojGameState> = {
  name: 'joj-game',
  minPlayers: 2,
  maxPlayers: 6,
  setup: ({ ctx }) => {
    const players = [...ctx.playOrder];
    const deck = shuffle(sharedDeckTemplate.deck.map(cloneCard));

    const state: JojGameState = {
      deck,
      discard: [],
      legendaryDeck: shuffle(sharedDeckTemplate.legendaryDeck.map(cloneCard)),
      legendaryDiscard: [],
      deckBackImage: sharedDeckTemplate.deckBackImage,
      systemMessageSeq: 0,
      playerNames: {},
      chat: [],
      players: {},
      hands: {},
      legendaryHands: {},
      ranks: {},
      resources: {},
      promotedThisTurn: {},
      lyapScandalShieldUntilTurn: {},
      extraHandPlayTokens: {},
      sukhpayZsuWatchUntilTurn: {},
      sukhpayZsuPendingBonus: {},
    };

    players.forEach((playerID) => {
      state.hands[playerID] = [];
      state.legendaryHands[playerID] = [];
      state.ranks[playerID] = getActiveRanks()[0]?.id ?? 'cadet';
      state.resources[playerID] = {
        time: 2,
        reputation: 2,
        discipline: 2,
        documents: 2,
        tech: 2,
      };
      state.players[playerID] = {
        hand: state.hands[playerID],
        rankId: state.ranks[playerID],
        resources: state.resources[playerID],
      };
      state.promotedThisTurn[playerID] = false;
      state.lyapScandalShieldUntilTurn[playerID] = 0;
      state.extraHandPlayTokens[playerID] = 0;
      state.sukhpayZsuWatchUntilTurn[playerID] = 0;
      state.sukhpayZsuPendingBonus[playerID] = false;
      state.playerNames[playerID] = '';
      drawCards(state, playerID, STARTING_HAND_SIZE);
      drawLegendaryCards(state, playerID, STARTING_LEGENDARY_HAND_SIZE);
    });

    return state;
  },
  turn: {
    activePlayers: { currentPlayer: DRAW_STAGE },
    onBegin: ({ G, ctx, events }) => {
      Object.keys(G.promotedThisTurn).forEach((pid) => {
        G.promotedThisTurn[pid] = false;
      });
      const value: Record<string, string> = {};
      ctx.playOrder.forEach((pid) => {
        value[pid] = IDLE_STAGE;
      });
      value[ctx.currentPlayer] = G.deck.length > 0 ? DRAW_STAGE : PLAY_STAGE;
      events?.setActivePlayers({ value });
    },
  },
  moves: {
    syncPlayerNames: (args, names: Record<string, string>) => {
      if (!names || typeof names !== 'object') return INVALID_MOVE;
      Object.entries(names).forEach(([pid, value]) => {
        if (!(pid in args.G.players)) return;
        const trimmed = value.trim();
        if (!trimmed) return;
        args.G.playerNames[pid] = trimmed.slice(0, 32);
      });
      return undefined;
    },
    setPlayerName: (args, name: string) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const trimmed = name.trim();
      if (!trimmed) return INVALID_MOVE;
      args.G.playerNames[playerID] = trimmed.slice(0, 32);
      return undefined;
    },
    sendChat: (args, text: string) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const trimmed = text.trim();
      if (!trimmed) return INVALID_MOVE;
      appendChat(args.G, {
        type: 'player',
        playerID,
        text: trimmed.slice(0, 280),
      });
      return undefined;
    },
    drawCard: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== DRAW_STAGE) return INVALID_MOVE;

      const hand = args.G.hands[playerID];
      if (hand.length >= HAND_LIMIT) return INVALID_MOVE;
      let autoPlayed = false;
      const card = args.G.deck.pop();
      if (card) {
        if (card.category === 'LYAP') {
          // Drawn LYAP auto-triggers on the player who drew it.
          const summary = isProtectedFromLyapScandal(args.G, args.ctx, playerID)
            ? { resources: {}, rank: 0 }
            : applyCardEffectsSoft(args.G, playerID, card.effects);
          const seq = nextSystemMessageSeq(args.G);
          appendChat(args.G, {
            type: 'system',
            text: isProtectedFromLyapScandal(args.G, args.ctx, playerID)
              ? `🛡️ [${seq}] ${getPlayerLabel(args.G, playerID)} витягнув «${card.title}», але щит від Грамоти скасував ЛЯП.`
              : buildLyapSystemMessage(seq, getPlayerLabel(args.G, playerID), card, summary),
          });
          args.G.discard.push(card);
          autoPlayed = true;
        } else if (card.category === 'SCANDAL') {
          // Drawn SCANDAL auto-triggers on all players at the table.
          const targetSummaries: string[] = [];
          Object.keys(args.G.players).forEach((pid) => {
            if (isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
              targetSummaries.push(`${getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`);
            } else {
              const summary = applyCardEffectsSoft(args.G, pid, card.effects);
              targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
            }
            syncPlayerState(args.G, pid);
          });
          triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
          const seq = nextSystemMessageSeq(args.G);
          appendChat(args.G, {
            type: 'system',
            text: buildScandalSystemMessage(seq, getPlayerLabel(args.G, playerID), card, targetSummaries),
          });
          args.G.discard.push(card);
          autoPlayed = true;
        } else {
          hand.push(card);
        }
      }
      syncPlayerState(args.G, playerID);
      args.events?.setStage(autoPlayed ? END_STAGE : PLAY_STAGE);
      return undefined;
    },
    playCard: (
      args,
      cardId: string,
      replacementResources: ResourceKey[] = [],
      targetPlayerID?: string,
    ) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const usingExtraToken = (args.G.extraHandPlayTokens[playerID] ?? 0) > 0;
      if (!usingExtraToken) {
        if (args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
        if (args.ctx.activePlayers?.[playerID] !== PLAY_STAGE) return INVALID_MOVE;
      }

      const hand = args.G.hands[playerID];
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx === -1) return INVALID_MOVE;

      const card = hand[idx];
      const allPlayerIDs = Object.keys(args.G.players);
      const applySoftTo = (pid: string) => {
        const summary = applyCardEffectsSoft(args.G, pid, card.effects);
        syncPlayerState(args.G, pid);
        return summary;
      };

      if (card.category === 'LYAP') {
        if (!targetPlayerID || targetPlayerID === playerID || !(targetPlayerID in args.G.players)) {
          return INVALID_MOVE;
        }
        const protectedTarget = isProtectedFromLyapScandal(args.G, args.ctx, targetPlayerID);
        const summary = protectedTarget ? { resources: {}, rank: 0 } : applySoftTo(targetPlayerID);
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: protectedTarget
            ? `🛡️ [${seq}] ${getPlayerLabel(args.G, playerID)} розіграв ЛЯП «${card.title}» на ${getPlayerLabel(args.G, targetPlayerID)}, але щит від Грамоти скасував дію.`
            : buildPlayedLyapSystemMessage(
              seq,
              getPlayerLabel(args.G, playerID),
              getPlayerLabel(args.G, targetPlayerID),
              card,
              summary,
            ),
        });
      } else if (card.category === 'SCANDAL') {
        const targetSummaries: string[] = [];
        allPlayerIDs
          .filter((pid) => pid !== playerID)
          .forEach((pid) => {
            if (isProtectedFromLyapScandal(args.G, args.ctx, pid)) {
              targetSummaries.push(`${getPlayerLabel(args.G, pid)}: щит від Грамоти (без змін)`);
              return;
            }
            const summary = applySoftTo(pid);
            targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
          });
        triggerSukhpayZsuOnScandal(args.G, args.ctx, playerID);
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildPlayedScandalSystemMessage(seq, getPlayerLabel(args.G, playerID), card, targetSummaries),
        });
      } else if (card.category === 'SUPPORT') {
        const beforeResources = { ...args.G.resources[playerID] };
        const beforeRankId = args.G.ranks[playerID];
        try {
          const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
          if (!applied) return INVALID_MOVE;
        } catch {
          return INVALID_MOVE;
        }
        const summary = summarizeAppliedDiff(
          beforeResources,
          args.G.resources[playerID],
          beforeRankId,
          args.G.ranks[playerID],
        );
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildSupportSystemMessage(seq, getPlayerLabel(args.G, playerID), card, summary),
        });
      } else if (card.category === 'DECISION') {
        const targetSummaries: string[] = [];
        let invalidDecisionReplacement = false;
        allPlayerIDs.forEach((pid) => {
          if (invalidDecisionReplacement) return;
          if (pid === playerID) {
            const beforeResources = { ...args.G.resources[playerID] };
            const beforeRankId = args.G.ranks[playerID];
            try {
              const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
              if (!applied) {
                invalidDecisionReplacement = true;
                return;
              }
            } catch {
              invalidDecisionReplacement = true;
              return;
            }
            const summary = summarizeAppliedDiff(
              beforeResources,
              args.G.resources[playerID],
              beforeRankId,
              args.G.ranks[playerID],
            );
            targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
            syncPlayerState(args.G, pid);
            return;
          }
          const summary = applySoftTo(pid);
          targetSummaries.push(`${getPlayerLabel(args.G, pid)}: ${effectSummaryToText(summary)}`);
        });
        if (invalidDecisionReplacement) return INVALID_MOVE;
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildPlayedDecisionSystemMessage(seq, getPlayerLabel(args.G, playerID), card, targetSummaries),
        });
      } else if (card.category === 'VVNZ' && card.grantRank) {
        const beforeResources = { ...args.G.resources[playerID] };
        const beforeRankId = args.G.ranks[playerID];
        const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
        const promoted = promoteToSpecificRank(args.G, playerID, card.grantRank, playerCount);
        if (!promoted.ok) return INVALID_MOVE;
        try {
          const applied = applyCardEffects(args.G, playerID, card.effects, []);
          if (!applied) return INVALID_MOVE;
        } catch {
          return INVALID_MOVE;
        }
        const afterRankId = args.G.ranks[playerID];
        const summary = summarizeAppliedDiff(
          beforeResources,
          args.G.resources[playerID],
          beforeRankId,
          afterRankId,
        );
        const seq = nextSystemMessageSeq(args.G);
        appendChat(args.G, {
          type: 'system',
          text: buildVvnzRankSystemMessage(
            seq,
            getPlayerLabel(args.G, playerID),
            card,
            beforeRankId,
            afterRankId,
            promoted.rank.cost ?? {},
            promoted.rank.bonus ?? {},
            summary,
          ),
        });
      } else {
        try {
          const applied = applyCardEffects(args.G, playerID, card.effects, replacementResources);
          if (!applied) return INVALID_MOVE;
        } catch {
          return INVALID_MOVE;
        }
      }

      hand.splice(idx, 1);
      args.G.discard.push(card);

      while (hand.length > HAND_LIMIT) {
        const overflow = hand.shift();
        if (overflow) args.G.discard.push(overflow);
      }

      syncPlayerState(args.G, playerID);
      if (usingExtraToken) {
        args.G.extraHandPlayTokens[playerID] = Math.max(0, (args.G.extraHandPlayTokens[playerID] ?? 0) - 1);
      } else {
        args.events?.setStage(END_STAGE);
      }
      return undefined;
    },
    playLegendaryCard: (args, cardId: string, targetPlayerID?: string, selectedResource?: ResourceKey) => {
      const playerID = args.playerID;
      if (!playerID) return INVALID_MOVE;
      const hand = args.G.legendaryHands[playerID] ?? [];
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx === -1) return INVALID_MOVE;
      const card = hand[idx];
      const playerLabel = getPlayerLabel(args.G, playerID);
      let specialMessage = '';

      if (card.id === 'legendary-02') {
        const canceled = cancelLastLyapOrScandalForPlayer(args.G, playerID);
        if (canceled.canceledCard) {
          specialMessage = `Сміх Буданова скасував для ${playerLabel} дію «${canceled.canceledCard.title}»: ${effectSummaryToText(canceled.summary)}.`;
        } else {
          specialMessage = `Сміх Буданова не знайшов ЛЯП/СКАНДАЛ для скасування у скиді.`;
        }
      } else if (card.id === 'legendary-08') {
        const canceled = cancelLastScandalForPlayer(args.G, playerID);
        if (canceled.canceledCard) {
          specialMessage = `«Старлінк» скасував для ${playerLabel} дію скандалу «${canceled.canceledCard.title}»: ${effectSummaryToText(canceled.summary)}.`;
        } else {
          specialMessage = `«Старлінк» не знайшов скандалу для скасування у скиді.`;
        }
      } else if (card.id === 'legendary-05') {
        const untilTurn = computeShieldUntilNextOwnTurn(args.ctx, playerID);
        args.G.sukhpayZsuWatchUntilTurn[playerID] = untilTurn;
        args.G.sukhpayZsuPendingBonus[playerID] = true;
        specialMessage = `«Сухпай ЗСУ» активовано: якщо до наступного ходу ${playerLabel} хтось розіграє СКАНДАЛ, ${playerLabel} отримає +1 Дисципліна.`;
      } else if (card.id === 'legendary-12') {
        const untilTurn = computeShieldUntilNextOwnTurn(args.ctx, playerID);
        args.G.lyapScandalShieldUntilTurn[playerID] = untilTurn;
        specialMessage = `Грамота активувала щит від ЛЯП/СКАНДАЛ до початку наступного ходу ${playerLabel}.`;
      } else if (card.id === 'legendary-03') {
        args.G.extraHandPlayTokens[playerID] = (args.G.extraHandPlayTokens[playerID] ?? 0) + 1;
        specialMessage = `«Посмішка Малюка» дозволяє ${playerLabel} негайно розіграти ще 1 карту з руки. Після цього хід лишається за поточним гравцем.`;
      } else if (card.id === 'legendary-06') {
        if (!selectedResource || !resourceKeys.includes(selectedResource)) return INVALID_MOVE;
        args.G.resources[playerID][selectedResource] = (args.G.resources[playerID][selectedResource] ?? 0) + 3;
        Object.keys(args.G.players)
          .filter((pid) => pid !== playerID)
          .forEach((pid) => {
            args.G.resources[pid].documents = (args.G.resources[pid].documents ?? 0) + 1;
            clampNonNegativeResources(args.G.resources[pid]);
            syncPlayerState(args.G, pid);
          });
        clampNonNegativeResources(args.G.resources[playerID]);
        syncPlayerState(args.G, playerID);
        specialMessage = `«Статуя Святого ТОРа» дала ${playerLabel} +3 ${resourceLabelsUk[selectedResource]}, а решті гравців +1 Документи.`;
      } else if (card.id === 'legendary-07') {
        args.G.resources[playerID].time = (args.G.resources[playerID].time ?? 0) + 2;
        args.G.resources[playerID].reputation = (args.G.resources[playerID].reputation ?? 0) + 2;
        Object.keys(args.G.players)
          .filter((pid) => pid !== playerID)
          .forEach((pid) => {
            args.G.resources[pid].reputation = Math.max(0, (args.G.resources[pid].reputation ?? 0) - 1);
            clampNonNegativeResources(args.G.resources[pid]);
            syncPlayerState(args.G, pid);
          });
        clampNonNegativeResources(args.G.resources[playerID]);
        syncPlayerState(args.G, playerID);
        specialMessage = `«Церква Святого Лідерства»: ${playerLabel} отримує +2 Час, +2 Авторитет; інші гравці втрачають 1 Авторитет.`;
      } else if (card.id === 'legendary-09') {
        if (!selectedResource || !resourceKeys.includes(selectedResource)) return INVALID_MOVE;
        const before = args.G.resources[playerID][selectedResource] ?? 0;
        const after = Math.max(before, 3);
        args.G.resources[playerID][selectedResource] = after;
        syncPlayerState(args.G, playerID);
        specialMessage = after > before
          ? `«Вода “Прозора”» відновила ресурс ${resourceLabelsUk[selectedResource]} для ${playerLabel}: ${before} → ${after}.`
          : `«Вода “Прозора”» не змінила ${resourceLabelsUk[selectedResource]} для ${playerLabel}: вже ${before}.`;
      } else if (card.id === 'legendary-13') {
        const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
        const granted = grantSpecificRankIgnoringRequirements(args.G, playerID, 'senior_lieutenant', playerCount);
        if (!granted.ok) return INVALID_MOVE;
        if (granted.applied) {
          specialMessage = `«Хороший прес-офіцер» присвоює ${playerLabel} звання ${rankNameById('senior_lieutenant')} без перевірки вимог. Бонус звання застосовано: ${resourceDeltaToText(granted.rank.bonus ?? {})}.`;
        } else {
          specialMessage = `«Хороший прес-офіцер» не змінює звання: у ${playerLabel} вже ${rankNameById(args.G.ranks[playerID])} або вище.`;
        }
      } else if (card.id === 'legendary-10') {
        if (!targetPlayerID || !(targetPlayerID in args.G.players) || targetPlayerID === playerID) return INVALID_MOVE;
        const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
        const demoted = demoteByOneRankWithSeatCheck(args.G, targetPlayerID, playerCount);
        if (!demoted.ok) return INVALID_MOVE;
        specialMessage = `«Дрончик» знизив звання ${getPlayerLabel(args.G, targetPlayerID)}: ${rankNameById(demoted.fromRankId)} → ${rankNameById(demoted.toRankId)}.`;
      }

      try {
        const applied = applyCardEffects(args.G, playerID, card.effects, []);
        if (!applied) return INVALID_MOVE;
      } catch {
        return INVALID_MOVE;
      }

      hand.splice(idx, 1);
      args.G.legendaryDiscard.push(card);
      syncPlayerState(args.G, playerID);
      const seq = nextSystemMessageSeq(args.G);
      appendChat(args.G, {
        type: 'system',
        text: specialMessage
          ? `🃏 [${seq}] ${playerLabel} розіграв легендарну карту «${card.title}». ${specialMessage}`
          : `🃏 [${seq}] ${playerLabel} розіграв легендарну карту «${card.title}».`,
      });
      return undefined;
    },
    promote: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (args.ctx.activePlayers?.[playerID] !== PLAY_STAGE) return INVALID_MOVE;
      if (args.G.promotedThisTurn[playerID]) return INVALID_MOVE;
      const beforeResources = { ...args.G.resources[playerID] };
      const beforeRankId = args.G.ranks[playerID];
      const playerCount = Object.keys(args.G.players).length || Number(args.ctx.numPlayers ?? 0) || 2;
      if (!promoteRank(args.G, playerID, playerCount)) return INVALID_MOVE;
      args.G.promotedThisTurn[playerID] = true;
      const afterRankId = args.G.ranks[playerID];
      const promotedRank = getActiveRanks().find((row) => row.id === afterRankId);
      const summary = summarizeAppliedDiff(
        beforeResources,
        args.G.resources[playerID],
        beforeRankId,
        afterRankId,
      );
      const seq = nextSystemMessageSeq(args.G);
      appendChat(args.G, {
        type: 'system',
        text: buildPromotionSystemMessage(
          seq,
          getPlayerLabel(args.G, playerID),
          beforeRankId,
          afterRankId,
          promotedRank?.cost ?? {},
          promotedRank?.bonus ?? {},
          summary,
        ),
      });
      return undefined;
    },
    pass: (args) => {
      const playerID = args.playerID;
      if (!playerID || args.ctx.currentPlayer !== playerID) return INVALID_MOVE;
      if (![PLAY_STAGE, END_STAGE].includes(args.ctx.activePlayers?.[playerID] as string)) return INVALID_MOVE;
      args.events?.endTurn();
      return undefined;
    },
  },
  endIf: ({ G }) => {
    const winner = getWinner(G);
    if (!winner) return undefined;
    return { winner };
  },
  ai: {
    enumerate: (G, ctx, playerID) => {
      const currentPlayer = playerID ?? ctx.currentPlayer;
      const hand = G.hands[currentPlayer] ?? [];
      const legendaryHand = G.legendaryHands[currentPlayer] ?? [];
      const stage = ctx.activePlayers?.[currentPlayer];
      if (stage === DRAW_STAGE) {
        return [
          { move: 'drawCard' as const },
          ...legendaryHand.map((card) => ({ move: 'playLegendaryCard' as const, args: [card.id] })),
        ];
      }
      if (stage === END_STAGE) {
        return [
          { move: 'pass' as const },
          ...legendaryHand.map((card) => ({ move: 'playLegendaryCard' as const, args: [card.id] })),
        ];
      }
      return [
        ...legendaryHand.map((card) => ({ move: 'playLegendaryCard' as const, args: [card.id] })),
        ...hand.map((card) => ({ move: 'playCard' as const, args: [card.id] })),
        { move: 'promote' as const },
        { move: 'pass' as const },
      ];
    },
  },
  playerView: ({ G, ctx, playerID }) => {
    if (!playerID) return G;
    const filteredHands: JojGameState['hands'] = {};
    const filteredLegendaryHands: JojGameState['legendaryHands'] = {};
    Object.entries(G.hands as Record<string, CardDefinition[]>).forEach(([pid, cards]) => {
      filteredHands[pid] = pid === playerID ? cards : cards.map(({ id, title, category, image, effects, flavor }) => ({
        id,
        title,
        category,
        image,
        effects,
        flavor,
      }));
    });
    Object.entries(G.legendaryHands as Record<string, CardDefinition[]>).forEach(([pid, cards]) => {
      filteredLegendaryHands[pid] = pid === playerID ? cards : cards.map(({ id, title, category, image, effects, flavor }) => ({
        id,
        title,
        category,
        image,
        effects,
        flavor,
      }));
    });
    const filteredPlayers: JojGameState['players'] = {};
    Object.entries(G.players).forEach(([pid, state]) => {
      filteredPlayers[pid] = {
        ...state,
        hand: filteredHands[pid],
      };
    });

    return {
      ...G,
      players: filteredPlayers,
      hands: filteredHands,
      legendaryHands: filteredLegendaryHands,
      deck: ctx.gameover ? G.deck : new Array(G.deck.length).fill({ id: 'hidden', title: 'Hidden', category: 'NEUTRAL' }),
    };
  },
};

export type JojCtx = Ctx;
