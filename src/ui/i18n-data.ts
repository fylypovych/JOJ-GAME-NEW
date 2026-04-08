import { ui } from './i18n-data-ui';
export { ui };

export const ranksById = {
  cadet: { uk: 'Кадет', en: 'Cadet' },
  lieutenant: { uk: 'Лейтенант', en: 'Lieutenant' },
  captain: { uk: 'Капітан', en: 'Captain' },
  major: { uk: 'Майор', en: 'Major' },
  colonel: { uk: 'Полковник', en: 'Colonel' },
  general: { uk: 'Генерал', en: 'General' },
} as const;

export const categories = {
  LYAP: { uk: 'ЛЯП', en: 'LYAP' },
  SCANDAL: { uk: 'СКАНДАЛ', en: 'SCANDAL' },
  SUPPORT: { uk: 'ПІДТРИМКА', en: 'SUPPORT' },
  COMMAND: { uk: 'РІШЕННЯ', en: 'COMMAND' },
  VVNZ: { uk: 'ВВНЗ', en: 'VVNZ' },
  LEGENDARY: { uk: 'ЛЕГЕНДАРНА', en: 'LEGENDARY' },
  RANK: { uk: 'Звання', en: 'Ranks' },
} as const;

// Legacy local title dictionaries were a second source of truth and caused stale names to leak into UI.
// Card titles should now come from the actual card data loaded in shared config.
export const cardTitlesUk: Record<string, string> = {};

export const defaultCardTitlesEnById: Record<string, string> = {};

export const cardTitlesEnById: Record<string, string> = {};


