import { useMemo } from 'react';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from '../../game/types';
import { cardTitle, rankLabel } from '../i18n';
import { isPlayAllowedForCard } from './handRules';
import { getNextRankSeatMeta } from './rankHints';

export const useBoardV2DerivedState = (args: {
  G: JojGameState;
  ctx: { gameover?: unknown };
  id: string;
  hand: CardDefinition[];
  legendaryHand: CardDefinition[];
  canPlay: boolean;
  canPlayHandCard: boolean;
  sharedRanks: RankDefinition[];
  resources: Record<ResourceKey, number>;
  resourceLabels: Record<ResourceKey, string>;
  lang: 'uk' | 'en';
  handFilter: 'all' | 'playable' | CardDefinition['category'];
  handSort: 'default' | 'playable' | 'category' | 'title';
  v2: Record<string, string>;
  endTurnLabel: string;
}) => {
  const { G, ctx, id, hand, legendaryHand, canPlay, canPlayHandCard, sharedRanks, resources, resourceLabels, lang, handFilter, handSort, v2, endTurnLabel } = args;

  const nextRankMeta = useMemo(() => getNextRankSeatMeta({ G, playerID: id, sharedRanks }), [G, id, sharedRanks]);
  const gameoverMeta = (ctx?.gameover ?? null) as { winner?: string; endReason?: string } | null;
  const winnerPlayerID = gameoverMeta?.winner ? String(gameoverMeta.winner) : '';
  const winnerRankId = winnerPlayerID ? (G?.ranks?.[winnerPlayerID] ?? '') : '';
  const winnerRankName = winnerRankId
    ? (sharedRanks.find((row) => row.id === winnerRankId)?.name ?? rankLabel(winnerRankId, lang))
    : '';
  const latestEvents = (G?.chat ?? []).filter((row) => row.type === 'system').reverse();

  const handCardsView = useMemo(() => {
    const withMeta = hand.map((card, index) => ({
      card,
      index,
      playable: isPlayAllowedForCard({
        card,
        canPlayHandCard,
        resources,
        G,
        playerID: id,
        sharedRanks,
        resourceLabels,
        lang,
      }),
    }));
    const filtered = withMeta.filter(({ card, playable }) => {
      if (handFilter === 'all') return true;
      if (handFilter === 'playable') return playable;
      return card.category === handFilter;
    });
    filtered.sort((a, b) => {
      if (handSort === 'default') return a.index - b.index;
      if (handSort === 'playable') return a.playable === b.playable ? a.index - b.index : (a.playable ? -1 : 1);
      if (handSort === 'category') return a.card.category.localeCompare(b.card.category) || a.index - b.index;
      return cardTitle(a.card.id, a.card.title, lang).localeCompare(cardTitle(b.card.id, b.card.title, lang)) || a.index - b.index;
    });
    return filtered;
  }, [G, hand, canPlayHandCard, resources, id, sharedRanks, resourceLabels, lang, handFilter, handSort]);

  const hasPlayableHandCard = useMemo(
    () => hand.some((card) => isPlayAllowedForCard({
      card,
      canPlayHandCard,
      resources,
      G,
      playerID: id,
      sharedRanks,
      resourceLabels,
      lang,
    })),
    [G, hand, canPlayHandCard, resources, id, sharedRanks, resourceLabels, lang],
  );
  const hasPlayableLegendaryCard = canPlay && legendaryHand.length > 0;
  const shouldShowSkipTurnLabel = (G.deck?.length ?? 0) === 0 && !hasPlayableHandCard && !hasPlayableLegendaryCard;
  const passButtonLabel = shouldShowSkipTurnLabel ? v2.skipTurn : endTurnLabel;

  return {
    nextRankMeta,
    gameoverMeta,
    winnerPlayerID,
    winnerRankId,
    winnerRankName,
    latestEvents,
    handCardsView,
    hasPlayableHandCard,
    hasPlayableLegendaryCard,
    shouldShowSkipTurnLabel,
    passButtonLabel,
  };
};
