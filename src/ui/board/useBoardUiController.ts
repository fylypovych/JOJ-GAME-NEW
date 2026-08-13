import { useMemo, useRef, useState } from 'react';
import {
  cardNeedsTargetSelection,
  getCardPlayBehavior,
} from '../../game/cardRules';
import { getHandCardActionState } from '../../game/actionValidation';
import type {
  CardDefinition,
  JojGameState,
  RankDefinition,
  ResourceKey,
} from '../../game/types';
import type { JojMoveApi } from './types';

type NoticeKind = 'info' | 'error' | 'success';
export type BoardNotice = { id: string; type: NoticeKind; text: string };
type SidePanelTab = 'events' | 'chat' | 'help';

export const useBoardUiController = (args: {
  G:
    | Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>
    | null
    | undefined;
  id: string;
  knownPlayerNames: Record<string, string>;
  playerNames?: Record<string, string>;
  moves: JojMoveApi;
  canPlayHandCard: boolean;
  canPlay: boolean;
  canDraw: boolean;
  canEndTurn: boolean;
  sharedRanks: RankDefinition[];
  resourceLabels: Record<ResourceKey, string>;
  lang: 'uk' | 'en';
  board: Record<string, string>;
  t: ReturnType<typeof import('../i18n').text>;
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
    sharedRanks,
    resourceLabels,
    lang,
    board,
    t,
  } = args;
  const [chatInput, setChatInput] = useState('');
  const [openPreviewKey, setOpenPreviewKey] = useState<string | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [notices, setNotices] = useState<BoardNotice[]>([]);
  const [gameoverModalClosed, setGameoverModalClosed] = useState(false);
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('events');
  const syncedNameRef = useRef('');
  const syncedNamesSignatureRef = useRef('');
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  const playerLabelById = (idValue: string | null | undefined) => {
    if (!idValue) return t.systemTag;
    const name =
      playerNames?.[idValue]?.trim() || knownPlayerNames[idValue]?.trim();
    return name || t.genericPlayer;
  };

  const effectLabel = (resource: ResourceKey | 'rank') =>
    resource === 'rank' ? t.rankResource : resourceLabels[resource];
  const togglePreview = (key: string) =>
    setOpenPreviewKey((prev) => (prev === key ? null : key));
  const dismissNotice = (noticeId: string) =>
    setNotices((prev) => prev.filter((row) => row.id !== noticeId));
  const postNotice = (type: NoticeKind, msg: string) => {
    if (!msg) {
      setNotices([]);
      return;
    }
    const idValue = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextNotice = { id: idValue, type, text: msg };
    setNotices((prev) => [nextNotice, ...prev].slice(0, 3));
    if (type !== 'error') {
      setTimeout(() => {
        setNotices((prev) => prev.filter((row) => row.id !== idValue));
      }, 3600);
    }
  };
  const opponentIds = useMemo(
    () => Object.keys(G?.players ?? {}).filter((pid) => pid !== id),
    [G?.players, id],
  );

  const resolveMoveErrorText = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim())
      return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return fallback;
  };

  const runMove = (move: (() => unknown) | undefined, fallback: string) => {
    if (!move) return;
    try {
      const result = move();
      Promise.resolve(result)
        .then(() => setNotices([]))
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
    if (typeof moves.sendChat === 'function') {
      moves.sendChat(msg);
    }
    setChatInput('');
  };

  const handleHandCardAction = (
    card: CardDefinition,
    requestPlayHandCard: (card: CardDefinition) => void,
  ) => {
    const actionState = G
      ? getHandCardActionState({
          card,
          G,
          playerID: id,
          ranks: sharedRanks,
          resourceLabels,
          canPlayHandCard,
          lang,
        })
      : {
          allowed: canPlayHandCard,
          reason: canPlayHandCard ? null : board.actionUnavailable,
        };
    if (!actionState.allowed) {
      postNotice('error', actionState.reason ?? board.actionUnavailable);
      return;
    }
    requestPlayHandCard(card);
  };

  const handleLegendaryCardAction = (
    card: CardDefinition,
    requestPlayLegendaryCard: (card: CardDefinition) => void,
  ) => {
    if (typeof moves.playLegendaryCard !== 'function') return;
    requestPlayLegendaryCard(card);
  };

  const handleDraw = () => {
    if (!canDraw) return postNotice('error', board.confirmDrawFirst);
    runMove(() => moves.drawCard(), board.actionUnavailable);
  };

  const handlePromote = (promoteReason: string | null) => {
    if (!canPlay) return postNotice('error', board.actionUnavailable);
    if (promoteReason) return postNotice('error', promoteReason);
    runMove(() => moves.promote(), board.actionUnavailable);
  };

  const handlePass = (endTurn?: () => unknown) => {
    if (!canEndTurn) return;
    runMove(endTurn, board.actionUnavailable);
  };

  const handleRequestEndGameVote = () => {
    if (typeof moves.requestEndGameVote !== 'function') {
      postNotice('error', board.actionUnavailable);
      return;
    }
    runMove(() => moves.requestEndGameVote?.(), board.actionUnavailable);
  };

  const handleRespondEndGameVote = (agree: boolean) => {
    if (typeof moves.respondEndGameVote !== 'function') {
      postNotice('error', board.actionUnavailable);
      return;
    }
    runMove(() => moves.respondEndGameVote?.(agree), board.actionUnavailable);
  };

  const handleDraftToggle = (cardId: string) => {
    setDraftSelection((prev) => {
      if (prev.includes(cardId))
        return prev.filter((idValue) => idValue !== cardId);
      if (prev.length >= 5) return prev;
      return [...prev, cardId];
    });
  };

  const getHandBadges = (
    card: CardDefinition,
    handCardsView: Array<{ card: CardDefinition; playable: boolean }>,
  ) => {
    const playable =
      handCardsView.find((row) => row.card.id === card.id)?.playable ?? false;
    const actionState = G
      ? getHandCardActionState({
          card,
          G,
          playerID: id,
          ranks: sharedRanks,
          resourceLabels,
          canPlayHandCard,
          lang,
        })
      : null;
    const vvnzReason =
      actionState?.behavior === 'vvnz' ? actionState.reason : null;
    return [
      playable ? board.canPlayNow : board.notNow,
      ...(cardNeedsTargetSelection(card) && getCardPlayBehavior(card) === 'lyap'
        ? [board.requiresTarget]
        : []),
      ...(getCardPlayBehavior(card) === 'vvnz' && vvnzReason
        ? [board.blockedReason]
        : []),
    ];
  };

  const getHandHelperText = (
    card: CardDefinition,
    handCardsView: Array<{ card: CardDefinition; playable: boolean }>,
  ) => {
    const playable =
      handCardsView.find((row) => row.card.id === card.id)?.playable ?? false;
    const actionState = G
      ? getHandCardActionState({
          card,
          G,
          playerID: id,
          ranks: sharedRanks,
          resourceLabels,
          canPlayHandCard,
          lang,
        })
      : null;
    const vvnzReason =
      actionState?.behavior === 'vvnz' ? actionState.reason : null;
    return (
      vvnzReason ||
      (!playable && !canPlayHandCard ? board.actionUnavailable : undefined)
    );
  };

  return {
    chatInput,
    setChatInput,
    openPreviewKey,
    setOpenPreviewKey,
    draftSelection,
    setDraftSelection,
    notices,
    gameoverModalClosed,
    setGameoverModalClosed,
    sidePanelTab,
    setSidePanelTab,
    syncedNameRef,
    syncedNamesSignatureRef,
    chatLogRef,
    playerLabelById,
    effectLabel,
    togglePreview,
    postNotice,
    dismissNotice,
    opponentIds,
    sendChatMessage,
    handleHandCardAction,
    handleLegendaryCardAction,
    handleDraw,
    handlePromote,
    handlePass,
    handleRequestEndGameVote,
    handleRespondEndGameVote,
    handleDraftToggle,
    getHandBadges,
    getHandHelperText,
  };
};
