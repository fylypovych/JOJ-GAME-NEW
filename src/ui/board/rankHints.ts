import {
  findNextRank,
  getPromoteActionState,
  type ResourceLabels,
} from '../../game/actionValidation';
import { rankSeatLimitForRank } from '../../game/rankEngine';
import type { JojGameState, RankDefinition, ResourceKey } from '../../game/types';

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
  const promoteState = getPromoteActionState({ G, playerID, ranks: sharedRanks, resourceLabels });
  const nextRank = promoteState.nextRank ?? findNextRank(sharedRanks, G.ranks[playerID]);
  if (!nextRank) return null;
  if (promoteState.allowed) {
    return lang === 'uk'
      ? `Можна підвищитися до «${nextRank.name}» (натисніть «${promoteLabel}»)`
      : `You can promote to "${nextRank.name}" (click "${promoteLabel}")`;
  }
  return promoteState.reason;
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
