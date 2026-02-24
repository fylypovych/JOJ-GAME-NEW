export type Language = 'uk' | 'en';

import {
  cardTitlesUk,
  categories,
  defaultCardTitlesEnById,
  ranksById,
  ui,
} from './i18n-data';

export const defaultLanguage: Language = 'uk';

export const text = (lang: Language) => ui[lang];

export const rankLabel = (rankId: string, lang: Language): string =>
  ranksById[rankId as keyof typeof ranksById]?.[lang] ?? rankId;

export const categoryLabel = (category: string, lang: Language): string =>
  categories[category as keyof typeof categories]?.[lang] ?? category;

export const cardTitle = (cardId: string, fallback: string, lang: Language): string => {
  if (lang === 'en') return fallback;
  const defaultEn = defaultCardTitlesEnById[cardId];
  if (defaultEn && fallback === defaultEn) {
    return cardTitlesUk[cardId] ?? fallback;
  }
  return fallback;
};
