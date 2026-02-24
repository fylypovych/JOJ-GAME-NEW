export const canPlayHandCardAtStage = (args: {
  isCurrentPlayer: boolean;
  stage?: string;
  extraHandPlayTokens?: number;
}): boolean => {
  const { isCurrentPlayer, stage, extraHandPlayTokens = 0 } = args;
  if (!isCurrentPlayer) return false;
  if (stage === 'play') return true;
  return stage === 'end' && extraHandPlayTokens > 0;
};

