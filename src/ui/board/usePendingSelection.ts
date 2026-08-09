import { useEffect, useMemo, useState } from 'react';
import { cardNeedsResourceSelection, cardNeedsTargetSelection, getCardPlayBehavior } from '../../game/cardRules';
import type { CardDefinition, JojGameState, ResourceKey } from '../../game/types';
import {
  buildReplacementSlots,
  getRequiredReplacementSelectionCount,
  isReplacementPrefixValid,
  planReplacementSelection,
} from './replacement';
import type { JojMoveApi } from './types';
import type { Language } from '../i18n';

export type PendingSelection =
  | { type: 'hand-lyap'; cardId: string }
  | { type: 'hand-scandal'; cardId: string }
  | { type: 'draw-lyap'; cardId: string }
  | { type: 'draw-scandal'; cardId: string }
  | { type: 'legendary-drone'; cardId: string; fromHand?: boolean }
  | { type: 'legendary-water'; cardId: string; fromHand?: boolean }
  | { type: 'vvnz-payment'; cardId: string };

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
  board: Record<string, string>;
  postNotice: (type: NoticeKind, msg: string) => void;
  playerLabelById: (id: string | null | undefined) => string;
  cardTitle: (id: string, title: string, lang: Language) => string;
};

const hasActiveShield = (
  shieldUntilTurn: number | undefined,
  currentTurn: number | undefined,
) => Number(shieldUntilTurn ?? 0) > Number(currentTurn ?? 0);

export const targetNeedsReplacementSelection = (
  resources: Record<ResourceKey, number> | null | undefined,
  effects: CardDefinition['effects'] | null | undefined,
) => {
  if (!resources || !effects) return false;
  return getRequiredReplacementSelectionCount(resources, effects) > 0;
};

export const getPendingReplacementTargetIds = (args: {
  pendingSelection: PendingSelection | null;
  currentPendingCard: CardDefinition | null;
  selectedTargetId: string | null;
  shieldByPlayer?: Record<string, number>;
  allPlayerIds: string[];
  opponentIds: string[];
  resourcesByPlayer?: Record<string, Record<ResourceKey, number>>;
  currentTurn?: number;
  selfPlayerId: string;
}) => {
  const {
    pendingSelection,
    currentPendingCard,
    selectedTargetId,
    shieldByPlayer,
    allPlayerIds,
    opponentIds,
    resourcesByPlayer,
    currentTurn,
    selfPlayerId,
  } = args;
  if (!pendingSelection || !currentPendingCard) return [] as string[];

  const candidateIds = (() => {
    if (pendingSelection.type === 'hand-lyap') {
      return selectedTargetId ? [selectedTargetId] : [];
    }
    if (pendingSelection.type === 'hand-scandal') {
      return opponentIds;
    }
    if (pendingSelection.type === 'draw-lyap') {
      return [selfPlayerId];
    }
    if (pendingSelection.type === 'draw-scandal') {
      return allPlayerIds;
    }
    return [] as string[];
  })();

  return candidateIds.filter((playerId) => {
    if (hasActiveShield(shieldByPlayer?.[playerId], currentTurn)) return false;
    return targetNeedsReplacementSelection(resourcesByPlayer?.[playerId], currentPendingCard.effects);
  });
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
  board,
  postNotice,
  playerLabelById,
  cardTitle,
}: UsePendingSelectionArgs) => {
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<ResourceKey | null>(null);
  const [vvnzSelectedResources, setVvnzSelectedResources] = useState<ResourceKey[]>([]);
  const [replacementSelectionsByTarget, setReplacementSelectionsByTarget] = useState<Record<string, ResourceKey[]>>({});
  const [activeReplacementTargetId, setActiveReplacementTargetId] = useState<string | null>(null);
  const botPlayerIds = useMemo(() => new Set(Object.keys(G?.botPlayers ?? {})), [G?.botPlayers]);

  const clearPendingSelection = () => {
    resetSelectionState(
      setPendingSelection,
      setSelectedTargetId,
      setSelectedResource,
      setReplacementSelectionsByTarget,
      setActiveReplacementTargetId,
      () => postNotice('info', ''),
    );
    setVvnzSelectedResources([]);
  };

  const requestPlayHandCard = (card: CardDefinition) => {
    if (getCardPlayBehavior(card) === 'lyap') {
      setPendingSelection({ type: 'hand-lyap', cardId: card.id });
      setSelectedTargetId(null);
      setReplacementSelectionsByTarget({});
      setActiveReplacementTargetId(null);
      postNotice('info', `${board.pickTarget}: ${cardTitle(card.id, card.title, lang)}`);
      return false;
    }
    if (getCardPlayBehavior(card) === 'scandal') {
      const targetsNeedingReplacement = opponentIds.filter((pid) => (
        !hasActiveShield(G?.lyapScandalShieldUntilTurn?.[pid], ctx?.turn)
        && targetNeedsReplacementSelection(G?.resources?.[pid], card.effects)
      ));
      if (targetsNeedingReplacement.length === 0) {
        moves.playCard(card.id, [], undefined, {});
        postNotice('info', '');
        return true;
      }
      setPendingSelection({ type: 'hand-scandal', cardId: card.id });
      setSelectedTargetId(null);
      setReplacementSelectionsByTarget({});
      setActiveReplacementTargetId(targetsNeedingReplacement[0] ?? null);
      postNotice('info', `${board.pickResource}: ${cardTitle(card.id, card.title, lang)}`);
      return false;
    }
    if (getCardPlayBehavior(card) === 'vvnz') {
      setPendingSelection({ type: 'vvnz-payment', cardId: card.id });
      setVvnzSelectedResources([]);
      postNotice('info', `${board.pickTwoResources}: ${cardTitle(card.id, card.title, lang)}`);
      return false;
    }
    if (getCardPlayBehavior(card) === 'legendary' && cardNeedsTargetSelection(card)) {
      setPendingSelection({ type: 'legendary-drone', cardId: card.id, fromHand: true });
      setSelectedTargetId(null);
      postNotice('info', `${board.pickTarget}: ${cardTitle(card.id, card.title, lang)}`);
      return false;
    }
    if (getCardPlayBehavior(card) === 'legendary' && cardNeedsResourceSelection(card)) {
      setPendingSelection({ type: 'legendary-water', cardId: card.id, fromHand: true });
      setSelectedResource(null);
      postNotice('info', `${board.pickResource}: ${cardTitle(card.id, card.title, lang)}`);
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
      postNotice('info', `${board.pickTarget}: ${cardTitle(card.id, card.title, lang)}`);
      return false;
    }
    if (cardNeedsResourceSelection(card)) {
      setPendingSelection({ type: 'legendary-water', cardId: card.id });
      setSelectedResource(null);
      postNotice('info', `${board.pickResource}: ${cardTitle(card.id, card.title, lang)}`);
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

  const replacementTargetIds = useMemo(() => getPendingReplacementTargetIds({
    pendingSelection,
    currentPendingCard,
    selectedTargetId,
    shieldByPlayer: G?.lyapScandalShieldUntilTurn,
    allPlayerIds: Object.keys(G?.players ?? {}),
    opponentIds,
    resourcesByPlayer: G?.resources,
    currentTurn: ctx?.turn,
    selfPlayerId: id,
  }), [
    pendingSelection,
    currentPendingCard,
    selectedTargetId,
    G?.lyapScandalShieldUntilTurn,
    G?.players,
    G?.resources,
    ctx?.turn,
    opponentIds,
    id,
  ]);

  const manualReplacementTargetIds = useMemo(
    () => replacementTargetIds.filter((playerId) => !botPlayerIds.has(playerId)),
    [replacementTargetIds, botPlayerIds],
  );

  const replacementActiveTargetId = (pendingSelection?.type === 'hand-lyap' || pendingSelection?.type === 'draw-lyap')
    ? ((pendingSelection?.type === 'draw-lyap'
      ? (manualReplacementTargetIds.includes(id) ? id : null)
      : (selectedTargetId && manualReplacementTargetIds.includes(selectedTargetId) ? selectedTargetId : null)))
    : (activeReplacementTargetId && manualReplacementTargetIds.includes(activeReplacementTargetId)
      ? activeReplacementTargetId
      : (manualReplacementTargetIds[0] ?? null));
  const replacementActiveTargetResources = replacementActiveTargetId ? (G?.resources?.[replacementActiveTargetId] ?? null) : null;
  const replacementActiveSlots = (replacementActiveTargetResources && currentPendingCard)
    ? (getRequiredReplacementSelectionCount(replacementActiveTargetResources, currentPendingCard.effects) > 0
      ? buildReplacementSlots(replacementActiveTargetResources, currentPendingCard.effects).slots
      : [])
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
      if (!selectedTargetId) return postNotice('error', board.targetRequired);
      const selectedCard = hand.find((card) => card.id === pendingSelection.cardId);
      if (!selectedCard) return postNotice('error', board.actionUnavailable);
      const shielded = hasActiveShield(G?.lyapScandalShieldUntilTurn?.[selectedTargetId], ctx?.turn);
      const targetResources = G?.resources?.[selectedTargetId];
      if (!targetResources) return postNotice('error', board.actionUnavailable);
      if (shielded) {
        moves.playCard(pendingSelection.cardId, [], selectedTargetId);
      } else {
        const required = getRequiredReplacementSelectionCount(targetResources, selectedCard.effects);
        const selected = replacementSelectionsByTarget[selectedTargetId] ?? [];
        if (selected.length !== required) return postNotice('error', board.replacementIncomplete);
        if (!isReplacementPrefixValid(targetResources, selectedCard.effects, selected)) {
          return postNotice('error', board.replacementInvalid);
        }
        moves.playCard(pendingSelection.cardId, selected, selectedTargetId);
      }
    }
    if (pendingSelection.type === 'hand-scandal') {
      const selectedCard = hand.find((card) => card.id === pendingSelection.cardId);
      if (!selectedCard) return postNotice('error', board.actionUnavailable);
      const targets = opponentIds.filter((pid) => Number(G?.lyapScandalShieldUntilTurn?.[pid] ?? 0) <= Number(ctx?.turn ?? 0));
      const replacementByTarget: Record<string, ResourceKey[]> = {};
      for (const pid of targets) {
        const targetResources = G?.resources?.[pid];
        if (!targetResources) continue;
        const required = getRequiredReplacementSelectionCount(targetResources, selectedCard.effects);
        const selected = botPlayerIds.has(pid)
          ? (planReplacementSelection(targetResources, selectedCard.effects) ?? [])
          : (replacementSelectionsByTarget[pid] ?? []);
        if (selected.length !== required) {
          if (!botPlayerIds.has(pid)) setActiveReplacementTargetId(pid);
          return postNotice('error', board.replacementIncomplete);
        }
        if (!isReplacementPrefixValid(targetResources, selectedCard.effects, selected)) {
          if (!botPlayerIds.has(pid)) setActiveReplacementTargetId(pid);
          return postNotice('error', board.replacementInvalid);
        }
        replacementByTarget[pid] = selected;
      }
      moves.playCard(pendingSelection.cardId, [], undefined, replacementByTarget);
    }
    if (pendingSelection.type === 'draw-lyap') {
      const pendingCard = G?.pendingDrawAutoResolution?.card;
      if (!pendingCard) return postNotice('error', board.actionUnavailable);
      const targetResources = G?.resources?.[id];
      if (!targetResources) return postNotice('error', board.actionUnavailable);
      const required = getRequiredReplacementSelectionCount(targetResources, pendingCard.effects);
      const selected = replacementSelectionsByTarget[id] ?? [];
      if (selected.length !== required) return postNotice('error', board.replacementIncomplete);
      if (!isReplacementPrefixValid(targetResources, pendingCard.effects, selected)) {
        return postNotice('error', board.replacementInvalid);
      }
      moves.resolveDrawAutoCard?.(selected, {});
    }
    if (pendingSelection.type === 'draw-scandal') {
      const pendingCard = G?.pendingDrawAutoResolution?.card;
      if (!pendingCard) return postNotice('error', board.actionUnavailable);
      const targets = Object.keys(G?.players ?? {}).filter((pid) => Number(G?.lyapScandalShieldUntilTurn?.[pid] ?? 0) <= Number(ctx?.turn ?? 0));
      const replacementByTarget: Record<string, ResourceKey[]> = {};
      for (const pid of targets) {
        const targetResources = G?.resources?.[pid];
        if (!targetResources) continue;
        const required = getRequiredReplacementSelectionCount(targetResources, pendingCard.effects);
        const selected = botPlayerIds.has(pid)
          ? (planReplacementSelection(targetResources, pendingCard.effects) ?? [])
          : (replacementSelectionsByTarget[pid] ?? []);
        if (selected.length !== required) {
          if (!botPlayerIds.has(pid)) setActiveReplacementTargetId(pid);
          return postNotice('error', board.replacementIncomplete);
        }
        if (!isReplacementPrefixValid(targetResources, pendingCard.effects, selected)) {
          if (!botPlayerIds.has(pid)) setActiveReplacementTargetId(pid);
          return postNotice('error', board.replacementInvalid);
        }
        replacementByTarget[pid] = selected;
      }
      moves.resolveDrawAutoCard?.([], replacementByTarget);
    }
    if (pendingSelection.type === 'legendary-drone') {
      if (!selectedTargetId) return postNotice('error', board.targetRequired);
      if (pendingSelection.fromHand) moves.playCard(pendingSelection.cardId, [], selectedTargetId);
      else moves.playLegendaryCard?.(pendingSelection.cardId, selectedTargetId, undefined);
    }
    if (pendingSelection.type === 'legendary-water') {
      if (!selectedResource) return postNotice('error', board.resourceRequired);
      if (pendingSelection.fromHand) moves.playCard(pendingSelection.cardId, [selectedResource], undefined);
      else moves.playLegendaryCard?.(pendingSelection.cardId, undefined, selectedResource);
    }
    clearPendingSelection();
  };

  useEffect(() => {
    if (pendingSelection?.type !== 'hand-scandal') return;
    if (manualReplacementTargetIds.length === 0) {
      setActiveReplacementTargetId(null);
      return;
    }
    if (!activeReplacementTargetId || !manualReplacementTargetIds.includes(activeReplacementTargetId)) {
      setActiveReplacementTargetId(manualReplacementTargetIds[0]);
    }
  }, [pendingSelection, manualReplacementTargetIds, activeReplacementTargetId]);

  useEffect(() => {
    if (pendingSelection?.type !== 'hand-lyap' || !selectedTargetId || !currentPendingCard) return;
    const shielded = hasActiveShield(G?.lyapScandalShieldUntilTurn?.[selectedTargetId], ctx?.turn);
    if (shielded) return;
    const targetResources = G?.resources?.[selectedTargetId];
    if (!targetResources) return;
    const required = getRequiredReplacementSelectionCount(targetResources, currentPendingCard.effects);
    if (required > 0 && !botPlayerIds.has(selectedTargetId)) return;
    const autoReplacement = required > 0
      ? (planReplacementSelection(targetResources, currentPendingCard.effects) ?? [])
      : [];
    if (autoReplacement.length !== required) return;
    moves.playCard(pendingSelection.cardId, autoReplacement, selectedTargetId);
    clearPendingSelection();
  }, [
    pendingSelection,
    selectedTargetId,
    currentPendingCard,
    G?.lyapScandalShieldUntilTurn,
    G?.resources,
    ctx?.turn,
    moves,
    botPlayerIds,
  ]);

  const toggleVvnzResource = (resourceKey: ResourceKey) => {
    setVvnzSelectedResources((prev) => {
      if (prev.includes(resourceKey)) {
        return prev.filter((k) => k !== resourceKey);
      }
      if (prev.length >= 2) return prev;
      return [...prev, resourceKey];
    });
  };

  const confirmVvnzPayment = () => {
    if (pendingSelection?.type !== 'vvnz-payment') return;
    if (vvnzSelectedResources.length !== 2) {
      postNotice('error', board.selectTwoResources);
      return;
    }
    const card = currentPendingCard;
    if (!card) return;
    moves.playCard(card.id, vvnzSelectedResources, undefined);
    clearPendingSelection();
  };

  return {
    pendingSelection,
    setPendingSelection,
    selectedTargetId,
    setSelectedTargetId,
    selectedResource,
    setSelectedResource,
    vvnzSelectedResources,
    toggleVvnzResource,
    confirmVvnzPayment,
    replacementSelectionsByTarget,
    setReplacementSelectionsByTarget,
    activeReplacementTargetId,
    setActiveReplacementTargetId,
    currentPendingCard,
    replacementTargetIds: manualReplacementTargetIds,
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
    activeSelectionNeedsReplacement: manualReplacementTargetIds.length > 0,
    activeSelectionNeedsVvnzPayment: pendingSelection?.type === 'vvnz-payment',
    pickTargetNotice: (targetId: string) => postNotice('info', `${board.pickTarget}: ${playerLabelById(targetId)}`),
  };
};

