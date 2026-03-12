import type { CardDefinition, JojGameState, RankDefinition, ResourceKey } from '../../game/types';
import { getBoardHandCardActionState } from './rankHints';

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
  return getBoardHandCardActionState({
    card: args.card,
    G: args.G,
    playerID: args.playerID,
    sharedRanks: args.sharedRanks,
    resourceLabels: args.resourceLabels,
    canPlayHandCard: args.canPlayHandCard,
    lang: args.lang,
  }).allowed;
};
