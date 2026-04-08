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

// Default fallback translator (returns human-readable text for backward compatibility)
const ukTranslations: Record<string, string> = {
  [actionValidationKeys.promote.alreadyPromotedThisTurn]: 'Ви вже підвищувалися цього ходу.',
  [actionValidationKeys.promote.noNextRank]: 'Немає наступного звання для підвищення.',
  [actionValidationKeys.promote.playerResourcesUnavailable]: 'Ресурси гравця недоступні.',
  [actionValidationKeys.promote.missingRequirements]: 'До звання «{rankName}» бракує: {missing}',
  [actionValidationKeys.promote.missingCost]: 'Для підвищення до «{rankName}» бракує вартості: {missing}',
  [actionValidationKeys.promote.noFreeSeat]: 'Немає вільного місця на званні «{rankName}» (ліміт: {seatLimit})',
  [actionValidationKeys.vvnz.alreadyPromotedThisTurn]: 'Цього ходу ви вже отримували підвищення.',
  [actionValidationKeys.vvnz.noGrantRank]: 'Для цієї ВВНЗ-карти не задано цільове звання (grantRank).',
  [actionValidationKeys.vvnz.resourcesNotLoaded]: 'Стан ресурсів ще не завантажено.',
  [actionValidationKeys.vvnz.unknownTargetRank]: 'Невідоме цільове звання: {rankId}',
  [actionValidationKeys.vvnz.rankNotLower]: 'Карта дає звання «{rankName}», але ваше поточне звання вже не нижче.',
  [actionValidationKeys.handCard.cannotPlayNow]: 'Цю карту зараз не можна розіграти.',
};

export const defaultTranslator: ActionTranslator = (key, params) => {
  // Get translation or fallback to key
  let result = ukTranslations[key] ?? key;
  // Simple interpolation: replace {paramName} with value
  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
    });
  }
  return result;
};
