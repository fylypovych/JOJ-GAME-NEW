import { ui } from './i18n-data-ui';
export { ui };

export const ranksById = {
  // Soldier ranks (3)
  recruit: { uk: 'Рекрут', en: 'Recruit' },
  soldier: { uk: 'Солдат', en: 'Soldier' },
  senior_soldier: { uk: 'Старший солдат', en: 'Senior Soldier' },
  // Sergeant ranks (9)
  junior_sergeant: { uk: 'Молодший сержант', en: 'Junior Sergeant' },
  sergeant: { uk: 'Сержант', en: 'Sergeant' },
  senior_sergeant: { uk: 'Старший сержант', en: 'Senior Sergeant' },
  chief_sergeant: { uk: 'Головний сержант', en: 'Chief Sergeant' },
  staff_sergeant: { uk: 'Штаб-сержант', en: 'Staff Sergeant' },
  master_sergeant: { uk: 'Майстер-сержант', en: 'Master Sergeant' },
  senior_master_sergeant: { uk: 'Старший майстер-сержант', en: 'Senior Master Sergeant' },
  chief_master_sergeant: { uk: 'Головний майстер-сержант', en: 'Chief Master Sergeant' },
  // Officer ranks (10)
  junior_lieutenant: { uk: 'Молодший лейтенант', en: 'Junior Lieutenant' },
  lieutenant: { uk: 'Лейтенант', en: 'Lieutenant' },
  senior_lieutenant: { uk: 'Старший лейтенант', en: 'Senior Lieutenant' },
  captain: { uk: 'Капітан', en: 'Captain' },
  major: { uk: 'Майор', en: 'Major' },
  lieutenant_colonel: { uk: 'Підполковник', en: 'Lieutenant Colonel' },
  colonel: { uk: 'Полковник', en: 'Colonel' },
  brigadier_general: { uk: 'Бригадний генерал', en: 'Brigadier General' },
  major_general: { uk: 'Генерал-майор', en: 'Major General' },
  lieutenant_general: { uk: 'Генерал-лейтенант', en: 'Lieutenant General' },
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


