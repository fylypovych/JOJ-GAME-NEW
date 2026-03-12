import type { BotDifficulty, BotProfile } from '../types';
import type { BotSetup } from './types';

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard'] as const;
export const BOT_PROFILES: readonly BotProfile[] = ['balanced', 'aggressive', 'control'] as const;

export const normalizeBotDifficulty = (value: unknown): BotDifficulty => {
  if (value === 'hard' || value === 'normal') return value;
  return 'easy';
};

export const normalizeBotProfile = (value: unknown): BotProfile => {
  if (value === 'aggressive' || value === 'control') return value;
  return 'balanced';
};

export const normalizeBotSetup = (value: unknown, totalPlayers: number): BotSetup | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { count?: unknown; difficulty?: unknown; profile?: unknown; enabled?: unknown };
  if (raw.enabled === false) return null;
  const maxBotCount = Math.max(0, totalPlayers - 1);
  const requestedCount = Math.max(0, Math.min(maxBotCount, Math.floor(Number(raw.count ?? 0) || 0)));
  if (requestedCount <= 0) return null;
  return {
    count: requestedCount,
    difficulty: normalizeBotDifficulty(raw.difficulty),
    profile: normalizeBotProfile(raw.profile),
  };
};

export const getBotSeatIds = (totalPlayers: number, botCount: number): string[] => {
  const clampedTotalPlayers = Math.max(2, Math.floor(totalPlayers || 2));
  const clampedBotCount = Math.max(0, Math.min(clampedTotalPlayers - 1, Math.floor(botCount || 0)));
  return Array.from({ length: clampedBotCount }, (_, index) => String(index + 1));
};

export const createBotPlayerName = (args: {
  difficulty: BotDifficulty;
  profile?: BotProfile;
  seatIndex: number;
}) => {
  const labelByDifficulty: Record<BotDifficulty, string> = {
    easy: 'Bot Easy',
    normal: 'Bot Normal',
    hard: 'Bot Hard',
  };
  const profileSuffix =
    args.profile === 'aggressive' ? ' Aggro'
      : args.profile === 'control' ? ' Control'
        : '';
  return `${labelByDifficulty[args.difficulty]}${profileSuffix} ${args.seatIndex}`;
};
