import type { CardDefinition, ResourceKey } from '../../game/types';

export const buildReplacementSlots = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): { slots: ResourceKey[]; poolAfterDirect: Record<ResourceKey, number> } => {
  const tmp = { ...resources };
  const slots: ResourceKey[] = [];
  (effects ?? []).forEach((effect) => {
    if (effect.resource === 'rank' || effect.value >= 0) return;
    const need = Math.abs(effect.value);
    const have = Math.max(0, tmp[effect.resource] ?? 0);
    const direct = Math.min(have, need);
    tmp[effect.resource] = have - direct;
    let missing = need - direct;
    while (missing > 0) {
      slots.push(effect.resource);
      slots.push(effect.resource);
      missing -= 1;
    }
  });
  return { slots, poolAfterDirect: tmp };
};

export const isReplacementPrefixValid = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
  selected: ResourceKey[],
): boolean => {
  const { slots, poolAfterDirect } = buildReplacementSlots(resources, effects);
  if (selected.length > slots.length) return false;
  const pool = { ...poolAfterDirect };
  for (let index = 0; index < selected.length; index += 1) {
    const forbidden = slots[index];
    const chosen = selected[index];
    if (chosen === forbidden) return false;
    if ((pool[chosen] ?? 0) <= 0) return false;
    pool[chosen] -= 1;
  }
  return true;
};

export const hasFeasibleReplacementPlan = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): boolean => {
  const tmp = { ...resources };
  for (const effect of effects ?? []) {
    if (effect.resource === 'rank' || effect.value >= 0) continue;
    const need = Math.abs(effect.value);
    const have = Math.max(0, tmp[effect.resource] ?? 0);
    const direct = Math.min(have, need);
    tmp[effect.resource] = have - direct;
    let missing = need - direct;
    while (missing > 0) {
      for (let i = 0; i < 2; i += 1) {
        const candidates = Object.keys(tmp)
          .filter((key): key is ResourceKey => key !== effect.resource && (tmp[key as ResourceKey] ?? 0) > 0)
          .sort((a, b) => (tmp[b] ?? 0) - (tmp[a] ?? 0));
        const pick = candidates[0];
        if (!pick) return false;
        tmp[pick] -= 1;
      }
      missing -= 1;
    }
  }
  return true;
};

export const getRequiredReplacementSelectionCount = (
  resources: Record<ResourceKey, number>,
  effects: CardDefinition['effects'],
): number => {
  const { slots } = buildReplacementSlots(resources, effects);
  if (slots.length === 0) return 0;
  return hasFeasibleReplacementPlan(resources, effects) ? slots.length : 0;
};
