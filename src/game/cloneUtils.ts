import { normalizeImagePath } from './imagePaths';
import type { CardDefinition, RankDefinition } from './types';

export const cloneCard = (card: CardDefinition): CardDefinition => ({
  ...card,
  cost: card.cost ? { ...card.cost } : undefined,
  image: normalizeImagePath(card.image),
  grantRank: typeof card.grantRank === 'string' ? card.grantRank : undefined,
  effects: card.effects?.map((effect) => ({ ...effect })),
});

export const cloneRank = (rank: RankDefinition): RankDefinition => ({
  ...rank,
  requirement: { ...rank.requirement },
  cost: { ...rank.cost },
  bonus: { ...rank.bonus },
  image: normalizeImagePath(rank.image),
  imageVariants: Array.isArray(rank.imageVariants)
    ? rank.imageVariants.map((path) => normalizeImagePath(path)).filter((path): path is string => Boolean(path))
    : undefined,
  victory: rank.victory === true ? true : undefined,
  flavor: typeof rank.flavor === 'string' ? rank.flavor : undefined,
});
