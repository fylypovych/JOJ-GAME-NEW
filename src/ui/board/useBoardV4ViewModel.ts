import { normalizeImagePath } from '../../game/imagePaths';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from '../../game/types';
import { cardTitle, rankLabel } from '../i18n';
import { buildGameoverPlayerSummaries, buildResourceHighlightMeta } from './boardViewHelpers';
import { getBoardPromoteReason } from './boardViewHelpers';
import { resolvePlaybackCardMeta } from './playbackCardMeta';
import type { V4FooterResourceItem, V4OpponentCardItem } from './v4Sections';

const buildOpponentLayout = (opponentIds: string[]) => {
  if (opponentIds.length <= 3) {
    return { topIds: opponentIds, leftIds: [] as string[], rightIds: [] as string[] };
  }
  if (opponentIds.length === 4) {
    return {
      topIds: opponentIds.slice(0, 2),
      leftIds: opponentIds.slice(2, 3),
      rightIds: opponentIds.slice(3, 4),
    };
  }
  const remaining = opponentIds.slice(3);
  const leftCount = Math.ceil(remaining.length / 2);
  return {
    topIds: opponentIds.slice(0, 3),
    leftIds: remaining.slice(0, leftCount),
    rightIds: remaining.slice(leftCount),
  };
};

const pickDeterministicRankCardImage = (sharedRanks: RankDefinition[], seed: string): string | undefined => {
  const imagePool = sharedRanks
    .flatMap((rank) => [
      ...(rank.imageVariants ?? []),
      ...(rank.image ? [rank.image] : []),
    ])
    .map((path) => normalizeImagePath(path))
    .filter((path): path is string => Boolean(path));
  if (imagePool.length === 0) return undefined;
  const hash = Array.from(seed).reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 7);
  return imagePool[hash % imagePool.length];
};

export const toInitials = (value: string) => value
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((chunk) => chunk[0]?.toUpperCase() ?? '')
  .join('') || '??';

export const buildBoardV4ViewModel = (args: {
  G: JojGameState;
  ctx: { currentPlayer?: string | null; gameover?: unknown };
  id: string;
  lang: 'uk' | 'en';
  sharedRanks: RankDefinition[];
  resourceLabels: Record<ResourceKey, string>;
  resources: Record<ResourceKey, number>;
  selectedResource: ResourceKey | null;
  playerLabelById: (id: string | null | undefined) => string;
  winnerPlayerID: string;
  opponentIds: string[];
  selectedTargetId: string | null;
  activeSelectionNeedsTarget: boolean;
  lastDiscard: CardDefinition | null;
  lastDiscardImage?: string;
  botPlaybackCardTitle: string;
  botPlaybackEventText: string;
  cardImageById: Record<string, string>;
  rankName: string;
  rankImage?: string;
  currentStageFocus: string;
  latestEvents: Array<{ id: string; label: string; text: string; type: 'player' | 'system'; playerID?: string; tone: 'neutral' | 'warn' | 'good' | 'legendary' }>;
  sharedResourceOrder: ResourceKey[];
  sharedResourceIcons: Record<ResourceKey, string>;
}) => {
  const {
    G,
    ctx,
    id,
    lang,
    sharedRanks,
    resourceLabels,
    resources,
    selectedResource,
    playerLabelById,
    winnerPlayerID,
    opponentIds,
    selectedTargetId,
    activeSelectionNeedsTarget,
    lastDiscard,
    lastDiscardImage,
    botPlaybackCardTitle,
    botPlaybackEventText,
    cardImageById,
    rankName,
    rankImage,
    currentStageFocus,
    latestEvents,
    sharedResourceOrder,
    sharedResourceIcons,
  } = args;

  const promoteReason = getBoardPromoteReason({ G, playerID: id, sharedRanks, resourceLabels, lang });
  const gameoverPlayerSummaries = buildGameoverPlayerSummaries({
    G,
    winnerPlayerID,
    playerLabelById,
    resourceLabels,
    sharedRanks,
    lang,
  });
  const { highlightedResources, deficitByResource } = buildResourceHighlightMeta({
    resources,
    selectedResource,
  });
  const activeArenaPlayerId = selectedTargetId ?? ctx.currentPlayer ?? null;
  const activeArenaPlayerName = playerLabelById(activeArenaPlayerId);
  const activeArenaResources = activeArenaPlayerId ? G.resources?.[activeArenaPlayerId] ?? null : null;
  const activeArenaRankId = activeArenaPlayerId ? G.ranks?.[activeArenaPlayerId] ?? '' : '';
  const activeArenaRankName = activeArenaRankId
    ? sharedRanks.find((rank) => rank.id === activeArenaRankId)?.name ?? rankLabel(activeArenaRankId, lang)
    : '';
  const latestArenaRow = latestEvents[0] ?? null;
  const lastDiscardTitle = lastDiscard ? cardTitle(lastDiscard.id, lastDiscard.title, lang) : '';
  const playbackCardMeta = resolvePlaybackCardMeta({
    eventText: botPlaybackEventText,
    G,
    cardImageById,
    lastDiscard,
    lastDiscardImage,
  });
  const displayedDiscardTitle = botPlaybackCardTitle || playbackCardMeta.title || lastDiscardTitle;
  const displayedDiscardImage = (botPlaybackCardTitle || playbackCardMeta.title) ? playbackCardMeta.imageSrc : lastDiscardImage;
  const focusPrimaryLabel = lastDiscardTitle || activeArenaPlayerName;
  const focusSecondaryLabel = activeArenaRankName || rankName;
  const focusSupportingText = currentStageFocus;
  const opponentLayout = buildOpponentLayout(opponentIds);
  const showcaseOpponentIds = [...opponentLayout.topIds, ...opponentLayout.leftIds, ...opponentLayout.rightIds];
  const opponentSplitIndex = Math.ceil(showcaseOpponentIds.length / 2);
  const topLeftOpponentIds = showcaseOpponentIds.slice(0, opponentSplitIndex);
  const topRightOpponentIds = showcaseOpponentIds.slice(opponentSplitIndex);
  const currentTurnPlayerLabel = playerLabelById(ctx.currentPlayer);
  const resolvePlayerRankImage = (pid: string) => {
    const rankIdForPlayer = G.ranks?.[pid] ?? '';
    const rankMeta = sharedRanks.find((rank) => rank.id === rankIdForPlayer);
    return normalizeImagePath(G.rankImageByPlayer?.[pid])
      ?? normalizeImagePath(rankMeta?.imageVariants?.[0])
      ?? normalizeImagePath(rankMeta?.image);
  };
  const currentTurnPortraitImage = (ctx.currentPlayer && (
    resolvePlayerRankImage(ctx.currentPlayer)
      ?? pickDeterministicRankCardImage(sharedRanks, `turn:${ctx.currentPlayer}`)
  )) || rankImage || pickDeterministicRankCardImage(sharedRanks, `self:${id}`);
  const buildOpponentCardItem = (pid: string): V4OpponentCardItem => {
    const rankIdForPlayer = G.ranks?.[pid] ?? '';
    return {
      id: pid,
      name: playerLabelById(pid),
      rankName: sharedRanks.find((rank) => rank.id === rankIdForPlayer)?.name ?? rankLabel(rankIdForPlayer, lang),
      cardsCount: G.hands?.[pid]?.length ?? 0,
      isActive: ctx.currentPlayer === pid,
      isSelected: selectedTargetId === pid,
      isTargetable: activeSelectionNeedsTarget,
      imageSrc: resolvePlayerRankImage(pid) ?? pickDeterministicRankCardImage(sharedRanks, `opp:${pid}`),
      initials: toInitials(playerLabelById(pid)),
    };
  };
  const leftOpponentItems = topLeftOpponentIds.map(buildOpponentCardItem);
  const rightOpponentItems = topRightOpponentIds.map(buildOpponentCardItem);
  const footerResourceItems: V4FooterResourceItem[] = sharedResourceOrder.map((key) => ({
    key,
    icon: sharedResourceIcons[key],
    label: resourceLabels[key],
    value: resources[key] ?? 0,
    highlighted: highlightedResources.has(key),
    deficit: Boolean(deficitByResource[key]),
  }));

  return {
    promoteReason,
    gameoverPlayerSummaries,
    highlightedResources,
    deficitByResource,
    activeArenaPlayerName,
    activeArenaResources,
    activeArenaRankName,
    latestArenaRow,
    displayedDiscardTitle,
    displayedDiscardImage,
    focusPrimaryLabel,
    focusSecondaryLabel,
    focusSupportingText,
    currentTurnPlayerLabel,
    currentTurnPortraitImage,
    leftOpponentItems,
    rightOpponentItems,
    footerResourceItems,
  };
};
