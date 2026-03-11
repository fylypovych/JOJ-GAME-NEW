import { timingSafeEqual } from 'node:crypto';

export type UserRecord = {
  id: string;
  username: string;
  email: string | null;
  role: 'user' | 'administrator';
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  preferredLang: 'uk' | 'en';
  profilePublic: boolean;
  showStatsPublic: boolean;
  showRecentMatchesPublic: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type UserStatsSummary = {
  matchesLinked: number;
  matchesFinished: number;
  wins: number;
  winRatePct: number;
  avgTurns: number;
  bestRankId: string;
  bestRankName: string;
  resourcesGainedTotal: number;
  resourcesLostTotal: number;
  lyapsPlayedOnOthers: number;
  scandalsPlayedOnOthers: number;
  lastMatchAt: string | null;
};

export type AwardMetric =
  | 'matches_linked'
  | 'matches_finished'
  | 'wins'
  | 'win_rate_pct'
  | 'avg_turns'
  | 'best_rank_order'
  | 'resources_gained_total'
  | 'resources_lost_total'
  | 'lyaps_played_on_others'
  | 'scandals_played_on_others';

export type AwardDefinition = {
  id: string;
  key: string;
  title: string;
  description: string;
  category: 'general' | 'ranks' | 'resources' | 'actions';
  metric: AwardMetric;
  threshold: number;
  badgeLabel: string;
  badgeVariant: 'bronze' | 'silver' | 'gold' | 'special';
  iconPath: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type UserAwardRecord = {
  awardId: string;
  key: string;
  title: string;
  description: string;
  category: AwardDefinition['category'];
  metric: AwardMetric;
  threshold: number;
  badgeLabel: string;
  badgeVariant: AwardDefinition['badgeVariant'];
  iconPath: string | null;
  progressValue: number;
  awarded: boolean;
  awardedAt: string | null;
};

export type UserSessionRecord = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  sourceIp: string | null;
  userAgent: string | null;
};

export type AdminUserSummary = {
  id: string;
  username: string;
  email: string | null;
  role: 'user' | 'administrator';
  displayName: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string | null;
  linkedMatches: number;
  finishedMatches: number;
};

export type AdminUserDetail = {
  user: UserRecord & { status: 'active' | 'disabled' };
  stats: UserStatsSummary;
  awards: UserAwardRecord[];
  sessions: UserSessionRecord[];
  linkedMatches: Array<{
    matchId: string;
    playerId: string;
    playerName: string | null;
    linkedAt: string;
  }>;
  persistedMatches: Array<{
    matchId: string;
    playerId: string;
    playerName: string | null;
    winnerPlayerId: string | null;
    endReason: string | null;
    turnsCompleted: number;
    finalRankId: string;
    resourcesGainedTotal: number;
    resourcesLostTotal: number;
    linkedAt: string;
  }>;
};

export type PersistableMatchState = {
  G?: {
    ranks?: Record<string, string>;
    resources?: Record<string, Record<string, number>>;
    playerNames?: Record<string, string>;
    playerGameStats?: Record<string, {
      resourcesGainedTotal?: number;
      resourcesLostTotal?: number;
      lyapsPlayedOnOthers?: number;
      scandalsPlayedOnOthers?: number;
      turnsTaken?: number;
    }>;
    gameStats?: { turnsCompleted?: number };
  };
  ctx?: { gameover?: { winner?: string; endReason?: string } | null } | null;
};

export const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
export const RANK_ORDER = [
  'recruit',
  'soldier',
  'senior_soldier',
  'junior_sergeant',
  'sergeant',
  'senior_sergeant',
  'ensign',
  'junior_lieutenant',
  'lieutenant',
  'senior_lieutenant',
  'captain',
  'major',
  'lieutenant_colonel',
  'colonel',
  'brigadier_general',
  'general',
] as const;

export const DEFAULT_AWARD_DEFINITIONS: Array<Omit<AwardDefinition, 'id' | 'createdAt' | 'updatedAt'>> = [
  { key: 'matches_finished_10', title: '10 матчів', description: 'Завершити 10 матчів.', category: 'general', metric: 'matches_finished', threshold: 10, badgeLabel: '10M', badgeVariant: 'bronze', iconPath: null, active: true, sortOrder: 10 },
  { key: 'matches_finished_50', title: '50 матчів', description: 'Завершити 50 матчів.', category: 'general', metric: 'matches_finished', threshold: 50, badgeLabel: '50M', badgeVariant: 'silver', iconPath: null, active: true, sortOrder: 20 },
  { key: 'wins_10', title: '10 перемог', description: 'Здобути 10 перемог.', category: 'general', metric: 'wins', threshold: 10, badgeLabel: '10W', badgeVariant: 'bronze', iconPath: null, active: true, sortOrder: 30 },
  { key: 'best_rank_captain', title: 'Капітан', description: 'Досягти звання капітана або вище.', category: 'ranks', metric: 'best_rank_order', threshold: 10, badgeLabel: 'CAP', badgeVariant: 'silver', iconPath: null, active: true, sortOrder: 40 },
  { key: 'resources_gained_100', title: 'Ресурсник', description: 'Накопичити 100 отриманих ресурсів.', category: 'resources', metric: 'resources_gained_total', threshold: 100, badgeLabel: '100R', badgeVariant: 'bronze', iconPath: null, active: true, sortOrder: 50 },
  { key: 'lyaps_10', title: 'Майстер ЛЯПів', description: 'Зіграти 10 ЛЯПів на інших гравців.', category: 'actions', metric: 'lyaps_played_on_others', threshold: 10, badgeLabel: 'LYAP', badgeVariant: 'special', iconPath: null, active: true, sortOrder: 60 },
];

export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const getRankOrder = (rankId: string) => {
  const index = RANK_ORDER.indexOf(rankId as typeof RANK_ORDER[number]);
  return index >= 0 ? index + 1 : 0;
};

export const normalizeAwardMetric = (value: unknown): AwardMetric => {
  switch (String(value ?? '').trim()) {
    case 'matches_linked':
    case 'matches_finished':
    case 'wins':
    case 'win_rate_pct':
    case 'avg_turns':
    case 'best_rank_order':
    case 'resources_gained_total':
    case 'resources_lost_total':
    case 'lyaps_played_on_others':
    case 'scandals_played_on_others':
      return value as AwardMetric;
    default:
      return 'matches_finished';
  }
};

export const normalizeAwardCategory = (value: unknown): AwardDefinition['category'] => {
  switch (String(value ?? '').trim()) {
    case 'ranks':
    case 'resources':
    case 'actions':
    case 'general':
      return value as AwardDefinition['category'];
    default:
      return 'general';
  }
};

export const normalizeBadgeVariant = (value: unknown): AwardDefinition['badgeVariant'] => {
  switch (String(value ?? '').trim()) {
    case 'silver':
    case 'gold':
    case 'special':
    case 'bronze':
      return value as AwardDefinition['badgeVariant'];
    default:
      return 'bronze';
  }
};

export const constantTimeEquals = (left: string, right: string): boolean => {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

export const userColumns = `
  u.id,
  u.username,
  u.email,
  u.role,
  COALESCE(p.display_name, u.username) AS "displayName",
  p.avatar_url AS "avatarUrl",
  COALESCE(p.bio, '') AS bio,
  COALESCE(p.preferred_lang, 'uk') AS "preferredLang",
  COALESCE(p.profile_public, true) AS "profilePublic",
  COALESCE(p.show_stats_public, true) AS "showStatsPublic",
  COALESCE(p.show_recent_matches_public, false) AS "showRecentMatchesPublic",
  u.created_at AS "createdAt",
  u.last_login_at AS "lastLoginAt"
`;

export const publicUserColumns = `
  u.id,
  u.username,
  COALESCE(p.display_name, u.username) AS "displayName",
  p.avatar_url AS "avatarUrl",
  COALESCE(p.bio, '') AS bio,
  COALESCE(p.preferred_lang, 'uk') AS "preferredLang",
  COALESCE(p.profile_public, true) AS "profilePublic",
  COALESCE(p.show_stats_public, true) AS "showStatsPublic",
  COALESCE(p.show_recent_matches_public, false) AS "showRecentMatchesPublic",
  u.created_at AS "createdAt",
  u.last_login_at AS "lastLoginAt"
`;
