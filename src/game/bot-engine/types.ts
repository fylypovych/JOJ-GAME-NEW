import type { BotDifficulty, BotProfile, JojGameState, ResourceKey } from '../types';
import type { JojMovesDeps, MoveArgs, MoveCtx } from '../moveTypes';

export type BotSetup = {
  count: number;
  difficulty: BotDifficulty;
  profile: BotProfile;
};

export type BotTurnContext = {
  G: JojGameState;
  ctx: MoveCtx;
  playerID: string;
  initialStage: string;
};

export type BotEngineDeps = JojMovesDeps & {
  drawCardHandler: (deps: JojMovesDeps, args: MoveArgs) => unknown;
  resolveDrawAutoCardHandler: (
    deps: JojMovesDeps,
    args: MoveArgs,
    replacementResources?: ResourceKey[],
    replacementByTarget?: Record<string, ResourceKey[]>,
  ) => unknown;
  playCardHandler: (
    deps: JojMovesDeps,
    args: MoveArgs,
    cardId: string,
    replacementResources?: ResourceKey[],
    targetPlayerID?: string,
    replacementByTarget?: Record<string, ResourceKey[]>,
  ) => unknown;
  playLegendaryCardHandler: (
    deps: JojMovesDeps,
    args: MoveArgs,
    cardId: string,
    targetPlayerID?: string,
    selectedResource?: ResourceKey,
  ) => unknown;
  promoteHandler: (deps: JojMovesDeps, args: MoveArgs) => unknown;
  passHandler: (deps: JojMovesDeps, args: MoveArgs) => unknown;
  planReplacementResources: (
    resources: Record<ResourceKey, number>,
    effects: { resource: ResourceKey | 'rank'; value: number }[] | undefined,
  ) => ResourceKey[] | null;
};

export type BotExecutor = (args: {
  G: JojGameState;
  ctx: MoveCtx;
  playerID?: string;
  events?: {
    setStage?: (stage: string) => void;
    endTurn?: () => void;
  };
}) => unknown;
