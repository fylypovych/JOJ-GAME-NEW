export type Language = 'uk' | 'en';

import {
  cardTitlesEnById,
  cardTitlesUk,
  categories,
  defaultCardTitlesEnById,
  ranksById,
} from './i18n-data';
import { uiUk } from './i18n/uk';
import { uiEn } from './i18n/en';

export const defaultLanguage: Language = 'uk';

export const text = (lang: Language) => (lang === 'uk' ? uiUk : uiEn);

export const rankLabel = (rankId: string, lang: Language): string =>
  ranksById[rankId as keyof typeof ranksById]?.[lang] ?? rankId;

export const categoryLabel = (category: string, lang: Language): string =>
  categories[category as keyof typeof categories]?.[lang] ?? category;

export const cardTitle = (cardId: string, fallback: string, lang: Language): string => {
  return cardTitleWithOverride(cardId, fallback, lang);
};

export const cardTitleWithOverride = (
  cardId: string,
  fallback: string,
  lang: Language,
  englishOverride?: string,
): string => {
  if (lang === 'en') return englishOverride?.trim() || cardTitlesEnById[cardId] || fallback;
  const defaultEn = defaultCardTitlesEnById[cardId];
  if (defaultEn && fallback === defaultEn) {
    return cardTitlesUk[cardId] ?? fallback;
  }
  return fallback;
};

export const cardFlavor = (
  fallback: string | undefined,
  lang: Language,
  englishOverride?: string,
): string => {
  if (!fallback) return '';
  if (lang === 'en') return englishOverride?.trim() || fallback;
  return fallback;
};

const systemMessageEnReplacements: Array<[RegExp, string]> = [
  [/\bЗвання\b/g, 'Rank'],
  [/\bВартість\b/g, 'Cost'],
  [/\bБонус\b/g, 'Bonus'],
  [/\bПідсумок\b/g, 'Total'],
  [/\bЕфект\b/g, 'Effect'],
  [/\bбез змін\b/g, 'no changes'],
  [/\bщит від Грамоти\b/g, 'Grammar shield'],
  [/\bЛЯП\b/g, 'LYAP'],
  [/\bСКАНДАЛ\b/g, 'SCANDAL'],
  [/\bПІДТРИМКА\b/g, 'SUPPORT'],
  [/\bРІШЕННЯ\b/g, 'COMMAND'],
  [/\bЛЕГЕНДАРНА\b/g, 'LEGENDARY'],
  [/\bЧас\b/g, 'Time'],
  [/\bАвторитет\b/g, 'Authority'],
  [/\bДисципліна\b/g, 'Discipline'],
  [/\bДокументи\b/g, 'Documents'],
  [/\bТехнології\b/g, 'Tech'],
  [/\bГравець\b/g, 'Player'],
  [/\bКому прилетіло\b/g, 'Affected'],
  [/\bПо столу\b/g, 'Table impact'],
  [/\bНаслідки для столу\b/g, 'Table consequences'],
  [/\bмінімальне звання\b/g, 'minimum rank'],
  [/\bмісця зайняті\b/g, 'seat blocked'],
];

const systemMessageUkReplacements: Array<[RegExp, string]> = [
  [/\bLYAP\b/g, 'ЛЯП'],
  [/\bSCANDAL\b/g, 'СКАНДАЛ'],
  [/\bSUPPORT\b/g, 'ПІДТРИМКА'],
  [/\bCOMMAND\b/g, 'РІШЕННЯ'],
  [/\bVVNZ\b/g, 'ВВНЗ'],
  [/\bLEGENDARY\b/g, 'ЛЕГЕНДАРНА'],
  [/\bRank\b/g, 'Звання'],
  [/\bCost\b/g, 'Вартість'],
  [/\bBonus\b/g, 'Бонус'],
  [/\bTotal\b/g, 'Підсумок'],
  [/\bEffect\b/g, 'Ефект'],
];

export const localizeSystemMessageText = (value: string, lang: Language): string => {
  if (!value) return value;

  // For Ukrainian language, translate English categories to Ukrainian
  if (lang === 'uk') {
    let next = value;
    for (const [pattern, replacement] of systemMessageUkReplacements) {
      next = next.replace(pattern, replacement);
    }
    return next;
  }

  // For English language, translate Ukrainian to English
  if (lang === 'en') {
    let next = value;
    for (const [pattern, replacement] of systemMessageEnReplacements) {
      next = next.replace(pattern, replacement);
    }
    return next;
  }

  return value;
};
