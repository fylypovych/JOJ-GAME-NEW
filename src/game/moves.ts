import type { Ctx } from 'boardgame.io';
import type { JojGameState } from './types';
import {
  discardFromHandHandler,
  drawCardHandler,
  endTurnHandler,
  isDrawAutoResolutionPending,
  isLegendaryDraftPending,
  passHandler,
  playCardHandler,
  playLegendaryCardHandler,
  promoteHandler,
  resolveDrawAutoCardHandler,
} from './moveHandlers';
import type { JojMovesDeps, MoveArgs, ReplacementByTarget } from './moveTypes';
import type { ResourceKey } from './types';

export type { MoveArgs, MoveCtx, MoveEvents, JojMovesDeps, ReplacementByTarget } from './moveTypes';

export const createJojMoves = (d: JojMovesDeps) => ({
  requestEndGameVote: (args: MoveArgs) => {
    const playerID = args.playerID;
    if (!playerID || !(playerID in args.G.players)) return d.INVALID_MOVE;
    if (args.G.endGameVote?.active) return d.INVALID_MOVE;
    const votes: Record<string, boolean> = { [playerID]: true };
    Object.keys(args.G.botPlayers ?? {}).forEach((pid) => {
      if (pid in args.G.players) votes[pid] = true;
    });
    args.G.endGameVote = { active: true, requestedBy: playerID, votes };
    return undefined;
  },
  respondEndGameVote: (args: MoveArgs, agree: boolean) => {
    const playerID = args.playerID;
    if (!playerID || !(playerID in args.G.players)) return d.INVALID_MOVE;
    if (!args.G.endGameVote?.active) return d.INVALID_MOVE;
    if (!agree) {
      d.resetEndGameVote(args.G);
      return undefined;
    }
    args.G.endGameVote.votes[playerID] = true;
    Object.keys(args.G.botPlayers ?? {}).forEach((pid) => {
      if (pid in args.G.players) args.G.endGameVote.votes[pid] = true;
    });
    return undefined;
  },
  syncPlayerNames: (args: MoveArgs, names: Record<string, string>) => {
    const playerID = args.playerID;
    if (!playerID || !(playerID in args.G.players)) return d.INVALID_MOVE;
    if (!names || typeof names !== 'object') return d.INVALID_MOVE;
    const value = names[playerID];
    if (typeof value !== 'string') return d.INVALID_MOVE;
    const trimmed = value.trim();
    if (!trimmed) return d.INVALID_MOVE;
    args.G.playerNames[playerID] = trimmed.slice(0, 32);
    return undefined;
  },
  setPlayerName: (args: MoveArgs, name: string) => {
    const playerID = args.playerID;
    if (!playerID) return d.INVALID_MOVE;
    const trimmed = name.trim();
    if (!trimmed) return d.INVALID_MOVE;
    args.G.playerNames[playerID] = trimmed.slice(0, 32);
    return undefined;
  },
  selectLegendaryLoadout: (args: MoveArgs, cardIds: string[]) => {
    const playerID = args.playerID;
    if (!playerID) return d.INVALID_MOVE;
    if (args.G.gameMode !== 'standard_plus') return d.INVALID_MOVE;
    if (args.G.legendaryDraftCompleted?.[playerID]) return d.INVALID_MOVE;
    if (!Array.isArray(cardIds)) return d.INVALID_MOVE;
    const normalizedIds = cardIds.map((id) => String(id).trim()).filter(Boolean);
    const uniqueIds = Array.from(new Set(normalizedIds));
    if (uniqueIds.length !== 5) return d.INVALID_MOVE;
    const byId = new Map((args.G.legendaryDeck ?? []).map((card) => [card.id, card] as const));
    const selected = uniqueIds.map((id) => byId.get(id)).filter((card) => Boolean(card));
    if (selected.length !== 5) return d.INVALID_MOVE;
    args.G.legendaryHands[playerID] = selected.map((card) => ({ ...card! }));
    args.G.legendaryDraftCompleted[playerID] = true;
    d.syncPlayerState(args.G, playerID);
    return undefined;
  },
  sendChat: (args: MoveArgs, text: string) => {
    const playerID = args.playerID;
    if (!playerID) return d.INVALID_MOVE;
    const trimmed = text.trim();
    if (!trimmed) return d.INVALID_MOVE;
    d.appendChat(args.G, { type: 'player', playerID, text: trimmed.slice(0, 280) });
    return undefined;
  },
  drawCard: (args: MoveArgs) => drawCardHandler(d, args),
  resolveDrawAutoCard: (
    args: MoveArgs,
    replacementResources: ResourceKey[] = [],
    replacementByTarget: ReplacementByTarget = {},
  ) => resolveDrawAutoCardHandler(d, args, replacementResources, replacementByTarget),
  playCard: (
    args: MoveArgs,
    cardId: string,
    replacementResources: ResourceKey[] = [],
    targetPlayerID?: string,
    replacementByTarget: ReplacementByTarget = {},
  ) => playCardHandler(d, args, cardId, replacementResources, targetPlayerID, replacementByTarget),
  playLegendaryCard: (args: MoveArgs, cardId: string, targetPlayerID?: string, selectedResource?: ResourceKey) =>
    playLegendaryCardHandler(d, args, cardId, targetPlayerID, selectedResource),
  discardFromHand: (args: MoveArgs, cardId: string) => discardFromHandHandler(d, args, cardId),
  promote: (args: MoveArgs) => promoteHandler(d, args),
  endTurn: (args: MoveArgs) => endTurnHandler(d, args),
  pass: (args: MoveArgs) => passHandler(d, args),
});

export const enumerateAiMoves = (deps: {
  DRAW_STAGE: string;
  END_STAGE: string;
}) => (G: JojGameState, ctx: Ctx, playerID?: string) => {
  if (!playerID) return [];
  if (isLegendaryDraftPending(G) || isDrawAutoResolutionPending(G)) return [];
  const stage = ctx.activePlayers?.[playerID];
  if (stage === deps.DRAW_STAGE) return [{ move: 'drawCard' }];
  if ((stage === deps.END_STAGE || stage === 'play') && (G.deck?.length ?? 0) === 0) return [{ move: 'pass' }];
  if (stage === deps.END_STAGE || stage === 'play') return [{ move: 'endTurn' }];
  return [];
};
