import type { JojMovesDeps, MoveArgs } from './moveTypes';
import type { JojGameState } from './types';

export type MoveActionType =
  | 'draw-card'
  | 'resolve-draw-auto'
  | 'play-hand-card'
  | 'play-legendary'
  | 'discard-from-hand'
  | 'promote'
  | 'end-turn'
  | 'pass';

export const isLegendaryDraftPending = (G: JojGameState) => {
  if (G.gameMode !== 'standard_plus') return false;
  const playerIDs = Object.keys(G.players ?? {});
  if (playerIDs.length === 0) return false;
  return playerIDs.some((pid) => G.legendaryDraftCompleted?.[pid] !== true);
};

export const isDrawAutoResolutionPending = (G: JojGameState) => Boolean(G.pendingDrawAutoResolution);

export const validateMoveAction = (
  d: JojMovesDeps,
  args: MoveArgs,
  actionType: MoveActionType,
): boolean => {
  const playerID = args.playerID;
  if (!playerID) return false;

  if (actionType === 'play-legendary') {
    if (isLegendaryDraftPending(args.G)) return false;
    if (isDrawAutoResolutionPending(args.G)) return false;
    if (args.G.gameMode === 'simplified') return false;
    if (args.ctx.currentPlayer !== playerID) return false;
    const stage = args.ctx.activePlayers?.[playerID] as string | undefined;
    return stage === d.DRAW_STAGE || stage === d.PLAY_STAGE || stage === d.END_STAGE;
  }

  if (args.ctx.currentPlayer !== playerID) return false;
  if (isLegendaryDraftPending(args.G)) return false;
  if (isDrawAutoResolutionPending(args.G) && actionType !== 'resolve-draw-auto') return false;

  const stage = args.ctx.activePlayers?.[playerID] as string | undefined;
  switch (actionType) {
    case 'draw-card':
      return stage === d.DRAW_STAGE && !isDrawAutoResolutionPending(args.G);
    case 'resolve-draw-auto':
      return stage === d.DRAW_STAGE && isDrawAutoResolutionPending(args.G);
    case 'play-hand-card':
      return d.canPlayHandCardAtStage({
        isCurrentPlayer: true,
        stage,
        extraHandPlayTokens: args.G.extraHandPlayTokens[playerID] ?? 0,
      });
    case 'discard-from-hand':
    case 'promote':
    case 'end-turn':
    case 'pass':
      return stage === d.PLAY_STAGE || stage === d.END_STAGE;
    default:
      return false;
  }
};
