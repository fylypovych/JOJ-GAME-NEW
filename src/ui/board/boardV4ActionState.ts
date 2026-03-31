import type { CardDefinition } from '../../game/types';

type HandCardRow = {
  card: CardDefinition;
};

type PendingSelectionLike = {
  cardId: string;
} | null;

export const buildBoardV4ActionState = (args: {
  isSpectator: boolean;
  isBotPlaybackActive: boolean;
  botThinkingPlayerName: string;
  botPlaybackEventText: string;
  isCurrentPlayer: boolean;
  stage: string | undefined;
  v2: {
    botThinkingPrefix: string;
    waitingAction: string;
    stageFocusDraw: string;
    stageFocusPlay: string;
    stageFocusEnd: string;
    confirm: string;
    play: string;
  };
  passButtonLabel: string;
  pendingSelection: PendingSelectionLike;
  activeSelectionNeedsTarget: boolean;
  activeSelectionNeedsResource: boolean;
  selectedTargetId: string | null;
  selectedResource: string | null;
  canDraw: boolean;
  canPlay: boolean;
  promoteReason: string | null | undefined;
  hand: CardDefinition[];
  handCardsView: HandCardRow[];
  selectedHandCardId: string | null;
  t: {
    draw: string;
    promote: string;
  };
}) => {
  const {
    isSpectator,
    isBotPlaybackActive,
    botThinkingPlayerName,
    botPlaybackEventText,
    isCurrentPlayer,
    stage,
    v2,
    passButtonLabel,
    pendingSelection,
    activeSelectionNeedsTarget,
    activeSelectionNeedsResource,
    selectedTargetId,
    selectedResource,
    canDraw,
    canPlay,
    promoteReason,
    hand,
    handCardsView,
    selectedHandCardId,
    t,
  } = args;

  const botPlaybackControlLabel = botThinkingPlayerName
    ? `${v2.botThinkingPrefix}: ${botThinkingPlayerName}`
    : botPlaybackEventText || v2.waitingAction;
  const blockPlayerTurnControls = !isSpectator && isBotPlaybackActive;
  const effectiveIsCurrentPlayer = isCurrentPlayer && !blockPlayerTurnControls;
  const currentStageFocus = blockPlayerTurnControls
    ? botPlaybackControlLabel
    : stage === 'draw' ? v2.stageFocusDraw : stage === 'play' ? v2.stageFocusPlay : stage === 'end' ? v2.stageFocusEnd : '';
  const footerActionLabel = blockPlayerTurnControls ? botPlaybackControlLabel : passButtonLabel;
  const selectedPendingCardId = pendingSelection?.cardId ?? null;
  const visibleHandSelectedId = selectedPendingCardId && hand.some((card) => card.id === selectedPendingCardId)
    ? selectedPendingCardId
    : selectedHandCardId;
  const selectedPlayableHandCard = visibleHandSelectedId
    ? handCardsView.find((row) => row.card.id === visibleHandSelectedId)?.card ?? null
    : null;
  const primaryActionLabel = (() => {
    if (blockPlayerTurnControls) return v2.waitingAction;
    if (pendingSelection) return v2.confirm;
    if (stage === 'draw') return t.draw;
    if (selectedPlayableHandCard) return v2.play;
    if (!promoteReason && canPlay) return t.promote;
    return v2.play;
  })();
  const pendingSelectionReady = pendingSelection
    ? (activeSelectionNeedsTarget ? Boolean(selectedTargetId) : activeSelectionNeedsResource ? Boolean(selectedResource) : true)
    : false;
  const primaryActionDisabled = blockPlayerTurnControls
    || (pendingSelection ? !pendingSelectionReady : stage === 'draw' ? !canDraw : selectedPlayableHandCard ? false : !(!promoteReason && canPlay));

  return {
    botPlaybackControlLabel,
    blockPlayerTurnControls,
    effectiveIsCurrentPlayer,
    currentStageFocus,
    footerActionLabel,
    selectedPendingCardId,
    visibleHandSelectedId,
    selectedPlayableHandCard,
    primaryActionLabel,
    pendingSelectionReady,
    primaryActionDisabled,
  };
};
