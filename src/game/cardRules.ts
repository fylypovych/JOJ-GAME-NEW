import type { CardDefinition } from './types';

export const isCommandCategory = (card: CardDefinition): boolean => {
  const rawCategory = (card as unknown as { category?: string }).category;
  return rawCategory === 'COMMAND' || rawCategory === 'DECISION';
};

export type CardPlayBehavior =
  | 'lyap'
  | 'scandal'
  | 'support'
  | 'command'
  | 'vvnz'
  | 'legendary'
  | 'generic';

export const getCardPlayBehavior = (card: CardDefinition): CardPlayBehavior => {
  if (card.category === 'LYAP') return 'lyap';
  if (card.category === 'SCANDAL') return 'scandal';
  if (card.category === 'SUPPORT') return 'support';
  if (isCommandCategory(card)) return 'command';
  if (card.category === 'VVNZ' && card.grantRank) return 'vvnz';
  if (card.category === 'LEGENDARY') return 'legendary';
  return 'generic';
};

export const cardNeedsTargetSelection = (card: CardDefinition): boolean =>
  getCardPlayBehavior(card) === 'lyap' || card.id === 'legendary-10';

export const cardNeedsResourceSelection = (card: CardDefinition): boolean =>
  card.id === 'legendary-06' ||
  card.id === 'legendary-09' ||
  card.id === 'legendary-17';

export const cardNeedsMultiTargetReplacement = (
  card: CardDefinition,
): boolean => getCardPlayBehavior(card) === 'scandal';
