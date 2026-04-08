/**
 * I18n keys for action validation messages
 * Separates domain logic from UI/text concerns
 */

export const actionValidationKeys = {
  promote: {
    alreadyPromotedThisTurn: 'promote.alreadyPromotedThisTurn',
    noNextRank: 'promote.noNextRank',
    playerResourcesUnavailable: 'promote.playerResourcesUnavailable',
    missingRequirements: 'promote.missingRequirements',
    missingCost: 'promote.missingCost',
    noFreeSeat: 'promote.noFreeSeat',
  },
  vvnz: {
    alreadyPromotedThisTurn: 'vvnz.alreadyPromotedThisTurn',
    noGrantRank: 'vvnz.noGrantRank',
    resourcesNotLoaded: 'vvnz.resourcesNotLoaded',
    unknownTargetRank: 'vvnz.unknownTargetRank',
    rankNotLower: 'vvnz.rankNotLower',
    missingRequirements: 'vvnz.missingRequirements',
    missingCost: 'vvnz.missingCost',
    noFreeSeat: 'vvnz.noFreeSeat',
  },
  handCard: {
    notYourTurn: 'handCard.notYourTurn',
    notDrawStage: 'handCard.notDrawStage',
    cardNotInHand: 'handCard.cardNotInHand',
    cannotAfford: 'handCard.cannotAfford',
    needTargetSelection: 'handCard.needTargetSelection',
    cannotPlayNow: 'handCard.cannotPlayNow',
  },
} as const;

// Type for all valid translation keys
export type ActionValidationKey =
  | typeof actionValidationKeys.promote
  | typeof actionValidationKeys.handCard[keyof typeof actionValidationKeys.handCard];

// Simple translator type that accepts a key and optional params
export type ActionTranslator = (
  key: string,
  params?: Record<string, string | number>
) => string;

// Default fallback translator (returns key if no translation found)
export const defaultTranslator: ActionTranslator = (key, params) => {
  // Simple interpolation: replace {paramName} with value
  let result = key;
  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
    });
  }
  return result;
};
