import { randomBytes, scrypt as scryptBase, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';

const scrypt = promisify(scryptBase);

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

type PersistableMatchState = {
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

export type UserStore = ReturnType<typeof createUserStore>;

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const RANK_ORDER = [
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
const DEFAULT_AWARD_DEFINITIONS: Array<Omit<AwardDefinition, 'id' | 'createdAt' | 'updatedAt'>> = [
  { key: 'matches_finished_10', title: '10 матчів', description: 'Завершити 10 матчів.', category: 'general', metric: 'matches_finished', threshold: 10, badgeLabel: '10M', badgeVariant: 'bronze', iconPath: null, active: true, sortOrder: 10 },
  { key: 'matches_finished_50', title: '50 матчів', description: 'Завершити 50 матчів.', category: 'general', metric: 'matches_finished', threshold: 50, badgeLabel: '50M', badgeVariant: 'silver', iconPath: null, active: true, sortOrder: 20 },
  { key: 'wins_10', title: '10 перемог', description: 'Здобути 10 перемог.', category: 'general', metric: 'wins', threshold: 10, badgeLabel: '10W', badgeVariant: 'bronze', iconPath: null, active: true, sortOrder: 30 },
  { key: 'best_rank_captain', title: 'Капітан', description: 'Досягти звання капітана або вище.', category: 'ranks', metric: 'best_rank_order', threshold: 10, badgeLabel: 'CAP', badgeVariant: 'silver', iconPath: null, active: true, sortOrder: 40 },
  { key: 'resources_gained_100', title: 'Ресурсник', description: 'Накопичити 100 отриманих ресурсів.', category: 'resources', metric: 'resources_gained_total', threshold: 100, badgeLabel: '100R', badgeVariant: 'bronze', iconPath: null, active: true, sortOrder: 50 },
  { key: 'lyaps_10', title: 'Майстер ЛЯПів', description: 'Зіграти 10 ЛЯПів на інших гравців.', category: 'actions', metric: 'lyaps_played_on_others', threshold: 10, badgeLabel: 'LYAP', badgeVariant: 'special', iconPath: null, active: true, sortOrder: 60 },
];

const normalizeUsername = (value: string) => value.trim().toLowerCase();
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const getRankOrder = (rankId: string) => {
  const index = RANK_ORDER.indexOf(rankId as typeof RANK_ORDER[number]);
  return index >= 0 ? index + 1 : 0;
};
const normalizeAwardMetric = (value: unknown): AwardMetric => {
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
const normalizeAwardCategory = (value: unknown): AwardDefinition['category'] => {
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
const normalizeBadgeVariant = (value: unknown): AwardDefinition['badgeVariant'] => {
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

const constantTimeEquals = (left: string, right: string): boolean => {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

const publicUserColumns = `
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

export const createUserStore = (pool: Pool) => {
  const ensureSchema = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL UNIQUE,
        email text UNIQUE,
        role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'administrator')),
        password_hash text NOT NULL,
        password_salt text NOT NULL,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        display_name text NOT NULL,
        avatar_url text,
        bio text NOT NULL DEFAULT '',
        preferred_lang text NOT NULL DEFAULT 'uk' CHECK (preferred_lang IN ('uk', 'en')),
        profile_public boolean NOT NULL DEFAULT true,
        show_stats_public boolean NOT NULL DEFAULT true,
        show_recent_matches_public boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_public boolean NOT NULL DEFAULT true;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS show_stats_public boolean NOT NULL DEFAULT true;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS show_recent_matches_public boolean NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS user_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        source_ip text,
        user_agent text
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);
      CREATE TABLE IF NOT EXISTS user_password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        consumed_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS idx_user_password_reset_tokens_user_id ON user_password_reset_tokens (user_id);
      CREATE INDEX IF NOT EXISTS idx_user_password_reset_tokens_expires_at ON user_password_reset_tokens (expires_at);
      CREATE TABLE IF NOT EXISTS user_match_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        match_id text NOT NULL,
        player_id text NOT NULL,
        player_name text,
        linked_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, match_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_match_links_user_id ON user_match_links (user_id, linked_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_match_links_match_id ON user_match_links (match_id);
      CREATE TABLE IF NOT EXISTS persisted_match_results (
        match_id text PRIMARY KEY,
        winner_player_id text,
        end_reason text,
        turns_completed integer NOT NULL DEFAULT 0,
        persisted_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS persisted_match_participants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id text NOT NULL REFERENCES persisted_match_results(match_id) ON DELETE CASCADE,
        player_id text NOT NULL,
        player_name text,
        final_rank_id text NOT NULL,
        final_resources jsonb NOT NULL DEFAULT '{}'::jsonb,
        resources_gained_total integer NOT NULL DEFAULT 0,
        resources_lost_total integer NOT NULL DEFAULT 0,
        lyaps_played_on_others integer NOT NULL DEFAULT 0,
        scandals_played_on_others integer NOT NULL DEFAULT 0,
        turns_taken integer NOT NULL DEFAULT 0,
        UNIQUE (match_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS idx_persisted_match_participants_match_id ON persisted_match_participants (match_id);
      CREATE TABLE IF NOT EXISTS award_definitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        award_key text NOT NULL UNIQUE,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'ranks', 'resources', 'actions')),
        metric text NOT NULL,
        threshold numeric NOT NULL DEFAULT 1,
        badge_label text NOT NULL DEFAULT '',
        badge_variant text NOT NULL DEFAULT 'bronze' CHECK (badge_variant IN ('bronze', 'silver', 'gold', 'special')),
        icon_path text,
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS user_awards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        award_id uuid NOT NULL REFERENCES award_definitions(id) ON DELETE CASCADE,
        awarded_at timestamptz NOT NULL DEFAULT now(),
        progress_value numeric NOT NULL DEFAULT 0,
        UNIQUE (user_id, award_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_awards_user_id ON user_awards (user_id, awarded_at DESC);
    `);
    await pool.query(`
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
      UPDATE app_users
      SET role = 'user'
      WHERE role IS NULL OR role NOT IN ('user', 'administrator')
    `);
    const seeded = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM award_definitions');
    if (Number(seeded.rows[0]?.count ?? 0) === 0) {
      for (const def of DEFAULT_AWARD_DEFINITIONS) {
        await pool.query(`
          INSERT INTO award_definitions (
            award_key, title, description, category, metric, threshold, badge_label, badge_variant, icon_path, active, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [
          def.key,
          def.title,
          def.description,
          def.category,
          def.metric,
          def.threshold,
          def.badgeLabel,
          def.badgeVariant,
          def.iconPath,
          def.active,
          def.sortOrder,
        ]);
      }
    }
  };

  const hashPassword = async (password: string) => {
    const salt = randomBytes(16).toString('hex');
    const derived = await scrypt(password, salt, 64) as Buffer;
    return { salt, hash: derived.toString('hex') };
  };

  const verifyPassword = async (password: string, salt: string, hash: string) => {
    const derived = await scrypt(password, salt, 64) as Buffer;
    return constantTimeEquals(derived.toString('hex'), hash);
  };

  const getUserById = async (userId: string): Promise<UserRecord | null> => {
    const result = await pool.query<UserRecord>(`
      SELECT ${publicUserColumns}
      FROM app_users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `, [userId]);
    return result.rows[0] ?? null;
  };

  const getUserWithStatusById = async (userId: string): Promise<(UserRecord & { status: 'active' | 'disabled' }) | null> => {
    const result = await pool.query<UserRecord & { status: 'active' | 'disabled' }>(`
      SELECT ${publicUserColumns}, u.status
      FROM app_users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `, [userId]);
    return result.rows[0] ?? null;
  };

  const findUserForLogin = async (login: string) => {
    const normalizedLogin = login.includes('@') ? normalizeEmail(login) : normalizeUsername(login);
    const result = await pool.query<{
      id: string;
      username: string;
      email: string | null;
      password_hash: string;
      password_salt: string;
      status: string;
    }>(`
      SELECT id, username, email, password_hash, password_salt, status
      FROM app_users
      WHERE username = $1 OR email = $1
      LIMIT 1
    `, [normalizedLogin]);
    return result.rows[0] ?? null;
  };

  const createUser = async (args: {
    username: string;
    email?: string;
    password: string;
    displayName?: string;
    preferredLang?: 'uk' | 'en';
    role?: 'user' | 'administrator';
  }): Promise<UserRecord> => {
    const username = normalizeUsername(args.username);
    const email = args.email?.trim() ? normalizeEmail(args.email) : null;
    const displayName = args.displayName?.trim() || args.username.trim();
    const preferredLang = args.preferredLang === 'en' ? 'en' : 'uk';
    const role = args.role === 'administrator' ? 'administrator' : 'user';
    if (!USERNAME_RE.test(args.username.trim())) {
      throw new Error('Username must be 3-24 chars: letters, digits, "_" or "-".');
    }
    if (args.password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    const existing = await pool.query(
      'SELECT 1 FROM app_users WHERE username = $1 OR ($2::text IS NOT NULL AND email = $2) LIMIT 1',
      [username, email],
    );
    if (existing.rowCount) {
      throw new Error('Username or email already exists.');
    }
    const { salt, hash } = await hashPassword(args.password);
    const created = await pool.query<{ id: string }>(`
      INSERT INTO app_users (username, email, role, password_hash, password_salt)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [username, email, role, hash, salt]);
    const userId = created.rows[0]?.id;
    await pool.query(`
      INSERT INTO user_profiles (user_id, display_name, preferred_lang)
      VALUES ($1, $2, $3)
    `, [userId, displayName, preferredLang]);
    const user = await getUserById(userId);
    if (!user) throw new Error('Failed to create user.');
    return user;
  };

  const ensureDefaultAdministrator = async () => {
    const existing = await pool.query<{ id: string }>(`
      SELECT id
      FROM app_users
      WHERE username = 'admin'
      LIMIT 1
    `);
    if (existing.rowCount) {
      await pool.query(`
        UPDATE app_users
        SET role = 'administrator',
            status = 'active',
            updated_at = now()
        WHERE username = 'admin'
      `);
      const user = await pool.query<{ id: string }>(`SELECT id FROM app_users WHERE username = 'admin' LIMIT 1`);
      return getUserById(user.rows[0]?.id ?? '');
    }

    const { salt, hash } = await hashPassword('admin');
    const created = await pool.query<{ id: string }>(`
      INSERT INTO app_users (username, email, role, password_hash, password_salt, status)
      VALUES ('admin', NULL, 'administrator', $1, $2, 'active')
      RETURNING id
    `, [hash, salt]);
    const userId = created.rows[0]?.id;
    await pool.query(`
      INSERT INTO user_profiles (user_id, display_name, preferred_lang)
      VALUES ($1, 'Administrator', 'uk')
      ON CONFLICT (user_id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          preferred_lang = EXCLUDED.preferred_lang,
          updated_at = now()
    `, [userId]);
    return getUserById(userId);
  };

  const createSession = async (args: {
    userId: string;
    sourceIp?: string;
    userAgent?: string;
  }) => {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await pool.query(`
      INSERT INTO user_sessions (user_id, token_hash, expires_at, source_ip, user_agent)
      VALUES ($1, $2, $3, $4, $5)
    `, [args.userId, tokenHash, expiresAt, args.sourceIp ?? null, args.userAgent ?? null]);
    await pool.query('UPDATE app_users SET last_login_at = now(), updated_at = now() WHERE id = $1', [args.userId]);
    return { token, expiresAt };
  };

  const getUserBySessionToken = async (token: string): Promise<UserRecord | null> => {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = await pool.query<{ user_id: string }>(`
      SELECT user_id
      FROM user_sessions
      WHERE token_hash = $1 AND expires_at > now()
      LIMIT 1
    `, [tokenHash]);
    const userId = session.rows[0]?.user_id;
    if (!userId) return null;
    await pool.query('UPDATE user_sessions SET last_seen_at = now() WHERE token_hash = $1', [tokenHash]);
    return getUserById(userId);
  };

  const deleteSession = async (token: string) => {
    if (!token) return;
    await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
  };

  const deleteAllSessionsForUser = async (userId: string) => {
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  };

  const deleteExpiredSessions = async () => {
    await pool.query('DELETE FROM user_sessions WHERE expires_at <= now()');
    await pool.query('DELETE FROM user_password_reset_tokens WHERE consumed_at IS NOT NULL OR expires_at <= now()');
  };

  const authenticateUser = async (login: string, password: string): Promise<UserRecord | null> => {
    const user = await findUserForLogin(login);
    if (!user || user.status !== 'active') return null;
    const ok = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!ok) return null;
    return getUserById(user.id);
  };

  const updateProfile = async (args: {
    userId: string;
    displayName: string;
    email?: string | null;
    bio: string;
    avatarUrl?: string | null;
    preferredLang?: 'uk' | 'en';
    profilePublic?: boolean;
    showStatsPublic?: boolean;
    showRecentMatchesPublic?: boolean;
  }): Promise<UserRecord | null> => {
    const normalizedEmail = args.email?.trim() ? normalizeEmail(args.email) : null;
    const duplicate = await pool.query<{ id: string }>(`
      SELECT id
      FROM app_users
      WHERE email = $2 AND id <> $1
      LIMIT 1
    `, [args.userId, normalizedEmail]);
    if (duplicate.rowCount) {
      throw new Error('Email already exists.');
    }
    await pool.query(`
      UPDATE app_users
      SET email = $2,
          updated_at = now()
      WHERE id = $1
    `, [args.userId, normalizedEmail]);
    await pool.query(`
      UPDATE user_profiles
      SET display_name = $2,
        bio = $3,
        avatar_url = $4,
          preferred_lang = $5,
          profile_public = $6,
          show_stats_public = $7,
          show_recent_matches_public = $8,
          updated_at = now()
      WHERE user_id = $1
    `, [
      args.userId,
      args.displayName.trim(),
      args.bio.trim(),
      args.avatarUrl?.trim() || null,
      args.preferredLang === 'en' ? 'en' : 'uk',
      args.profilePublic !== false,
      args.showStatsPublic !== false,
      args.showRecentMatchesPublic === true,
    ]);
    return getUserById(args.userId);
  };

  const changePassword = async (args: {
    userId: string;
    currentPassword: string;
    nextPassword: string;
  }) => {
    if (args.nextPassword.length < 8) {
      throw new Error('New password must be at least 8 characters.');
    }
    const result = await pool.query<{
      password_hash: string;
      password_salt: string;
    }>('SELECT password_hash, password_salt FROM app_users WHERE id = $1 LIMIT 1', [args.userId]);
    const row = result.rows[0];
    if (!row) throw new Error('User not found.');
    const ok = await verifyPassword(args.currentPassword, row.password_salt, row.password_hash);
    if (!ok) throw new Error('Current password is invalid.');
    const { salt, hash } = await hashPassword(args.nextPassword);
    await pool.query(`
      UPDATE app_users
      SET password_hash = $2,
          password_salt = $3,
          updated_at = now()
      WHERE id = $1
    `, [args.userId, hash, salt]);
  };

  const getPublicUserByUsername = async (username: string) => {
    const result = await pool.query<Pick<UserRecord, 'username' | 'displayName' | 'avatarUrl' | 'bio' | 'createdAt' | 'showStatsPublic' | 'showRecentMatchesPublic'>>(`
      SELECT
        u.username,
        COALESCE(p.display_name, u.username) AS "displayName",
        p.avatar_url AS "avatarUrl",
        COALESCE(p.bio, '') AS bio,
        u.created_at AS "createdAt",
        COALESCE(p.show_stats_public, true) AS "showStatsPublic",
        COALESCE(p.show_recent_matches_public, false) AS "showRecentMatchesPublic"
      FROM app_users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.username = $1 AND u.status = 'active' AND COALESCE(p.profile_public, true) = true
      LIMIT 1
    `, [normalizeUsername(username)]);
    return result.rows[0] ?? null;
  };

  const createPasswordResetToken = async (login: string) => {
    const user = await findUserForLogin(login);
    if (!user || user.status !== 'active') return null;
    await pool.query('DELETE FROM user_password_reset_tokens WHERE user_id = $1 OR consumed_at IS NOT NULL OR expires_at <= now()', [user.id]);
    const token = randomBytes(24).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    await pool.query(`
      INSERT INTO user_password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `, [user.id, tokenHash, expiresAt]);
    return { token, expiresAt, userId: user.id };
  };

  const resetPasswordWithToken = async (args: {
    token: string;
    nextPassword: string;
  }) => {
    if (args.nextPassword.length < 8) {
      throw new Error('New password must be at least 8 characters.');
    }
    const tokenHash = hashToken(args.token);
    const result = await pool.query<{ id: string; user_id: string }>(`
      SELECT id, user_id
      FROM user_password_reset_tokens
      WHERE token_hash = $1
        AND consumed_at IS NULL
        AND expires_at > now()
      LIMIT 1
    `, [tokenHash]);
    const row = result.rows[0];
    if (!row) throw new Error('Reset token is invalid or expired.');
    const { salt, hash } = await hashPassword(args.nextPassword);
    await pool.query('BEGIN');
    try {
      await pool.query(`
        UPDATE app_users
        SET password_hash = $2,
            password_salt = $3,
            updated_at = now()
        WHERE id = $1
      `, [row.user_id, hash, salt]);
      await pool.query(`
        UPDATE user_password_reset_tokens
        SET consumed_at = now()
        WHERE id = $1
      `, [row.id]);
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [row.user_id]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    return getUserById(row.user_id);
  };

  const linkUserToMatch = async (args: {
    userId: string;
    matchId: string;
    playerId: string;
    playerName?: string;
  }) => {
    await pool.query(`
      INSERT INTO user_match_links (user_id, match_id, player_id, player_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, match_id, player_id)
      DO UPDATE SET player_name = EXCLUDED.player_name
    `, [args.userId, args.matchId, args.playerId, args.playerName?.trim() || null]);
  };

  const listUserMatchLinks = async (userId: string) => {
    const result = await pool.query<{
      match_id: string;
      player_id: string;
      player_name: string | null;
      linked_at: string;
    }>(`
      SELECT match_id, player_id, player_name, linked_at
      FROM user_match_links
      WHERE user_id = $1
      ORDER BY linked_at DESC
      LIMIT 100
    `, [userId]);
    return result.rows;
  };

  const listUserSessions = async (userId: string): Promise<UserSessionRecord[]> => {
    const result = await pool.query<UserSessionRecord>(`
      SELECT
        id,
        created_at AS "createdAt",
        last_seen_at AS "lastSeenAt",
        expires_at AS "expiresAt",
        source_ip AS "sourceIp",
        user_agent AS "userAgent"
      FROM user_sessions
      WHERE user_id = $1
      ORDER BY last_seen_at DESC
    `, [userId]);
    return result.rows;
  };

  const deleteSessionByIdForUser = async (userId: string, sessionId: string) => {
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1 AND id = $2', [userId, sessionId]);
  };

  const deleteSessionById = async (sessionId: string) => {
    await pool.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
  };

  const persistMatchResultIfFinished = async (matchId: string, state: PersistableMatchState | null | undefined) => {
    if (!matchId || !state?.ctx?.gameover) return false;
    const already = await pool.query('SELECT 1 FROM persisted_match_results WHERE match_id = $1 LIMIT 1', [matchId]);
    if (already.rowCount) return true;
    const gameover = state.ctx.gameover;
    const turnsCompleted = Number(state.G?.gameStats?.turnsCompleted ?? 0);
    await pool.query(`
      INSERT INTO persisted_match_results (match_id, winner_player_id, end_reason, turns_completed)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (match_id) DO NOTHING
    `, [matchId, gameover.winner ? String(gameover.winner) : null, gameover.endReason ? String(gameover.endReason) : null, turnsCompleted]);

    const ranks = state.G?.ranks ?? {};
    const resources = state.G?.resources ?? {};
    const playerNames = state.G?.playerNames ?? {};
    const playerStats = state.G?.playerGameStats ?? {};
    for (const playerId of Object.keys(ranks)) {
      const stats = playerStats[playerId] ?? {};
      await pool.query(`
        INSERT INTO persisted_match_participants (
          match_id,
          player_id,
          player_name,
          final_rank_id,
          final_resources,
          resources_gained_total,
          resources_lost_total,
          lyaps_played_on_others,
          scandals_played_on_others,
          turns_taken
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
        ON CONFLICT (match_id, player_id) DO UPDATE SET
          player_name = EXCLUDED.player_name,
          final_rank_id = EXCLUDED.final_rank_id,
          final_resources = EXCLUDED.final_resources,
          resources_gained_total = EXCLUDED.resources_gained_total,
          resources_lost_total = EXCLUDED.resources_lost_total,
          lyaps_played_on_others = EXCLUDED.lyaps_played_on_others,
          scandals_played_on_others = EXCLUDED.scandals_played_on_others,
          turns_taken = EXCLUDED.turns_taken
      `, [
        matchId,
        playerId,
        playerNames[playerId] ?? null,
        ranks[playerId] ?? 'recruit',
        JSON.stringify(resources[playerId] ?? {}),
        Number(stats.resourcesGainedTotal ?? 0),
        Number(stats.resourcesLostTotal ?? 0),
        Number(stats.lyapsPlayedOnOthers ?? 0),
        Number(stats.scandalsPlayedOnOthers ?? 0),
        Number(stats.turnsTaken ?? 0),
      ]);
    }
    return true;
  };

  const getUserStatsSummary = async (userId: string): Promise<UserStatsSummary> => {
    const links = await listUserMatchLinks(userId);
    if (!links.length) return {
      matchesLinked: 0,
      matchesFinished: 0,
      wins: 0,
      winRatePct: 0,
      avgTurns: 0,
      bestRankId: 'recruit',
      bestRankName: 'recruit',
      resourcesGainedTotal: 0,
      resourcesLostTotal: 0,
      lyapsPlayedOnOthers: 0,
      scandalsPlayedOnOthers: 0,
      lastMatchAt: null,
    };
    const result = await pool.query<{
      matches_linked: string;
      matches_finished: string;
      wins: string;
      avg_turns: string | null;
      resources_gained_total: string | null;
      resources_lost_total: string | null;
      lyaps_played_on_others: string | null;
      scandals_played_on_others: string | null;
      last_match_at: string | Date | null;
    }>(`
      SELECT
        COUNT(*)::text AS matches_linked,
        COUNT(r.match_id)::text AS matches_finished,
        COALESCE(SUM(CASE WHEN r.winner_player_id = l.player_id THEN 1 ELSE 0 END), 0)::text AS wins,
        ROUND(AVG(r.turns_completed)::numeric, 2)::text AS avg_turns,
        COALESCE(SUM(p.resources_gained_total), 0)::text AS resources_gained_total,
        COALESCE(SUM(p.resources_lost_total), 0)::text AS resources_lost_total,
        COALESCE(SUM(p.lyaps_played_on_others), 0)::text AS lyaps_played_on_others,
        COALESCE(SUM(p.scandals_played_on_others), 0)::text AS scandals_played_on_others,
        MAX(l.linked_at) AS last_match_at
      FROM user_match_links l
      LEFT JOIN persisted_match_results r ON r.match_id = l.match_id
      LEFT JOIN persisted_match_participants p ON p.match_id = l.match_id AND p.player_id = l.player_id
      WHERE l.user_id = $1
    `, [userId]);
    const bestRank = await pool.query<{ final_rank_id: string }>(`
      SELECT p.final_rank_id
      FROM user_match_links l
      JOIN persisted_match_participants p ON p.match_id = l.match_id AND p.player_id = l.player_id
      WHERE l.user_id = $1
      ORDER BY CASE p.final_rank_id
        WHEN 'recruit' THEN 1
        WHEN 'soldier' THEN 2
        WHEN 'junior_sergeant' THEN 3
        WHEN 'sergeant' THEN 4
        WHEN 'senior_sergeant' THEN 5
        WHEN 'ensign' THEN 6
        WHEN 'junior_lieutenant' THEN 7
        WHEN 'lieutenant' THEN 8
        WHEN 'senior_lieutenant' THEN 9
        WHEN 'captain' THEN 10
        WHEN 'major' THEN 11
        WHEN 'lieutenant_colonel' THEN 12
        WHEN 'colonel' THEN 13
        WHEN 'general' THEN 14
        ELSE 0
      END DESC
      LIMIT 1
    `, [userId]);
    const row = result.rows[0];
    const matchesLinked = Number(row?.matches_linked ?? 0);
    const matchesFinished = Number(row?.matches_finished ?? 0);
    const wins = Number(row?.wins ?? 0);
    const bestRankId = bestRank.rows[0]?.final_rank_id ?? 'recruit';
    return {
      matchesLinked,
      matchesFinished,
      wins,
      winRatePct: matchesFinished > 0 ? Number(((wins / matchesFinished) * 100).toFixed(2)) : 0,
      avgTurns: Number(row?.avg_turns ?? 0),
      bestRankId,
      bestRankName: bestRankId.replace(/_/g, ' '),
      resourcesGainedTotal: Number(row?.resources_gained_total ?? 0),
      resourcesLostTotal: Number(row?.resources_lost_total ?? 0),
      lyapsPlayedOnOthers: Number(row?.lyaps_played_on_others ?? 0),
      scandalsPlayedOnOthers: Number(row?.scandals_played_on_others ?? 0),
      lastMatchAt: row?.last_match_at instanceof Date ? row.last_match_at.toISOString() : row?.last_match_at ?? null,
    };
  };

  const listAwardDefinitions = async (): Promise<AwardDefinition[]> => {
    const result = await pool.query<{
      id: string;
      key: string;
      title: string;
      description: string;
      category: AwardDefinition['category'];
      metric: AwardMetric;
      threshold: string | number;
      badgeLabel: string;
      badgeVariant: AwardDefinition['badgeVariant'];
      iconPath: string | null;
      active: boolean;
      sortOrder: number;
      createdAt: string;
      updatedAt: string;
    }>(`
      SELECT
        id,
        award_key AS key,
        title,
        description,
        category,
        metric,
        threshold::text AS threshold,
        badge_label AS "badgeLabel",
        badge_variant AS "badgeVariant",
        icon_path AS "iconPath",
        active,
        sort_order AS "sortOrder",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM award_definitions
      ORDER BY sort_order ASC, title ASC
    `);
    return result.rows.map((row) => ({
      ...row,
      threshold: Number(row.threshold),
    }));
  };

  const evaluateUserAwards = async (userId: string, statsArg?: UserStatsSummary): Promise<UserAwardRecord[]> => {
    const [definitions, stats] = await Promise.all([
      listAwardDefinitions(),
      statsArg ? Promise.resolve(statsArg) : getUserStatsSummary(userId),
    ]);
    const metricValue = (metric: AwardMetric): number => {
      switch (metric) {
        case 'matches_linked': return stats.matchesLinked;
        case 'matches_finished': return stats.matchesFinished;
        case 'wins': return stats.wins;
        case 'win_rate_pct': return stats.winRatePct;
        case 'avg_turns': return stats.avgTurns;
        case 'best_rank_order': return getRankOrder(stats.bestRankId);
        case 'resources_gained_total': return stats.resourcesGainedTotal;
        case 'resources_lost_total': return stats.resourcesLostTotal;
        case 'lyaps_played_on_others': return stats.lyapsPlayedOnOthers;
        case 'scandals_played_on_others': return stats.scandalsPlayedOnOthers;
      }
    };
    const activeDefinitions = definitions.filter((definition) => definition.active);
    for (const definition of activeDefinitions) {
      const progressValue = metricValue(definition.metric);
      if (progressValue >= definition.threshold) {
        await pool.query(`
          INSERT INTO user_awards (user_id, award_id, progress_value)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, award_id)
          DO UPDATE SET progress_value = GREATEST(user_awards.progress_value, EXCLUDED.progress_value)
        `, [userId, definition.id, progressValue]);
      }
    }
    const granted = await pool.query<{ award_id: string; awarded_at: string; progress_value: number }>(`
      SELECT award_id, awarded_at, progress_value
      FROM user_awards
      WHERE user_id = $1
    `, [userId]);
    const grantedById = new Map(granted.rows.map((row) => [row.award_id, row]));
    return definitions.map((definition) => {
      const progressValue = metricValue(definition.metric);
      const grantedRow = grantedById.get(definition.id);
      return {
        awardId: definition.id,
        key: definition.key,
        title: definition.title,
        description: definition.description,
        category: definition.category,
        metric: definition.metric,
        threshold: definition.threshold,
        badgeLabel: definition.badgeLabel,
        badgeVariant: definition.badgeVariant,
        iconPath: definition.iconPath,
        progressValue,
        awarded: Boolean(grantedRow),
        awardedAt: grantedRow?.awarded_at ?? null,
      };
    });
  };

  const saveAwardDefinition = async (args: {
    id?: string;
    key: string;
    title: string;
    description: string;
    category?: AwardDefinition['category'];
    metric?: AwardMetric;
    threshold: number;
    badgeLabel: string;
    badgeVariant?: AwardDefinition['badgeVariant'];
    iconPath?: string | null;
    active?: boolean;
    sortOrder?: number;
  }) => {
    const key = String(args.key ?? '').trim().toLowerCase();
    const title = String(args.title ?? '').trim();
    if (!key || !title) throw new Error('Award key and title are required.');
    if (!Number.isFinite(args.threshold) || Number(args.threshold) <= 0) throw new Error('Award threshold must be positive.');
    const metric = normalizeAwardMetric(args.metric);
    const category = normalizeAwardCategory(args.category);
    const badgeVariant = normalizeBadgeVariant(args.badgeVariant);
    const threshold = Number(args.threshold);
    const sortOrder = Number.isFinite(args.sortOrder) ? Number(args.sortOrder) : 0;
    if (args.id) {
      await pool.query(`
        UPDATE award_definitions
        SET award_key = $2,
            title = $3,
            description = $4,
            category = $5,
            metric = $6,
            threshold = $7,
            badge_label = $8,
            badge_variant = $9,
            icon_path = $10,
            active = $11,
            sort_order = $12,
            updated_at = now()
        WHERE id = $1
      `, [
        args.id,
        key,
        title,
        String(args.description ?? '').trim(),
        category,
        metric,
        threshold,
        String(args.badgeLabel ?? '').trim() || title,
        badgeVariant,
        args.iconPath?.trim() || null,
        args.active !== false,
        sortOrder,
      ]);
    } else {
      await pool.query(`
        INSERT INTO award_definitions (
          award_key, title, description, category, metric, threshold, badge_label, badge_variant, icon_path, active, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [
        key,
        title,
        String(args.description ?? '').trim(),
        category,
        metric,
        threshold,
        String(args.badgeLabel ?? '').trim() || title,
        badgeVariant,
        args.iconPath?.trim() || null,
        args.active !== false,
        sortOrder,
      ]);
    }
    return listAwardDefinitions();
  };

  const deleteAwardDefinition = async (awardId: string) => {
    await pool.query('DELETE FROM award_definitions WHERE id = $1', [awardId]);
    return listAwardDefinitions();
  };

  const listPendingPersistMatchIds = async () => {
    const result = await pool.query<{ match_id: string }>(`
      SELECT DISTINCT l.match_id
      FROM user_match_links l
      LEFT JOIN persisted_match_results r ON r.match_id = l.match_id
      WHERE r.match_id IS NULL
      ORDER BY l.match_id ASC
      LIMIT 200
    `);
    return result.rows.map((row) => row.match_id);
  };

  const listUsersAdmin = async (search = '', limit = 50): Promise<AdminUserSummary[]> => {
    const normalizedSearch = search.trim().toLowerCase();
    const result = await pool.query<AdminUserSummary>(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.role,
        COALESCE(p.display_name, u.username) AS "displayName",
        u.status,
        u.created_at AS "createdAt",
        u.last_login_at AS "lastLoginAt",
        COUNT(DISTINCT l.match_id)::int AS "linkedMatches",
        COUNT(DISTINCT r.match_id)::int AS "finishedMatches"
      FROM app_users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN user_match_links l ON l.user_id = u.id
      LEFT JOIN persisted_match_results r ON r.match_id = l.match_id
      WHERE (
        $1 = ''
        OR u.username ILIKE '%' || $1 || '%'
        OR COALESCE(p.display_name, '') ILIKE '%' || $1 || '%'
        OR COALESCE(u.email, '') ILIKE '%' || $1 || '%'
      )
      GROUP BY u.id, u.username, u.email, u.role, p.display_name, u.status, u.created_at, u.last_login_at
      ORDER BY u.created_at DESC
      LIMIT $2
    `, [normalizedSearch, Math.max(1, Math.min(limit, 200))]);
    return result.rows;
  };

  const updateUserStatus = async (userId: string, status: 'active' | 'disabled') => {
    await pool.query(`
      UPDATE app_users
      SET status = $2,
          updated_at = now()
      WHERE id = $1
    `, [userId, status]);
    if (status === 'disabled') {
      await deleteAllSessionsForUser(userId);
    }
    return getUserWithStatusById(userId);
  };

  const updateUserRole = async (userId: string, role: 'user' | 'administrator') => {
    const nextRole = role === 'administrator' ? 'administrator' : 'user';
    await pool.query(`
      UPDATE app_users
      SET role = $2,
          updated_at = now()
      WHERE id = $1
    `, [userId, nextRole]);
    return getUserWithStatusById(userId);
  };

  const updateUserAdminProfile = async (args: {
    userId: string;
    username: string;
    email?: string | null;
    displayName: string;
    bio: string;
    avatarUrl?: string | null;
    preferredLang?: 'uk' | 'en';
  }) => {
    const normalizedUsername = normalizeUsername(args.username);
    const normalizedEmail = args.email?.trim() ? normalizeEmail(args.email) : null;
    if (!USERNAME_RE.test(args.username.trim())) {
      throw new Error('Username must be 3-24 chars: letters, digits, "_" or "-".');
    }
    const duplicate = await pool.query<{ id: string }>(`
      SELECT id
      FROM app_users
      WHERE id <> $1
        AND (username = $2 OR ($3::text IS NOT NULL AND email = $3))
      LIMIT 1
    `, [args.userId, normalizedUsername, normalizedEmail]);
    if (duplicate.rowCount) {
      throw new Error('Username or email already exists.');
    }
    await pool.query(`
      UPDATE app_users
      SET username = $2,
          email = $3,
          updated_at = now()
      WHERE id = $1
    `, [args.userId, normalizedUsername, normalizedEmail]);
    await pool.query(`
      UPDATE user_profiles
      SET display_name = $2,
          bio = $3,
          avatar_url = $4,
          preferred_lang = $5,
          updated_at = now()
      WHERE user_id = $1
    `, [
      args.userId,
      args.displayName.trim() || args.username.trim(),
      args.bio.trim(),
      args.avatarUrl?.trim() || null,
      args.preferredLang === 'en' ? 'en' : 'uk',
    ]);
    return getUserWithStatusById(args.userId);
  };

  const getAdminUserDetail = async (userId: string): Promise<AdminUserDetail | null> => {
    const user = await getUserWithStatusById(userId);
    if (!user) return null;
    const [stats, sessions, linkedMatches, persistedMatchesResult] = await Promise.all([
      getUserStatsSummary(userId),
      listUserSessions(userId),
      listUserMatchLinks(userId).then((rows) => rows.map((row) => ({
        matchId: row.match_id,
        playerId: row.player_id,
        playerName: row.player_name,
        linkedAt: row.linked_at,
      }))),
      pool.query<{
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
      }>(`
        SELECT
          l.match_id AS "matchId",
          l.player_id AS "playerId",
          l.player_name AS "playerName",
          r.winner_player_id AS "winnerPlayerId",
          r.end_reason AS "endReason",
          r.turns_completed AS "turnsCompleted",
          p.final_rank_id AS "finalRankId",
          p.resources_gained_total AS "resourcesGainedTotal",
          p.resources_lost_total AS "resourcesLostTotal",
          l.linked_at AS "linkedAt"
        FROM user_match_links l
        JOIN persisted_match_results r ON r.match_id = l.match_id
        JOIN persisted_match_participants p ON p.match_id = l.match_id AND p.player_id = l.player_id
        WHERE l.user_id = $1
        ORDER BY l.linked_at DESC
        LIMIT 50
      `, [userId]),
    ]);
    const awards = await evaluateUserAwards(userId, stats);
    return {
      user,
      stats,
      awards,
      sessions,
      linkedMatches,
      persistedMatches: persistedMatchesResult.rows,
    };
  };

  const getPublicProfileByUsername = async (username: string) => {
    const user = await getPublicUserByUsername(username);
    if (!user) return null;
    const owner = await pool.query<{ id: string }>('SELECT id FROM app_users WHERE username = $1 LIMIT 1', [normalizeUsername(username)]);
    const userId = owner.rows[0]?.id;
    const stats = userId && user.showStatsPublic ? await getUserStatsSummary(userId) : null;
    const awards = userId && user.showStatsPublic ? (await evaluateUserAwards(userId, stats ?? undefined)).filter((award) => award.awarded) : [];
    const recentMatches = userId && user.showRecentMatchesPublic
      ? (await listUserMatchLinks(userId)).slice(0, 10).map((row) => ({
        matchId: row.match_id,
        playerId: row.player_id,
        playerName: row.player_name,
        linkedAt: row.linked_at,
      }))
      : [];
    return { user, stats, awards, recentMatches };
  };

  return {
    ensureSchema,
    ensureDefaultAdministrator,
    createUser,
    authenticateUser,
    createSession,
    getUserById,
    getUserBySessionToken,
    deleteSession,
    deleteAllSessionsForUser,
    deleteExpiredSessions,
    deleteSessionByIdForUser,
    deleteSessionById,
    updateProfile,
    changePassword,
    createPasswordResetToken,
    resetPasswordWithToken,
    getPublicUserByUsername,
    getPublicProfileByUsername,
    linkUserToMatch,
    listUserMatchLinks,
    listUserSessions,
    persistMatchResultIfFinished,
    getUserStatsSummary,
    listAwardDefinitions,
    evaluateUserAwards,
    saveAwardDefinition,
    deleteAwardDefinition,
    listPendingPersistMatchIds,
    listUsersAdmin,
    updateUserStatus,
    updateUserRole,
    updateUserAdminProfile,
    getAdminUserDetail,
  };
};
