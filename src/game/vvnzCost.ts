import type { ResourceKey } from './types';

export const VVNZ_PLAY_COST = 2;

const vvznSpendPriority = (key: ResourceKey) => (key === 'time' ? 1 : 0);

export const countAvailableResources = (resources: Record<ResourceKey, number>): number =>
  (Object.values(resources) as number[]).reduce((sum, value) => sum + Math.max(0, value ?? 0), 0);

export const canAffordVvnzCost = (resources: Record<ResourceKey, number>): boolean =>
  countAvailableResources(resources) >= VVNZ_PLAY_COST;

export const isValidVvnzPayment = (
  resources: Record<ResourceKey, number>,
  selected: ResourceKey[],
): boolean => {
  if (selected.length !== VVNZ_PLAY_COST) return false;
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
  const pool = { ...resources };
  const selected: ResourceKey[] = [];
  while (selected.length < VVNZ_PLAY_COST) {
    const pick = (Object.keys(pool) as ResourceKey[])
      .filter((key) => (pool[key] ?? 0) > 0)
      .sort((a, b) => {
        const priorityDiff = vvznSpendPriority(a) - vvznSpendPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        const amountDiff = (pool[b] ?? 0) - (pool[a] ?? 0);
        if (amountDiff !== 0) return amountDiff;
        return a.localeCompare(b);
      })[0];
    if (!pick) return null;
    pool[pick] -= 1;
    selected.push(pick);
  }
  return selected;
};

export const spendVvnzPayment = (
  resources: Record<ResourceKey, number>,
  selected: ResourceKey[],
) => {
  selected.forEach((key) => {
    resources[key] = Math.max(0, (resources[key] ?? 0) - 1);
  });
};
