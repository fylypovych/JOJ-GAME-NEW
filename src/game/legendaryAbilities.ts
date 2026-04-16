import type { MoveCtx } from './moveTypes';
import type { CardDefinition, JojGameState, ResourceKey } from './types';

type LegendaryAbilityDeps = {
  INVALID_MOVE: 'INVALID_MOVE';
  resourceKeys: readonly ResourceKey[];
  resourceLabelsUk: Record<ResourceKey, string>;
  legendaryTexts: {
    budanovCanceled: (playerLabel: string, cardTitle: string, summaryText: string) => string;
    budanovNoTarget: () => string;
    starlinkCanceled: (playerLabel: string, cardTitle: string, summaryText: string) => string;
    starlinkNoTarget: () => string;
    sukhpayActivated: (playerLabel: string) => string;
    grammarShield: (playerLabel: string) => string;
    posmishkaMalyuka: (playerLabel: string) => string;
    statueTor: (playerLabel: string, resourceLabel: string) => string;
    churchLeadership: (playerLabel: string) => string;
    waterRestore: (playerLabel: string, resourceLabel: string, before: number, after: number) => string;
    droidDemote: (targetPlayerLabel: string, fromRankName: string, toRankName: string) => string;
  };
  effectSummaryToText: (summary: { resources: Partial<Record<ResourceKey, number>>; rank: number }) => string;
  rankNameById: (rankId: string) => string;
  resourceDeltaToText: (delta: Partial<Record<ResourceKey, number>>) => string;
  clampNonNegativeResources: (resources: Record<ResourceKey, number>) => void;
  syncPlayerState: (G: JojGameState, playerID: string) => void;
  getPlayerLabel: (G: JojGameState, playerID: string) => string;
  computeShieldUntilNextOwnTurn: (ctx: Pick<MoveCtx, 'currentPlayer' | 'playOrder' | 'turn'>, playerID: string) => number;
  cancelLastLyapOrScandalForPlayer: (
    G: JojGameState,
    playerID: string,
  ) => { canceledCard?: CardDefinition | null; summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } };
  cancelLastScandalForPlayer: (
    G: JojGameState,
    playerID: string,
  ) => { canceledCard?: CardDefinition | null; summary: { resources: Partial<Record<ResourceKey, number>>; rank: number } };
  grantSpecificRankIgnoringRequirements: (
    G: JojGameState,
    playerID: string,
    rankId: string,
    playerCount: number,
  ) => { ok: true; applied: boolean; rank: { bonus?: Partial<Record<ResourceKey, number>> } } | { ok: false; reason: string };
  demoteByOneRankWithSeatCheck: (
    G: JojGameState,
    playerID: string,
    playerCount: number,
  ) => { ok: true; fromRankId: string; toRankId: string } | { ok: false; reason: string };
};

type LegendaryAbilityArgs = {
  d: LegendaryAbilityDeps;
  G: JojGameState;
  ctx: Pick<MoveCtx, 'currentPlayer' | 'playOrder' | 'turn' | 'numPlayers'>;
  playerID: string;
  targetPlayerID?: string;
  selectedResource?: ResourceKey;
};

type LegendaryAbilityHandler = (args: LegendaryAbilityArgs) => string | 'INVALID_MOVE';

const legendaryAbilityRegistry: Record<string, LegendaryAbilityHandler> = {
  'legendary-02': ({ d, G, playerID }) => {
    const playerLabel = d.getPlayerLabel(G, playerID);
    const canceled = d.cancelLastLyapOrScandalForPlayer(G, playerID);
    return canceled.canceledCard
      ? d.legendaryTexts.budanovCanceled(playerLabel, canceled.canceledCard.title, d.effectSummaryToText(canceled.summary))
      : d.legendaryTexts.budanovNoTarget();
  },
  'legendary-08': ({ d, G, playerID }) => {
    const playerLabel = d.getPlayerLabel(G, playerID);
    const canceled = d.cancelLastScandalForPlayer(G, playerID);
    return canceled.canceledCard
      ? d.legendaryTexts.starlinkCanceled(playerLabel, canceled.canceledCard.title, d.effectSummaryToText(canceled.summary))
      : d.legendaryTexts.starlinkNoTarget();
  },
  'legendary-05': ({ d, G, ctx, playerID }) => {
    const playerLabel = d.getPlayerLabel(G, playerID);
    const untilTurn = d.computeShieldUntilNextOwnTurn(ctx, playerID);
    G.sukhpayZsuWatchUntilTurn[playerID] = untilTurn;
    G.sukhpayZsuPendingBonus[playerID] = true;
    return d.legendaryTexts.sukhpayActivated(playerLabel);
  },
  'legendary-12': ({ d, G, ctx, playerID }) => {
    const playerLabel = d.getPlayerLabel(G, playerID);
    const untilTurn = d.computeShieldUntilNextOwnTurn(ctx, playerID);
    G.lyapScandalShieldUntilTurn[playerID] = untilTurn;
    return d.legendaryTexts.grammarShield(playerLabel);
  },
  'legendary-03': ({ d, G, playerID }) => {
    const playerLabel = d.getPlayerLabel(G, playerID);
    G.extraHandPlayTokens[playerID] = (G.extraHandPlayTokens[playerID] ?? 0) + 1;
    return d.legendaryTexts.posmishkaMalyuka(playerLabel);
  },
  'legendary-06': ({ d, G, playerID, selectedResource }) => {
    const playerLabel = d.getPlayerLabel(G, playerID);
    if (!selectedResource || !d.resourceKeys.includes(selectedResource)) return d.INVALID_MOVE;
    G.resources[playerID][selectedResource] = (G.resources[playerID][selectedResource] ?? 0) + 3;
    Object.keys(G.players).filter((pid) => pid !== playerID).forEach((pid) => {
      G.resources[pid].discipline = (G.resources[pid].discipline ?? 0) + 1;
      d.clampNonNegativeResources(G.resources[pid]);
      d.syncPlayerState(G, pid);
    });
    d.clampNonNegativeResources(G.resources[playerID]);
    d.syncPlayerState(G, playerID);
    return d.legendaryTexts.statueTor(playerLabel, d.resourceLabelsUk[selectedResource]);
  },
  'legendary-07': ({ d, G, playerID }) => {
    const playerLabel = d.getPlayerLabel(G, playerID);
    G.resources[playerID].time = (G.resources[playerID].time ?? 0) + 2;
    G.resources[playerID].reputation = (G.resources[playerID].reputation ?? 0) + 2;
    Object.keys(G.players).filter((pid) => pid !== playerID).forEach((pid) => {
      G.resources[pid].reputation = Math.max(0, (G.resources[pid].reputation ?? 0) - 1);
      d.clampNonNegativeResources(G.resources[pid]);
      d.syncPlayerState(G, pid);
    });
    d.clampNonNegativeResources(G.resources[playerID]);
    d.syncPlayerState(G, playerID);
    return d.legendaryTexts.churchLeadership(playerLabel);
  },
  'legendary-10': ({ d, G, ctx, playerID, targetPlayerID }) => {
    if (!targetPlayerID || !(targetPlayerID in G.players) || targetPlayerID === playerID) return d.INVALID_MOVE;
    const playerCount = Object.keys(G.players).length || Number(ctx.numPlayers ?? 0) || 2;
    const demoted = d.demoteByOneRankWithSeatCheck(G, targetPlayerID, playerCount);
    if (!demoted.ok) return d.INVALID_MOVE;
    return d.legendaryTexts.droidDemote(d.getPlayerLabel(G, targetPlayerID), d.rankNameById(demoted.fromRankId), d.rankNameById(demoted.toRankId));
  },
};

export const applyLegendaryAbility = (
  args: LegendaryAbilityArgs & { card: CardDefinition },
): string | 'INVALID_MOVE' => {
  const handler = legendaryAbilityRegistry[args.card.id];
  if (!handler) return '';
  return handler(args);
};
