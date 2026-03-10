import { findNextRank, getPromoteBlockedReason, getVvnzPlayBlockedReason, type ResourceLabels } from '../../game/actionValidation';
import { rankSeatLimitForRank } from '../../game/rankEngine';
import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from '../../game/types';

type Lang = 'uk' | 'en';

export const buildNextRankHint = (args: {
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>;
  playerID: string;
  sharedRanks: RankDefinition[];
  resources: Record<ResourceKey, number>;
  resourceLabels: ResourceLabels;
  promoteLabel: string;
  lang: Lang;
}): string | null => {
  const { G, playerID, sharedRanks, resourceLabels, promoteLabel, lang } = args;
  const nextRank = findNextRank(sharedRanks, G.ranks[playerID]);
  if (!nextRank) return null;
  const reason = getPromoteBlockedReason({ G, playerID, ranks: sharedRanks, resourceLabels, lang });
  if (!reason) {
    return lang === 'uk'
      ? `Можна підвищитися до «${nextRank.name}» (натисніть «${promoteLabel}»)`
      : `You can promote to "${nextRank.name}" (click "${promoteLabel}")`;
  }
  return reason;
};

export const getNextRankSeatMeta = (args: {
  G: Pick<JojGameState, 'players' | 'ranks'>;
  playerID: string;
  sharedRanks: RankDefinition[];
}) => {
  const { G, playerID, sharedRanks } = args;
  const nextRank = findNextRank(sharedRanks, G.ranks[playerID]);
  const playerCount = Object.keys(G.players ?? {}).length;
  const seatLimit = nextRank ? rankSeatLimitForRank(playerCount, nextRank.id, sharedRanks) : 0;
  const occupied = nextRank
    ? Object.entries(G.ranks ?? {}).filter(([pid, rid]) => pid !== playerID && rid === nextRank.id).length
    : 0;
  return { nextRank, seatLimit, occupied, seatBlocked: Boolean(nextRank) && occupied >= seatLimit };
};

export const getBoardVvnzBlockedReason = (args: {
  card: Pick<CardDefinition, 'category' | 'grantRank'>;
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources'>;
  playerID: string;
  sharedRanks: RankDefinition[];
  resources: Record<ResourceKey, number>;
  resourceLabels: ResourceLabels;
  lang: Lang;
}): string | null =>
  getVvnzPlayBlockedReason({
    card: args.card,
    G: args.G,
    playerID: args.playerID,
    ranks: args.sharedRanks,
    resourceLabels: args.resourceLabels,
    lang: args.lang,
  });

export const getBoardPromoteBlockedReason = (args: {
  G: Pick<JojGameState, 'players' | 'ranks' | 'resources' | 'promotedThisTurn'>;
  playerID: string;
  sharedRanks: RankDefinition[];
  resourceLabels: ResourceLabels;
  lang: Lang;
}): string | null =>
  getPromoteBlockedReason({
    G: args.G,
    playerID: args.playerID,
    ranks: args.sharedRanks,
    resourceLabels: args.resourceLabels,
    lang: args.lang,
  });
