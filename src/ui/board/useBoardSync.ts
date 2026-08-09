import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { JojGameState, ResourceKey } from '../../game/types';
import type { JojMoveApi } from './types';
import { getPendingReplacementTargetIds } from './usePendingSelection';

type PendingSelection =
  | { type: 'hand-lyap'; cardId: string }
  | { type: 'hand-scandal'; cardId: string }
  | { type: 'draw-lyap'; cardId: string }
  | { type: 'draw-scandal'; cardId: string }
  | { type: 'legendary-drone'; cardId: string; fromHand?: boolean }
  | { type: 'legendary-water'; cardId: string; fromHand?: boolean }
  | { type: 'vvnz-payment'; cardId: string };

export const useBoardSync = (args: {
  G?: JojGameState;
  ctx?: { turn?: number; gameover?: unknown };
  playerID?: string;
  playerName: string;
  knownPlayerNames: Record<string, string>;
  moves: JojMoveApi;
  canDraw: boolean;
  canEndTurn: boolean;
  stage?: string;
  id: string;
  board: { replacementSelection: string; actionUnavailable: string };
  lang: 'uk' | 'en';
  cardTitle: (id: string, title: string, lang: 'uk' | 'en') => string;
  onStateChange?: (payload: { G: JojGameState; ctx: unknown }) => void;
  setOpenPreviewKey: Dispatch<SetStateAction<string | null>>;
  setPendingSelection: Dispatch<SetStateAction<PendingSelection | null>>;
  setSelectedTargetId: Dispatch<SetStateAction<string | null>>;
  setSelectedResource: Dispatch<SetStateAction<ResourceKey | null>>;
  setReplacementSelectionsByTarget: Dispatch<SetStateAction<Record<string, ResourceKey[]>>>;
  setActiveReplacementTargetId: Dispatch<SetStateAction<string | null>>;
  setDraftSelection: Dispatch<SetStateAction<string[]>>;
  setGameoverModalClosed: Dispatch<SetStateAction<boolean>>;
  postNotice: (type: 'info' | 'error' | 'success', msg: string) => void;
  syncedNameRef: MutableRefObject<string>;
  syncedNamesSignatureRef: MutableRefObject<string>;
  chatLogRef: MutableRefObject<HTMLDivElement | null>;
}) => {
  const isInteractiveTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    if (!element) return false;
    const tagName = element.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || tagName === 'BUTTON') return true;
    return Boolean(element.closest('[contenteditable="true"], [role="button"]'));
  };

  const resolveMoveErrorText = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return fallback;
  };

  const runMove = (move: (() => unknown) | undefined, fallback: string) => {
    if (!move) return;
    try {
      const result = move();
      Promise.resolve(result).catch((error) => {
        args.postNotice('error', resolveMoveErrorText(error, fallback));
      });
    } catch (error) {
      args.postNotice('error', resolveMoveErrorText(error, fallback));
    }
  };

  useEffect(() => {
    if (!args.G || !args.ctx) return;
    args.onStateChange?.({ G: args.G, ctx: args.ctx });
  }, [args.G, args.ctx, args.onStateChange]);

  useEffect(() => {
    if (!args.playerID || !args.playerName.trim() || typeof args.moves.setPlayerName !== 'function') return;
    const trimmed = args.playerName.trim();
    if (args.syncedNameRef.current === trimmed) return;
    args.moves.setPlayerName(trimmed);
    args.syncedNameRef.current = trimmed;
  }, [args.moves, args.playerID, args.playerName]);

  useEffect(() => {
    if (!args.playerID || typeof args.moves.syncPlayerNames !== 'function') return;
    const cachedName = args.knownPlayerNames[args.playerID]?.trim() ?? '';
    if (!cachedName || cachedName === args.playerName.trim()) return;
    const signature = `${args.playerID}:${cachedName}`;
    if (args.syncedNamesSignatureRef.current === signature) return;
    args.moves.syncPlayerNames({ [args.playerID]: cachedName });
    args.syncedNamesSignatureRef.current = signature;
  }, [args.knownPlayerNames, args.moves, args.playerID, args.playerName]);

  useEffect(() => {
    if (!args.chatLogRef.current) return;
    args.chatLogRef.current.scrollTop = args.chatLogRef.current.scrollHeight;
  }, [args.G?.chat?.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || isInteractiveTarget(event.target)) return;
      if (event.key === 'Escape') {
        args.setOpenPreviewKey(null);
        args.setPendingSelection(null);
        args.setSelectedTargetId(null);
        args.setSelectedResource(null);
        return;
      }
      if (event.key.toLowerCase() === 'd' && args.canDraw) {
        event.preventDefault();
        runMove(() => args.moves.drawCard(), args.board.actionUnavailable);
      }
      if (event.key.toLowerCase() === 'e' && args.canEndTurn) {
        event.preventDefault();
        runMove(() => args.moves.endTurn?.(), args.board.actionUnavailable);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [args.canDraw, args.canEndTurn, args.moves]);

  useEffect(() => {
    args.setPendingSelection(null);
    args.setSelectedTargetId(null);
    args.setSelectedResource(null);
    args.setReplacementSelectionsByTarget({});
    args.setActiveReplacementTargetId(null);
    args.setDraftSelection([]);
  }, [args.ctx?.turn, args.stage, args.id]);

  useEffect(() => {
    const pending = args.G?.pendingDrawAutoResolution;
    if (!pending || pending.sourcePlayerID !== args.id || args.stage !== 'draw') {
      if (pending?.kind && (pending.kind === 'LYAP' || pending.kind === 'SCANDAL')) {
        args.setPendingSelection((prev) => {
          if (prev?.type === 'draw-lyap' || prev?.type === 'draw-scandal') return null;
          return prev;
        });
        args.setReplacementSelectionsByTarget({});
        args.setActiveReplacementTargetId(null);
      }
      return;
    }
    const nextType = pending.kind === 'LYAP' ? 'draw-lyap' : 'draw-scandal';
    const replacementTargetIds = getPendingReplacementTargetIds({
      pendingSelection: { type: nextType, cardId: pending.card.id },
      currentPendingCard: pending.card,
      selectedTargetId: null,
      shieldByPlayer: args.G?.lyapScandalShieldUntilTurn,
      allPlayerIds: Object.keys(args.G?.players ?? {}),
      opponentIds: Object.keys(args.G?.players ?? {}).filter((pid) => pid !== args.id),
      resourcesByPlayer: args.G?.resources,
      currentTurn: args.ctx?.turn,
      selfPlayerId: args.id,
    });
    if (replacementTargetIds.length === 0) {
      args.setPendingSelection((prev) => (
        prev?.type === 'draw-lyap' || prev?.type === 'draw-scandal' ? null : prev
      ));
      args.setSelectedTargetId(null);
      args.setSelectedResource(null);
      args.setReplacementSelectionsByTarget({});
      args.setActiveReplacementTargetId(null);
      runMove(
        () => args.moves.resolveDrawAutoCard?.([], {}),
        args.board.actionUnavailable,
      );
      return;
    }
    args.setPendingSelection((prev) => {
      if (prev?.type === nextType && prev.cardId === pending.card.id) return prev;
      args.setSelectedTargetId(null);
      args.setSelectedResource(null);
      args.setReplacementSelectionsByTarget({});
      args.setActiveReplacementTargetId(replacementTargetIds[0] ?? null);
      args.postNotice('info', `${args.board.replacementSelection}: ${args.cardTitle(pending.card.id, pending.card.title, args.lang)}`);
      return { type: nextType, cardId: pending.card.id };
    });
  }, [args.G?.pendingDrawAutoResolution, args.G?.players, args.G?.lyapScandalShieldUntilTurn, args.G?.resources, args.ctx?.turn, args.id, args.stage, args.lang]);

  useEffect(() => {
    args.setGameoverModalClosed(false);
  }, [args.ctx?.gameover]);
};

