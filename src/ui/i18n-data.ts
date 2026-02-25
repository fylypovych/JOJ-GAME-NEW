import { ui } from './i18n-data-ui';
export { ui };

export const ranksById = {
  cadet: { uk: 'Кадет', en: 'Cadet' },
  captain: { uk: 'Капітан', en: 'Captain' },
  colonel: { uk: 'Полковник', en: 'Colonel' },
  general: { uk: 'Генерал', en: 'General' },
} as const;

export const categories = {
  LYAP: { uk: 'ЛЯП', en: 'LYAP' },
  SCANDAL: { uk: 'СКАНДАЛ', en: 'SCANDAL' },
  SUPPORT: { uk: 'ПІДТРИМКА', en: 'SUPPORT' },
  DECISION: { uk: 'РІШЕННЯ', en: 'DECISION' },
  NEUTRAL: { uk: 'НЕЙТРАЛЬНА', en: 'NEUTRAL' },
  VVNZ: { uk: 'ВВНЗ', en: 'VVNZ' },
  LEGENDARY: { uk: 'ЛЕГЕНДАРНА', en: 'LEGENDARY' },
} as const;

export const cardTitlesUk: Record<string, string> = {
  'lyap-01': 'Помилка в протоколі',
  'scandal-01': 'Злитий меморандум',
  'support-01': 'Тихий союзник',
  'decision-01': 'Надзвичайний указ',
  'neutral-01': 'Кавова перерва',
  'vvnz-01': 'Директива ВВНЗ',
  'lyap-02': 'Затриманий підпис',
  'support-02': 'Польовий звіт',
  'scandal-02': 'Викривач',
  'decision-02': 'Кабінетне голосування',
  'legendary-01': 'Залізний маршал',
  'legendary-02': 'Привид архіву',
  'legendary-03': 'Регент кризи',
  'legendary-04': 'Кумир публіки',
  'legendary-05': 'Архітектор системи',
};

export const defaultCardTitlesEnById: Record<string, string> = {
  'lyap-01': 'Protocol Slip',
  'scandal-01': 'Leaked Memo',
  'support-01': 'Quiet Ally',
  'decision-01': 'Emergency Decree',
  'neutral-01': 'Coffee Break',
  'vvnz-01': 'VVNZ Directive',
  'lyap-02': 'Delayed Signature',
  'support-02': 'Field Report',
  'scandal-02': 'Whistleblower',
  'decision-02': 'Cabinet Vote',
  'legendary-01': 'Iron Marshal',
  'legendary-02': 'Archive Ghost',
  'legendary-03': 'Crisis Regent',
  'legendary-04': 'Public Idol',
  'legendary-05': 'System Architect',
};

// Verified English overrides for cards whose current in-game names no longer match legacy base placeholders.
// Keep this list curated; do not auto-spread default placeholders here.
export const cardTitlesEnById: Record<string, string> = {
  'legendary-02': "Budanov's Laugh",
  'legendary-05': 'ZSU Ration Pack',
};


