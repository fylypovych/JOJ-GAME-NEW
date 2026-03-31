import { useEffect } from 'react';
import type { CardDefinition } from '../../game/types';

type HandCardRow = {
  card: CardDefinition;
  actionState: {
    allowed: boolean;
  };
};

export const useBoardV4Interactions = (args: {
  hand: CardDefinition[];
  handCardsView: HandCardRow[];
  selectedHandCardId: string | null;
  setSelectedHandCardId: (value: string | null) => void;
  selectedPendingCardId: string | null;
  visibleHandSelectedId: string | null;
  selectedPlayableHandCard: CardDefinition | null;
  blockPlayerTurnControls: boolean;
  pendingSelection: { cardId: string } | null;
  confirmPendingSelection: () => void;
  stage: string | undefined;
  canDraw: boolean;
  handleDraw: () => void;
  handleHandCardAction: (card: CardDefinition, requestPlayHandCard: (card: CardDefinition) => void) => void;
  requestPlayHandCard: (card: CardDefinition) => void;
  canPlay: boolean;
  promoteReason: string | null | undefined;
  handlePromote: (reason: string | null) => void;
}) => {
  const {
    hand,
    handCardsView,
    selectedHandCardId,
    setSelectedHandCardId,
    selectedPendingCardId,
    visibleHandSelectedId,
    selectedPlayableHandCard,
    blockPlayerTurnControls,
    pendingSelection,
    confirmPendingSelection,
    stage,
    canDraw,
    handleDraw,
    handleHandCardAction,
    requestPlayHandCard,
    canPlay,
    promoteReason,
    handlePromote,
  } = args;

  useEffect(() => {
    if (selectedPendingCardId) {
      setSelectedHandCardId(selectedPendingCardId);
      return;
    }
    if (selectedHandCardId && !hand.some((card) => card.id === selectedHandCardId)) {
      setSelectedHandCardId(null);
    }
  }, [hand, selectedHandCardId, selectedPendingCardId, setSelectedHandCardId]);

  const handleV4HandCardClick = (card: CardDefinition) => {
    const allowed = handCardsView.find((row) => row.card.id === card.id)?.actionState.allowed ?? false;
    if (!allowed) return;
    if (visibleHandSelectedId === card.id) {
      handleHandCardAction(card, requestPlayHandCard);
      return;
    }
    setSelectedHandCardId(card.id);
  };

  const handlePrimaryV4Action = () => {
    if (blockPlayerTurnControls) return;
    if (pendingSelection) {
      confirmPendingSelection();
      return;
    }
    if (stage === 'draw' && canDraw) {
      handleDraw();
      return;
    }
    if (selectedPlayableHandCard) {
      handleHandCardAction(selectedPlayableHandCard, requestPlayHandCard);
      return;
    }
    if (!promoteReason && canPlay) {
      handlePromote(promoteReason ?? null);
    }
  };

  return {
    handleV4HandCardClick,
    handlePrimaryV4Action,
  };
};
