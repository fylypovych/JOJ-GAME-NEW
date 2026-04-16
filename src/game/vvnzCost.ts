import type { ResourceKey } from './types';

export const VVNZ_PLAY_COST = 2;

export const countAvailableVvnzTime = (resources: Record<ResourceKey, number>): number =>
  Math.max(0, resources.time ?? 0);

export const canAffordVvnzCost = (resources: Record<ResourceKey, number>): boolean =>
  countAvailableVvnzTime(resources) >= VVNZ_PLAY_COST;

export const isValidVvnzPayment = (
  resources: Record<ResourceKey, number>,
  selected: ResourceKey[],
): boolean => {
  if (selected.length !== VVNZ_PLAY_COST) return false;
  if (selected.some((key) => key !== 'time')) return false;
  const pool = { ...resources };
  for (const key of selected) {
    if ((pool[key] ?? 0) <= 0) return false;
    pool[key] -= 1;
  }
  return true;
};

export const selectVvnzPaymentResources = (
  resources: Record<ResourceKey, number>,
): ResourceKey[] | null => {
  if (!canAffordVvnzCost(resources)) return null;
  return ['time', 'time'];
};

export const spendVvnzPayment = (
  resources: Record<ResourceKey, number>,
  selected: ResourceKey[],
) => {
  selected.forEach((key) => {
    resources[key] = Math.max(0, (resources[key] ?? 0) - 1);
  });
};
