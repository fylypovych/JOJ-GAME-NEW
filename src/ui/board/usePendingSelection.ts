import { useEffect, useMemo, useState } from 'react';
import { cardNeedsResourceSelection, cardNeedsTargetSelection, getCardPlayBehavior } from '../../game/cardRules';
import type { CardDefinition, JojGameState, ResourceKey } from '../../game/types';
import { buildReplacementSlots, isReplacementPrefixValid } from './replacement';
import type { JojMoveApi } from './types';
import type { Language } from '../i18n';

export type PendingSelection =
  | { type: 'hand-lyap'; cardId: string }
  | { type: 'hand-scandal'; cardId: string }
  | { type: 'draw-lyap'; cardId: string }
  | { type: 'draw-scandal'; cardId: string }
  | { type: 'legendary-drone'; cardId: string }
  | { type: 'legendary-water'; cardId: string };

export type NoticeKind = 'info' | 'error' | 'success';

type UsePendingSelectionArgs = {
  G: JojGameState | null | undefined;
  ctx: { turn?: number } | null | undefined;
  id: string;
  hand: CardDefinition[];
  legendaryHand: CardDefinition[];
  opponentIds: string[];
  moves: JojMoveApi;
  lang: Language;
  v2: Record<string, string>;
  postNotice: (type: NoticeKind, msg: string) => void;
  playerLabelById: (id: string | null | undefined) => string;
  cardTitle: (id: string, title: string, lang: Language) => string;
};

const resetSelectionState = (
  setPendingSelection: (value: PendingSelection | null) => void,
  setSelectedTargetId: (value: string | null) => void,
  setSelectedResource: (value: ResourceKey | null) => void,
  setReplacementSelectionsByTarget: (value: Record<string, ResourceKey[]>) => void,
  setActiveReplacementTargetId: (value: string | null) => void,
  clearNotice: () => void,
) => {
  setPendingSelection(null);
  setSelectedTargetId(null);
  setSelectedResource(null);
  setReplacementSelectionsByTarget({});
  setActiveReplacementTargetId(null);
  clearNotice();
};

export const usePendingSelection = ({
  G,
  ctx,
  id,
  hand,
  legendaryHand,
  opponentIds,
  moves,
  lang,
  v2,
  postNotice,
  playerLabelById,
  cardTitle,
}: UsePendingSelectionArgs) => {
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<ResourceKey | null>(null);
  const [replacementSelectionsByTarget, setReplacementSelectionsByTarget] = useState<Record<string, ResourceKey[]>>({});
  const [activeReplacementTargetId, setActiveReplacementTargetId] = useState<string | null>(null);

  const clearPendingSelection = () => resetSelectionState(
    setPendingSelection,
    setSelectedTargetId,
    setSelectedResource,
    setReplacementSelectionsByTarget,
    setActiveReplacementTargetId,
    () => postNotice('info', ''),
  );

  const requestPlayHandCard = (card: CardDefinition) => {
    if (getCardPlayBehavior(card) === 'lyap') {
      setPendingSelection({ type: 'hand-lyap', cardId: card.id });
      setSelectedTargetId(null);
      setReplacementSelectionsByTarget({});
      setActiveReplacementTargetId(null);
      postNotice('info', `${v2.pickTarget}: ${cardTitle(card.id, card.title, lang)}`);
      return false;
    }
    if (getCardPlayBehavior(card) === 'scandal') {
      const targets = opponentIds.filter((pid) => Number(G?.lyapScandalShieldUntilTurn?.[pid] ?? 0) <= Number(ctx?.turn ?? 0));
      setPendingSelection({ type: 'hand-scandal', cardId: card.id });
      setSelectedTargetId(null);
      setReplacementSelectionsByTarget({});
      setActiveReplacementTargetId(targets[0] ?? null);
      postNotice('info', `${v2.pickResource}: ${cardTitle(card.id, card.title, lang)}`);
      return false;
    }
    moves.playCard(card.id, [], undefined);
    postNotice('info', '');
    return true;
  };

  const requestPlayLegendaryCard = (card: CardDefinition) => {
    if (typeof moves.playLegendaryCard !== 'function') return false;
    if (cardNeedsTargetSelection(card)) {
      setPendingSelection({ type: 'legendary-drone', cardId: card.id });
      setSelectedTargetId(null);
      postNotice('info', `${v2.pickTarget}: ${cardTitle(card.id, card.title, lang)}`);
      return false;
    }
    if (cardNeedsResourceSelection(card)) {
      setPendingSelection({ type: 'legendary-water', cardId: card.id });
      setSelectedResource(null);
      postNotice('info', `${v2.pickResource}: ${cardTitle(card.id, card.title, lang)}`);
      return false;
    }
    moves.playLegendaryCard(card.id, undefined, undefined);
    postNotice('info', '');
    return true;
  };

  const currentPendingCard = useMemo(
    () => (pendingSelection
      ? (pendingSelection.type === 'draw-lyap' || pendingSelection.type === 'draw-scandal'
        ? (G?.pendingDrawAutoResolution?.card ?? null)
        : [...hand, ...legendaryHand].find((c) => c.id === pendingSelection.cardId) ?? null)
      : null),
    [G?.pendingDrawAutoResolution?.card, hand, legendaryHand, pendingSelection],
  );

  const replacementTargetIds = useMemo(() => {
    if (!pendingSelection || !currentPendingCard) return [] as string[];
    if (pendingSelection.type === 'hand-lyap') {
      if (!selectedTargetId) return [] as string[];
      const shielded = Number(G?.lyapScandalShieldUntilTurn?.[selectedTargetId] ?? 0) > Number(ctx?.turn ?? 0);
      return shielded ? [] as string[] : [selectedTargetId];
    }
    if (pendingSelection.type === 'hand-scandal') {
      return opponentIds.filter((pid) => Number(G?.lyapScandalShieldUntilTurn?.[pid] ?? 0) <= Number(ctx?.turn ?? 0));
    }
    if (pendingSelection.type === 'draw-lyap') {
      const shielded = Number(G?.lyapScandalShieldUntilTurn?.[id] ?? 0) > Number(ctx?.turn ?? 0);
      return shielded ? [] as string[] : [id];
    }
    if (pendingSelection.type === 'draw-scandal') {
      return Object.keys(G?.players ?? {}).filter((pid) => Number(G?.lyapScandalShieldUntilTurn?.[pid] ?? 0) <= Number(ctx?.turn ?? 0));
    }
    return [] as string[];
  }, [pendingSelection, currentPendingCard, selectedTargetId, G?.lyapScandalShieldUntilTurn, G?.players, ctx?.turn, opponentIds, id]);

  const replacementActiveTargetId = (pendingSelection?.type === 'hand-lyap' || pendingSelection?.type === 'draw-lyap')
    ? ((pendingSelection?.type === 'draw-lyap'
      ? (replacementTargetIds.includes(id) ? id : null)
      : (selectedTargetId && replacementTargetIds.includes(selectedTargetId) ? selectedTargetId : null)))
    : (activeReplacementTargetId && replacementTargetIds.includes(activeReplacementTargetId)
      ? activeReplacementTargetId
      : (replacementTargetIds[0] ?? null));
  const replacementActiveTargetResources = replacementActiveTargetId ? (G?.resources?.[replacementActiveTargetId] ?? null) : null;
  const replacementActiveSlots = (replacementActiveTargetResources && currentPendingCard)
    ? buildReplacementSlots(replacementActiveTargetResources, currentPendingCard.effects).slots
    : [];
  const replacementActiveSelected = replacementActiveTargetId ? (replacementSelectionsByTarget[replacementActiveTargetId] ?? []) : [];

  const appendReplacementResource = (resource: ResourceKey) => {
    if (!replacementActiveTargetId || !replacementActiveTargetResources || !currentPendingCard) return;
    const next = [...replacementActiveSelected, resource];
    if (!isReplacementPrefixValid(replacementActiveTargetResources, currentPendingCard.effects, next)) return;
    if (next.length > replacementActiveSlots.length) return;
    setReplacementSelectionsByTarget((prev) => ({ ...prev, [replacementActiveTargetId]: next }));
  };

  const undoReplacementResource = () => {
    if (!replacementActiveTargetId) return;
    const prevSelected = replacementSelectionsByTarget[replacementActiveTargetId] ?? [];
    if (!prevSelected.length) return;
    setReplacementSelectionsByTarget((prev) => ({
      ...prev,
      [replacementActiveTargetId]: prevSelected.slice(0, -1),
    }));
  };

  const confirmPendingSelection = () => {
    if (!pendingSelection) return;
    if (pendingSelection.type === 'hand-lyap') {
      if (!selectedTargetId) return postNotice('error', v2.targetRequired);
      const selectedCard = hand.find((card) => card.id === pendingSelection.cardId);
      if (!selectedCard) return postNotice('error', v2.actionUnavailable);
      const shielded = Number(G?.lyapScandalShieldUntilTurn?.[selectedTargetId] ?? 0) > Number(ctx?.turn ?? 0);
      const targetResources = G?.resources?.[selectedTargetId];
      if (!targetResources) return postNotice('error', v2.actionUnavailable);
      if (shielded) {
        moves.playCard(pendingSelection.cardId, [], selectedTargetId);
      } else {
        const required = buildReplacementSlots(targetResources, selectedCard.effects).slots.length;
        const selected = replacementSelectionsByTarget[selectedTargetId] ?? [];
        if (selected.length !== required) return postNotice('error', v2.replacementIncomplete);
        if (!isReplacementPrefixValid(targetResources, selectedCard.effects, selected)) {
          return postNotice('error', v2.replacementInvalid);
        }
        moves.playCard(pendingSelection.cardId, selected, selectedTargetId);
      }
    }
    if (pendingSelection.type === 'hand-scandal') {
      const selectedCard = hand.find((card) => card.id === pendingSelection.cardId);
      if (!selectedCard) return postNotice('error', v2.actionUnavailable);
      const targets = opponentIds.filter((pid) => Number(G?.lyapScandalShieldUntilTurn?.[pid] ?? 0) <= Number(ctx?.turn ?? 0));
      const replacementByTarget: Record<string, ResourceKey[]> = {};
      for (const pid of targets) {
        const targetResources = G?.resources?.[pid];
        if (!targetResources) continue;
        const required = buildReplacementSlots(targetResources, selectedCard.effects).slots.length;
        const selected = replacementSelectionsByTarget[pid] ?? [];
        if (selected.length !== required) {
          setActiveReplacementTargetId(pid);
          return postNotice('error', v2.replacementIncomplete);
        }
        if (!isReplacementPrefixValid(targetResources, selectedCard.effects, selected)) {
          setActiveReplacementTargetId(pid);
          return postNotice('error', v2.replacementInvalid);
        }
        replacementByTarget[pid] = selected;
      }
      moves.playCard(pendingSelection.cardId, [], undefined, replacementByTarget);
    }
    if (pendingSelection.type === 'draw-lyap') {
      const pendingCard = G?.pendingDrawAutoResolution?.card;
      if (!pendingCard) return postNotice('error', v2.actionUnavailable);
      const targetResources = G?.resources?.[id];
      if (!targetResources) return postNotice('error', v2.actionUnavailable);
      const required = buildReplacementSlots(targetResources, pendingCard.effects).slots.length;
      const selected = replacementSelectionsByTarget[id] ?? [];
      if (selected.length !== required) return postNotice('error', v2.replacementIncomplete);
      if (!isReplacementPrefixValid(targetResources, pendingCard.effects, selected)) {
        return postNotice('error', v2.replacementInvalid);
      }
      moves.resolveDrawAutoCard?.(selected, {});
    }
    if (pendingSelection.type === 'draw-scandal') {
      const pendingCard = G?.pendingDrawAutoResolution?.card;
      if (!pendingCard) return postNotice('error', v2.actionUnavailable);
      const targets = Object.keys(G?.players ?? {}).filter((pid) => Number(G?.lyapScandalShieldUntilTurn?.[pid] ?? 0) <= Number(ctx?.turn ?? 0));
      const replacementByTarget: Record<string, ResourceKey[]> = {};
      for (const pid of targets) {
        const targetResources = G?.resources?.[pid];
        if (!targetResources) continue;
        const required = buildReplacementSlots(targetResources, pendingCard.effects).slots.length;
        const selected = replacementSelectionsByTarget[pid] ?? [];
        if (selected.length !== required) {
          setActiveReplacementTargetId(pid);
          return postNotice('error', v2.replacementIncomplete);
        }
        if (!isReplacementPrefixValid(targetResources, pendingCard.effects, selected)) {
          setActiveReplacementTargetId(pid);
          return postNotice('error', v2.replacementInvalid);
        }
        replacementByTarget[pid] = selected;
      }
      moves.resolveDrawAutoCard?.([], replacementByTarget);
    }
    if (pendingSelection.type === 'legendary-drone') {
      if (!selectedTargetId) return postNotice('error', v2.targetRequired);
      moves.playLegendaryCard?.(pendingSelection.cardId, selectedTargetId, undefined);
    }
    if (pendingSelection.type === 'legendary-water') {
      if (!selectedResource) return postNotice('error', v2.resourceRequired);
      moves.playLegendaryCard?.(pendingSelection.cardId, undefined, selectedResource);
    }
    clearPendingSelection();
  };

  useEffect(() => {
    if (pendingSelection?.type !== 'hand-scandal') return;
    if (replacementTargetIds.length === 0) {
      setActiveReplacementTargetId(null);
      return;
    }
    if (!activeReplacementTargetId || !replacementTargetIds.includes(activeReplacementTargetId)) {
      setActiveReplacementTargetId(replacementTargetIds[0]);
    }
  }, [pendingSelection, replacementTargetIds, activeReplacementTargetId]);

  return {
    pendingSelection,
    setPendingSelection,
    selectedTargetId,
    setSelectedTargetId,
    selectedResource,
    setSelectedResource,
    replacementSelectionsByTarget,
    setReplacementSelectionsByTarget,
    activeReplacementTargetId,
    setActiveReplacementTargetId,
    currentPendingCard,
    replacementTargetIds,
    replacementActiveTargetId,
    replacementActiveTargetResources,
    replacementActiveSlots,
    replacementActiveSelected,
    requestPlayHandCard,
    requestPlayLegendaryCard,
    confirmPendingSelection,
    clearPendingSelection,
    appendReplacementResource,
    undoReplacementResource,
    activeSelectionNeedsTarget: pendingSelection?.type === 'hand-lyap' || pendingSelection?.type === 'legendary-drone',
    activeSelectionNeedsResource: pendingSelection?.type === 'legendary-water',
    activeSelectionNeedsReplacement:
      pendingSelection?.type === 'hand-lyap'
      || pendingSelection?.type === 'hand-scandal'
      || pendingSelection?.type === 'draw-lyap'
      || pendingSelection?.type === 'draw-scandal',
    pickTargetNotice: (targetId: string) => postNotice('info', `${v2.pickTarget}: ${playerLabelById(targetId)}`),
  };
};
