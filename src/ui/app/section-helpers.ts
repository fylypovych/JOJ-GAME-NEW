import { rankLabel, text } from '../i18n';
import { formatModuleDisplayName } from '../moduleDisplay';
import type { Language } from '../i18n';
import type { BotDifficulty, GameMode } from '../../game/types';
import type { UserMatchHistoryItem } from './useUserAccount';

type T = ReturnType<typeof text>;

export const formatGameModeLabel = (t: T, gameMode: GameMode) => {
  if (gameMode === 'standard_plus') return t.gameModeStandardPlus;
  if (gameMode === 'simplified') return t.gameModeSimplified;
  return t.gameModeStandard;
};

export const formatBotDifficultyLabel = (
  t: T,
  difficulty: BotDifficulty | null,
) => {
  if (difficulty === 'easy') return t.botDifficultyEasy;
  if (difficulty === 'normal') return t.botDifficultyNormal;
  if (difficulty === 'hard') return t.botDifficultyHard;
  return '-';
};

export const estimateRoomDurationLabel = (
  t: T,
  players: number,
  gameMode: GameMode,
) => {
  if (gameMode === 'standard_plus' || players >= 5) return t.roomDurationLong;
  if (gameMode === 'simplified' || players <= 3) return t.roomDurationShort;
  return t.roomDurationMedium;
};

export const formatModuleName = (
  moduleId: string,
  moduleNameById: Map<string, string>,
) => {
  const known = moduleNameById.get(moduleId);
  if (known) return formatModuleDisplayName(known, moduleId);
  const normalized = moduleId.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return moduleId;
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

export const formatModuleList = (
  moduleIds: string[],
  moduleNameById: Map<string, string>,
) =>
  moduleIds.length
    ? moduleIds.map((id) => formatModuleName(id, moduleNameById)).join(', ')
    : '-';

export const formatMatchOutcomeLabel = (t: T, item: UserMatchHistoryItem) => {
  if (item.winnerPlayerId && item.winnerPlayerId === item.playerId) {
    return t.userMatchHistoryOutcomeWin;
  }
  if (item.endReason === 'stalled-no-cards') return t.userMatchHistoryOutcomeStalled;
  return t.userMatchHistoryOutcomeLoss;
};

export const localizeRankValue = (
  value: string | null | undefined,
  lang: Language,
) => {
  const safeValue = String(value ?? '').trim().toLowerCase();
  if (!safeValue) return '-';
  return rankLabel(safeValue.replace(/\s+/g, '_'), lang);
};

