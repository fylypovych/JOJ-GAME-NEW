import { useMemo } from 'react';
import { getHandCardActionState } from '../../game/actionValidation';
import { cardNeedsTargetSelection, getCardPlayBehavior } from '../../game/cardRules';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from '../../game/types';
import { cardTitle, rankLabel } from '../i18n';
import { getNextRankSeatMeta } from './rankHints';

const describeCardEffects = (
  card: CardDefinition,
  resourceLabels: Record<ResourceKey, string>,
) => {
  const parts = (card.effects ?? []).map((effect) => {
    if (effect.resource === 'rank') return `Rank ${effect.value > 0 ? `+${effect.value}` : effect.value}`;
    return `${resourceLabels[effect.resource]} ${effect.value > 0 ? `+${effect.value}` : effect.value}`;
  });
  return parts.length ? parts.join(', ') : 'No direct resource change.';
};

const buildCardPreviewText = (args: {
  card: CardDefinition;
  resourceLabels: Record<ResourceKey, string>;
  lang: 'uk' | 'en';
  nextRankNameById: (rankId: string) => string;
}) => {
  const { card, resourceLabels, lang, nextRankNameById } = args;
  const effectsText = describeCardEffects(card, resourceLabels);
  const behavior = getCardPlayBehavior(card);
  if (behavior === 'lyap') {
    return lang === 'uk' ? `Цільовий тиск на одного суперника: ${effectsText}` : `Single-target pressure on one opponent: ${effectsText}`;
  }
  if (behavior === 'scandal') {
    return lang === 'uk' ? `Удар по всіх суперниках: ${effectsText}` : `Hits all opponents: ${effectsText}`;
  }
  if (behavior === 'command') {
    return lang === 'uk' ? `Ефект на себе і вплив на стіл: ${effectsText}` : `Self effect plus table impact: ${effectsText}`;
  }
  if (behavior === 'vvnz' && card.grantRank) {
    const rankName = nextRankNameById(card.grantRank);
    return lang === 'uk'
      ? `Підвищення до «${rankName}» і додатковий ефект: ${effectsText}`
      : `Promotes to "${rankName}" with extra effect: ${effectsText}`;
  }
  if (behavior === 'legendary') {
    return lang === 'uk' ? 'Легендарна карта з окремою спеціальною дією.' : 'Legendary card with a separate special ability.';
  }
  return lang === 'uk' ? `Очікуваний ефект: ${effectsText}` : `Expected effect: ${effectsText}`;
};

const classifySystemEvent = (textValue: string, lang: 'uk' | 'en') => {
  const text = textValue.toLowerCase();
  if (text.includes('legendary') || text.includes('легендар')) {
    return {
      label: lang === 'uk' ? 'Легендарне' : 'Legendary',
      tone: 'legendary' as const,
    };
  }
  if (text.includes('scandal') || text.includes('скандал')) {
    return {
      label: 'SCANDAL',
      tone: 'warn' as const,
    };
  }
  if (text.includes('lyap') || text.includes('ляп')) {
    return {
      label: 'LYAP',
      tone: 'warn' as const,
    };
  }
  if (text.includes('rank') || text.includes('звання') || text.includes('ввнз')) {
    return {
      label: lang === 'uk' ? 'Звання' : 'Rank',
      tone: 'good' as const,
    };
  }
  if (text.includes('shield') || text.includes('щит')) {
    return {
      label: lang === 'uk' ? 'Захист' : 'Shield',
      tone: 'neutral' as const,
    };
  }
  return {
    label: lang === 'uk' ? 'Подія' : 'Event',
    tone: 'neutral' as const,
  };
};

export const useBoardV2DerivedState = (args: {
  G: JojGameState;
  ctx: { gameover?: unknown };
  id: string;
  hand: CardDefinition[];
  legendaryHand: CardDefinition[];
  canPlay: boolean;
  canPlayHandCard: boolean;
  sharedRanks: RankDefinition[];
  resourceLabels: Record<ResourceKey, string>;
  lang: 'uk' | 'en';
  handFilter: 'all' | 'playable' | CardDefinition['category'];
  handSort: 'default' | 'playable' | 'category' | 'title';
  v2: Record<string, string>;
  endTurnLabel: string;
}) => {
  const { G, ctx, id, hand, legendaryHand, canPlay, canPlayHandCard, sharedRanks, resourceLabels, lang, handFilter, handSort, v2, endTurnLabel } = args;

  const nextRankMeta = useMemo(() => getNextRankSeatMeta({ G, playerID: id, sharedRanks }), [G, id, sharedRanks]);
  const gameoverMeta = (ctx?.gameover ?? null) as { winner?: string; endReason?: string } | null;
  const winnerPlayerID = gameoverMeta?.winner ? String(gameoverMeta.winner) : '';
  const winnerRankId = winnerPlayerID ? (G?.ranks?.[winnerPlayerID] ?? '') : '';
  const winnerRankName = winnerRankId
    ? (sharedRanks.find((row) => row.id === winnerRankId)?.name ?? rankLabel(winnerRankId, lang))
    : '';
  const latestEvents = (G?.chat ?? [])
    .filter((row) => row.type === 'system')
    .reverse()
    .map((row) => ({
      ...row,
      ...classifySystemEvent(row.text, lang),
    }));

  const allHandCardsView = useMemo(() => {
    const withMeta = hand.map((card, index) => ({
      card,
      index,
      actionState: getHandCardActionState({
        card,
        G,
        playerID: id,
        ranks: sharedRanks,
        resourceLabels,
        canPlayHandCard,
        lang,
      }),
      get playable() {
        return this.actionState.allowed;
      },
    }));
    return withMeta.map((row) => ({
      ...row,
      badges: [
        row.actionState.allowed ? v2.canPlayNow : v2.notNow,
        ...(cardNeedsTargetSelection(row.card) && getCardPlayBehavior(row.card) === 'lyap' ? [v2.requiresTarget] : []),
        ...(getCardPlayBehavior(row.card) === 'vvnz' && row.actionState.reason ? [v2.blockedReason] : []),
      ],
      helperText: row.actionState.reason ?? (!row.actionState.allowed && !canPlayHandCard ? v2.actionUnavailable : undefined),
    }));
  }, [hand, canPlayHandCard, G, id, sharedRanks, resourceLabels, lang, v2]);

  const handCardsView = useMemo(() => {
    const filtered = allHandCardsView.filter(({ card, playable }) => {
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
  }, [allHandCardsView, handFilter, handSort, lang]);

  const rankNameById = (rankId: string) =>
    sharedRanks.find((row) => row.id === rankId)?.name ?? rankLabel(rankId, lang);

  const handCardsViewWithPreview = useMemo(
    () =>
      handCardsView.map((row) => ({
        ...row,
        previewText: buildCardPreviewText({
          card: row.card,
          resourceLabels,
          lang,
          nextRankNameById: rankNameById,
        }),
      })),
    [handCardsView, resourceLabels, lang, sharedRanks],
  );

  const hasPlayableHandCard = useMemo(
    () => allHandCardsView.some((row) => row.playable),
    [allHandCardsView],
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
    allHandCardsView,
    handCardsView: handCardsViewWithPreview,
    hasPlayableHandCard,
    hasPlayableLegendaryCard,
    shouldShowSkipTurnLabel,
    passButtonLabel,
  };
};
