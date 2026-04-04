import { cardTitlesEnById, cardTitlesUk, defaultCardTitlesEnById } from '../i18n-data';
import { CARD_ASSET_BASE_PATH } from '../../game/imagePaths';
import type { CardDefinition, JojGameState } from '../../game/types';

const extractQuotedCardTitle = (text: string) => {
  const quoted = text.match(/«([^»]+)»/);
  return quoted?.[1]?.trim() || '';
};

const appendCardTitleVariants = (
  index: Map<string, string>,
  card: Pick<CardDefinition, 'id' | 'title'> | null | undefined,
) => {
  if (!card?.id) return;
  const values = new Set<string>([
    card.title,
    cardTitlesUk[card.id],
    cardTitlesEnById[card.id],
    defaultCardTitlesEnById[card.id],
  ].filter((value): value is string => Boolean(value?.trim())));
  values.forEach((value) => {
    index.set(value.trim().toLowerCase(), card.id);
  });
};

export const extractPlaybackCardTitle = (text: string) => extractQuotedCardTitle(text);

export const resolvePlaybackCardMeta = (args: {
  eventText: string;
  G: JojGameState;
  cardImageById: Record<string, string>;
  lastDiscard?: CardDefinition | null;
  lastDiscardImage?: string;
}) => {
  const title = extractQuotedCardTitle(args.eventText);
  if (!title) return { title: '', imageSrc: undefined as string | undefined };

  const normalizedTitle = title.toLowerCase();
  const titleIndex = new Map<string, string>();
  appendCardTitleVariants(titleIndex, args.lastDiscard ?? null);

  const allKnownCards = [
    ...(args.G.discard ?? []),
    ...(args.G.legendaryDiscard ?? []),
    ...Object.values(args.G.hands ?? {}).flat(),
    ...Object.values(args.G.legendaryHands ?? {}).flat(),
    ...(args.G.pendingDrawAutoResolution?.card ? [args.G.pendingDrawAutoResolution.card] : []),
  ];
  allKnownCards.forEach((card) => appendCardTitleVariants(titleIndex, card));

  const matchedId = titleIndex.get(normalizedTitle);
  if (matchedId && args.cardImageById[matchedId]) {
    return {
      title,
      imageSrc: args.cardImageById[matchedId],
    };
  }
  if (matchedId) {
    return {
      title,
      imageSrc: `${CARD_ASSET_BASE_PATH}${matchedId}.png`,
    };
  }

  for (const [cardId, localizedTitle] of Object.entries(cardTitlesUk)) {
    if (localizedTitle?.trim().toLowerCase() === normalizedTitle) {
      return {
        title,
        imageSrc: args.cardImageById[cardId] || `${CARD_ASSET_BASE_PATH}${cardId}.png`,
      };
    }
  }
  for (const [cardId, localizedTitle] of Object.entries(cardTitlesEnById)) {
    if (localizedTitle?.trim().toLowerCase() === normalizedTitle) {
      return {
        title,
        imageSrc: args.cardImageById[cardId] || `${CARD_ASSET_BASE_PATH}${cardId}.png`,
      };
    }
  }
  for (const [cardId, localizedTitle] of Object.entries(defaultCardTitlesEnById)) {
    if (localizedTitle?.trim().toLowerCase() === normalizedTitle) {
      return {
        title,
        imageSrc: args.cardImageById[cardId] || `${CARD_ASSET_BASE_PATH}${cardId}.png`,
      };
    }
  }

  if (args.lastDiscard && (
    args.lastDiscard.title.trim().toLowerCase() === normalizedTitle
    || cardTitlesUk[args.lastDiscard.id]?.trim().toLowerCase() === normalizedTitle
    || cardTitlesEnById[args.lastDiscard.id]?.trim().toLowerCase() === normalizedTitle
    || defaultCardTitlesEnById[args.lastDiscard.id]?.trim().toLowerCase() === normalizedTitle
  )) {
    return {
      title,
      imageSrc: args.lastDiscardImage,
    };
  }

  return { title, imageSrc: undefined as string | undefined };
};
