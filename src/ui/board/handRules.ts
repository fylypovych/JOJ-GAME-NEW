import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from '../../game/types';
import { getBoardVvnzBlockedReason } from './rankHints';

export const isPlayAllowedForCard = (args: {
  card: CardDefinition;
  canPlayHandCard: boolean;
  resources: Record<ResourceKey, number>;
  G: JojGameState;
  playerID: string;
  sharedRanks: RankDefinition[];
  resourceLabels: Record<ResourceKey, string>;
  lang: 'uk' | 'en';
}) => {
  if (!args.canPlayHandCard) return false;
  if (args.card.category !== 'VVNZ') return true;
  return !getBoardVvnzBlockedReason({
    card: args.card,
    G: args.G,
    playerID: args.playerID,
    sharedRanks: args.sharedRanks,
    resources: args.resources,
    resourceLabels: args.resourceLabels,
    lang: args.lang,
  });
};
