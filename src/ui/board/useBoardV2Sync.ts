import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { JojGameState, ResourceKey } from '../../game/types';
import type { JojMoveApi } from './types';

type PendingSelection =
  | { type: 'hand-lyap'; cardId: string }
  | { type: 'hand-scandal'; cardId: string }
  | { type: 'draw-lyap'; cardId: string }
  | { type: 'draw-scandal'; cardId: string }
  | { type: 'legendary-drone'; cardId: string }
  | { type: 'legendary-water'; cardId: string };

export const useBoardV2Sync = (args: {
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
  v2: { replacementSelection: string };
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
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (event.key === 'Escape') {
        args.setOpenPreviewKey(null);
        args.setPendingSelection(null);
        args.setSelectedTargetId(null);
        args.setSelectedResource(null);
        return;
      }
      if (event.key.toLowerCase() === 'd' && args.canDraw) {
        event.preventDefault();
        args.moves.drawCard();
      }
      if (event.key.toLowerCase() === 'e' && args.canEndTurn) {
        event.preventDefault();
        args.moves.endTurn?.();
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
    args.setPendingSelection((prev) => {
      if (prev?.type === nextType && prev.cardId === pending.card.id) return prev;
      args.setSelectedTargetId(null);
      args.setSelectedResource(null);
      args.setReplacementSelectionsByTarget({});
      args.setActiveReplacementTargetId(pending.kind === 'SCANDAL' ? (Object.keys(args.G?.players ?? {})[0] ?? null) : args.id);
      args.postNotice('info', `${args.v2.replacementSelection}: ${args.cardTitle(pending.card.id, pending.card.title, args.lang)}`);
      return { type: nextType, cardId: pending.card.id };
    });
  }, [args.G?.pendingDrawAutoResolution, args.G?.players, args.id, args.stage, args.lang]);

  useEffect(() => {
    args.setGameoverModalClosed(false);
  }, [args.ctx?.gameover]);
};
