import type { CardDefinition } from './types';

export const isCommandCategory = (card: CardDefinition): boolean => {
  const rawCategory = (card as unknown as { category?: string }).category;
  return rawCategory === 'COMMAND' || rawCategory === 'DECISION';
};
