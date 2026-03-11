import type { BotDifficulty } from '../types';
import type { BotSetup } from './types';

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard'] as const;

export const normalizeBotDifficulty = (value: unknown): BotDifficulty => {
  if (value === 'hard' || value === 'normal') return value;
  return 'easy';
};

export const normalizeBotSetup = (value: unknown, totalPlayers: number): BotSetup | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { count?: unknown; difficulty?: unknown; enabled?: unknown };
  if (raw.enabled === false) return null;
  const maxBotCount = Math.max(0, totalPlayers - 1);
  const requestedCount = Math.max(0, Math.min(maxBotCount, Math.floor(Number(raw.count ?? 0) || 0)));
  if (requestedCount <= 0) return null;
  return {
    count: requestedCount,
    difficulty: normalizeBotDifficulty(raw.difficulty),
  };
};

export const getBotSeatIds = (totalPlayers: number, botCount: number): string[] => {
  const clampedTotalPlayers = Math.max(2, Math.floor(totalPlayers || 2));
  const clampedBotCount = Math.max(0, Math.min(clampedTotalPlayers - 1, Math.floor(botCount || 0)));
  return Array.from({ length: clampedBotCount }, (_, index) => String(index + 1));
};

export const createBotPlayerName = (args: {
  difficulty: BotDifficulty;
  seatIndex: number;
}) => {
  const labelByDifficulty: Record<BotDifficulty, string> = {
    easy: 'Bot Easy',
    normal: 'Bot Normal',
    hard: 'Bot Hard',
  };
  return `${labelByDifficulty[args.difficulty]} ${args.seatIndex}`;
};
