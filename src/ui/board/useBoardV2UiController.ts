import { useMemo, useRef, useState } from 'react';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from '../../game/types';
import type { JojMoveApi } from './types';

type NoticeKind = 'info' | 'error' | 'success';
export type BoardNotice = { type: NoticeKind; text: string } | null;
type HandFilter = 'all' | 'playable' | CardDefinition['category'];
type HandSort = 'default' | 'playable' | 'category' | 'title';
type SidePanelTab = 'events' | 'chat';

export const useBoardV2UiController = (args: {
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources'> | null | undefined;
  id: string;
  knownPlayerNames: Record<string, string>;
  playerNames?: Record<string, string>;
  moves: JojMoveApi;
  canPlayHandCard: boolean;
  canPlay: boolean;
  canDraw: boolean;
  canEndTurn: boolean;
  resources?: Record<ResourceKey, number>;
  sharedRanks: RankDefinition[];
  resourceLabels: Record<ResourceKey, string>;
  lang: 'uk' | 'en';
  v2: Record<string, string>;
  t: ReturnType<typeof import('../i18n').text>;
  getBoardVvnzBlockedReason: (args: {
    card: CardDefinition;
    G: Pick<JojGameState, 'players' | 'ranks' | 'resources'>;
    playerID: string;
    sharedRanks: RankDefinition[];
    resources: Record<ResourceKey, number>;
    resourceLabels: Record<ResourceKey, string>;
    lang: 'uk' | 'en';
  }) => string | null;
}) => {
  const {
    G,
    id,
    knownPlayerNames,
    playerNames,
    moves,
    canPlayHandCard,
    canPlay,
    canDraw,
    canEndTurn,
    resources,
    sharedRanks,
    resourceLabels,
    lang,
    v2,
    t,
    getBoardVvnzBlockedReason,
  } = args;
  const [chatInput, setChatInput] = useState('');
  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [notice, setNotice] = useState<BoardNotice>(null);
  const [gameoverModalClosed, setGameoverModalClosed] = useState(false);
  const [handFilter, setHandFilter] = useState<HandFilter>('all');
  const [handSort, setHandSort] = useState<HandSort>('playable');
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('events');
  const syncedNameRef = useRef('');
  const syncedNamesSignatureRef = useRef('');
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  const playerLabelById = (idValue: string | null | undefined) => {
    if (!idValue) return t.systemTag;
    const name = playerNames?.[idValue]?.trim() || knownPlayerNames[idValue]?.trim();
    return name || t.genericPlayer;
  };

  const effectLabel = (resource: ResourceKey | 'rank') => (resource === 'rank' ? t.rankResource : resourceLabels[resource]);
  const togglePreview = (key: string) => setOpenPreviewKey((prev) => (prev === key ? null : key));
  const postNotice = (type: NoticeKind, msg: string) => setNotice(msg ? { type, text: msg } : null);
  const opponentIds = useMemo(
    () => Object.keys(G?.players ?? {}).filter((pid) => pid !== id),
    [G?.players, id],
  );

  const resolveMoveErrorText = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return fallback;
  };

  const runMove = (move: (() => unknown) | undefined, fallback: string) => {
    if (!move) return;
    try {
      const result = move();
      Promise.resolve(result)
        .then(() => setNotice(null))
        .catch((error) => {
          postNotice('error', resolveMoveErrorText(error, fallback));
        });
    } catch (error) {
      postNotice('error', resolveMoveErrorText(error, fallback));
    }
  };

  const sendChatMessage = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    if (typeof moves.sendChat === 'function') moves.sendChat(msg);
    setChatInput('');
  };

  const handleHandCardAction = (card: CardDefinition, requestPlayHandCard: (card: CardDefinition) => void) => {
    if (!canPlayHandCard) {
      postNotice('error', v2.actionUnavailable);
      return;
    }
    const vvnzReason = resources && G
      ? getBoardVvnzBlockedReason({ card, G, playerID: id, sharedRanks, resources, resourceLabels, lang })
      : null;
    if (vvnzReason) {
      postNotice('error', vvnzReason);
      return;
    }
    requestPlayHandCard(card);
  };

  const handleLegendaryCardAction = (card: CardDefinition, requestPlayLegendaryCard: (card: CardDefinition) => void) => {
    if (typeof moves.playLegendaryCard !== 'function') return;
    requestPlayLegendaryCard(card);
  };

  const handleDraw = () => {
    if (!canDraw) return postNotice('error', v2.confirmDrawFirst);
    runMove(() => moves.drawCard(), v2.actionUnavailable);
  };

  const handlePromote = (promoteReason: string | null) => {
    if (!canPlay) return postNotice('error', v2.actionUnavailable);
    if (promoteReason) return postNotice('error', promoteReason);
    runMove(() => moves.promote(), v2.actionUnavailable);
  };

  const handlePass = (endTurn?: () => unknown) => {
    if (!canEndTurn) return;
    runMove(endTurn, v2.actionUnavailable);
  };

  const handleDraftToggle = (cardId: string) => {
    setDraftSelection((prev) => {
      if (prev.includes(cardId)) return prev.filter((idValue) => idValue !== cardId);
      if (prev.length >= 5) return prev;
      return [...prev, cardId];
    });
  };

  const getHandBadges = (card: CardDefinition, handCardsView: Array<{ card: CardDefinition; playable: boolean }>) => {
    const playable = handCardsView.find((row) => row.card.id === card.id)?.playable ?? false;
    const vvnzReason = resources && G
      ? getBoardVvnzBlockedReason({ card, G, playerID: id, sharedRanks, resources, resourceLabels, lang })
      : null;
    return [
      playable ? v2.canPlayNow : v2.notNow,
      ...(card.category === 'LYAP' ? [v2.requiresTarget] : []),
      ...(card.category === 'VVNZ' && vvnzReason ? [card.category] : []),
    ];
  };

  const getHandHelperText = (card: CardDefinition, handCardsView: Array<{ card: CardDefinition; playable: boolean }>) => {
    const playable = handCardsView.find((row) => row.card.id === card.id)?.playable ?? false;
    const vvnzReason = resources && G
      ? getBoardVvnzBlockedReason({ card, G, playerID: id, sharedRanks, resources, resourceLabels, lang })
      : null;
    return vvnzReason || (!playable && !canPlayHandCard ? v2.actionUnavailable : undefined);
  };

  return {
    chatInput,
    setChatInput,
    openPreviewKey,
    setOpenPreviewKey,
    draftSelection,
    setDraftSelection,
    notice,
    setNotice,
    gameoverModalClosed,
    setGameoverModalClosed,
    handFilter,
    setHandFilter,
    handSort,
    setHandSort,
    sidePanelTab,
    setSidePanelTab,
    syncedNameRef,
    syncedNamesSignatureRef,
    chatLogRef,
    playerLabelById,
    effectLabel,
    togglePreview,
    postNotice,
    opponentIds,
    sendChatMessage,
    handleHandCardAction,
    handleLegendaryCardAction,
    handleDraw,
    handlePromote,
    handlePass,
    handleDraftToggle,
    getHandBadges,
    getHandHelperText,
  };
};
