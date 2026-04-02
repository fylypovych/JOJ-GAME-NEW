import { normalizeImagePath } from '../../game/imagePaths';
import { canPlayHandCardAtStage } from '../../game/turnRules';
import type { JojGameState, RankDefinition } from '../../game/types';

export const useBoardStageState = (args: {
  G: JojGameState | null | undefined;
  ctx: { currentPlayer?: string; activePlayers?: Record<string, string> | null } | null | undefined;
  playerID: string;
  sharedRanks: RankDefinition[];
  cardImageById: Record<string, string>;
}) => {
  const { G, ctx, playerID, sharedRanks, cardImageById } = args;
  const viewPlayerID = playerID || ctx?.currentPlayer || Object.keys(G?.players ?? {})[0] || '';
  const isSimplifiedMode = G?.gameMode === 'simplified';
  const hand = G?.hands?.[viewPlayerID] ?? [];
  const legendaryHand = isSimplifiedMode ? [] : (G?.legendaryHands?.[viewPlayerID] ?? []);
  const legendaryDraftPool = G?.legendaryDeck ?? [];
  const draftPending = G?.gameMode === 'standard_plus'
    && Object.keys(G?.players ?? {}).some((pid) => G?.legendaryDraftCompleted?.[pid] !== true);
  const myDraftDone = G?.legendaryDraftCompleted?.[viewPlayerID] === true;
  const resources = G?.resources?.[viewPlayerID];
  const rankId = G?.ranks?.[viewPlayerID];
  const currentRank = sharedRanks.find((row) => row.id === (rankId ?? ''));
  const rankName = currentRank?.name ?? rankId ?? '';
  const rankImage = normalizeImagePath(G?.rankImageByPlayer?.[viewPlayerID])
    ?? normalizeImagePath(currentRank?.imageVariants?.[0])
    ?? normalizeImagePath(currentRank?.image);
  const isCurrentPlayer = ctx?.currentPlayer === playerID;
  const stage = ctx?.activePlayers?.[playerID] as string | undefined;
  const hasPendingDrawAuto = Boolean(G?.pendingDrawAutoResolution && G.pendingDrawAutoResolution.sourcePlayerID === playerID);
  const canDraw = isCurrentPlayer && !draftPending && stage === 'draw' && !hasPendingDrawAuto;
  const canPlay = isCurrentPlayer && !draftPending && (stage === 'play' || stage === 'end');
  const canEndTurn = isCurrentPlayer && !draftPending && (stage === 'play' || stage === 'end');
  const extraHandPlayTokens = G?.extraHandPlayTokens?.[playerID] ?? 0;
  const canPlayHandCard = canPlayHandCardAtStage({ isCurrentPlayer, stage, extraHandPlayTokens });
  const handOverflow = Math.max(0, hand.length - 8);
  const mustDiscardOverflow = isCurrentPlayer && handOverflow > 0 && (stage === 'play' || stage === 'end');
  const deckBackImage = G?.deckBackImage ? normalizeImagePath(G.deckBackImage) : undefined;
  const lastDiscard = G?.discard?.length ? G.discard[G.discard.length - 1] : null;
  const lastDiscardImage = lastDiscard
    ? (normalizeImagePath(cardImageById[lastDiscard.id]) ?? normalizeImagePath(lastDiscard.image) ?? `/cards/${lastDiscard.id}.png`)
    : undefined;

  return {
    isSimplifiedMode,
    hand,
    legendaryHand,
    legendaryDraftPool,
    draftPending,
    myDraftDone,
    resources,
    rankId,
    rankName,
    rankImage,
    isCurrentPlayer,
    stage,
    canDraw,
    canPlay,
    canEndTurn,
    extraHandPlayTokens,
    canPlayHandCard,
    handOverflow,
    mustDiscardOverflow,
    deckBackImage,
    lastDiscard,
    lastDiscardImage,
  };
};
