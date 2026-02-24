export type Language = 'uk' | 'en';

import {
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
  if (lang === 'en') return fallback;
  const defaultEn = defaultCardTitlesEnById[cardId];
  if (defaultEn && fallback === defaultEn) {
    return cardTitlesUk[cardId] ?? fallback;
  }
  return fallback;
};
