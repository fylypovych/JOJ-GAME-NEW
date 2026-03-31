import { getPromoteActionState } from '../../game/actionValidation';
import type { JojGameState, RankDefinition, ResourceKey } from '../../game/types';
import type { Language } from '../i18n';
import { rankLabel, text } from '../i18n';
import { buildNextRankHint } from './rankHints';
import { BOARD_RESOURCE_ORDER } from './resourceConstants';

export const getBoardPromoteReason = (args: {
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>;
  playerID: string;
  sharedRanks: RankDefinition[];
  resourceLabels: Record<ResourceKey, string>;
  lang: Language;
}) =>
  getPromoteActionState({
    G: args.G,
    playerID: args.playerID,
    ranks: args.sharedRanks,
    resourceLabels: args.resourceLabels,
    lang: args.lang,
  }).reason;

export const buildGameoverPlayerSummaries = (args: {
  G: JojGameState;
  winnerPlayerID: string;
  playerLabelById: (id: string | null | undefined) => string;
  resourceLabels: Record<ResourceKey, string>;
  sharedRanks: RankDefinition[];
  lang: Language;
}) => {
  const { G, winnerPlayerID, playerLabelById, resourceLabels, sharedRanks, lang } = args;
  return Object.keys(G.players ?? {})
    .map((pid) => {
      const playerResources = G.resources?.[pid] ?? {};
      const statRow = G.playerGameStats?.[pid];
      const resourcesText = BOARD_RESOURCE_ORDER.map((key) => `${resourceLabels[key]} ${playerResources[key] ?? 0}`).join(', ');
      const rankId = G.ranks?.[pid] ?? '';
      return {
        playerID: pid,
        name: playerLabelById(pid),
        rankName: sharedRanks.find((row) => row.id === rankId)?.name ?? rankLabel(rankId, lang),
        resourcesText,
        turnsTaken: statRow?.turnsTaken ?? 0,
        resourcesGainedTotal: statRow?.resourcesGainedTotal ?? 0,
        resourcesLostTotal: statRow?.resourcesLostTotal ?? 0,
        lyapsPlayedOnOthers: statRow?.lyapsPlayedOnOthers ?? 0,
        scandalsPlayedOnOthers: statRow?.scandalsPlayedOnOthers ?? 0,
        winner: pid === winnerPlayerID,
        rankId,
        reputation: playerResources.reputation ?? 0,
      };
    })
    .sort((a, b) =>
      Number(b.winner) - Number(a.winner)
      || sharedRanks.findIndex((rank) => rank.id === b.rankId) - sharedRanks.findIndex((rank) => rank.id === a.rankId)
      || b.reputation - a.reputation,
    );
};

export const buildResourceHighlightMeta = (args: {
  resources: Record<ResourceKey, number>;
  selectedResource: ResourceKey | null;
}) => {
  const highlightedResources = new Set<ResourceKey>();
  const deficitByResource: Partial<Record<ResourceKey, number>> = {};
  for (const key of BOARD_RESOURCE_ORDER) {
    if (args.selectedResource === key) highlightedResources.add(key);
    if ((deficitByResource[key] ?? 0) > 0) highlightedResources.add(key);
  }
  return { highlightedResources, deficitByResource };
};

export const buildTurnHelpItems = (args: {
  stage: string | undefined;
  stageLabel: string;
  canDraw: boolean;
  canPlay: boolean;
  canEndTurn: boolean;
  passButtonLabel: string;
  promoteReason: string | null;
  pendingSelectionLabel: string;
  mustDiscardOverflow: boolean;
  handOverflow: number;
  handCount: number;
  v2: ReturnType<typeof text>['v2'];
  t: ReturnType<typeof text>;
  promoteLabel: string;
  lang: Language;
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>;
  playerID: string;
  sharedRanks: RankDefinition[];
  resourceLabels: Record<ResourceKey, string>;
}) => [
  {
    label: args.v2.helpCurrentStage,
    value: args.stageLabel,
    tone: 'neutral' as const,
  },
  {
    label: args.t.draw,
    value: args.canDraw ? args.v2.helpActionReady : args.v2.confirmDrawFirst,
    tone: args.canDraw ? 'good' as const : 'neutral' as const,
  },
  {
    label: args.promoteLabel,
    value: !args.canPlay
      ? args.v2.actionUnavailable
      : (args.promoteReason ?? buildNextRankHint({
        G: args.G,
        playerID: args.playerID,
        sharedRanks: args.sharedRanks,
        resources: args.G.resources[args.playerID],
        resourceLabels: args.resourceLabels,
        promoteLabel: args.promoteLabel,
        lang: args.lang,
      }) ?? args.v2.helpActionReady),
    tone: !args.canPlay || args.promoteReason ? 'warn' as const : 'good' as const,
  },
  {
    label: args.passButtonLabel,
    value: args.canEndTurn ? args.v2.helpActionReady : args.v2.actionUnavailable,
    tone: args.canEndTurn ? 'good' as const : 'neutral' as const,
  },
  {
    label: args.v2.helpPendingSelection,
    value: args.pendingSelectionLabel,
    tone: args.pendingSelectionLabel === args.v2.waitingAction ? 'neutral' as const : 'warn' as const,
  },
  {
    label: args.v2.helpHandStatus,
    value: args.mustDiscardOverflow
      ? args.v2.handOverflowWarning.replace('{count}', String(args.handOverflow))
      : `${args.v2.handCardsLabel}: ${args.handCount}/8`,
    tone: args.mustDiscardOverflow ? 'warn' as const : 'neutral' as const,
  },
];
