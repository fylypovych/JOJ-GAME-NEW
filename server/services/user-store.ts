import { randomBytes, scrypt as scryptBase, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import {
  type UserRecord,
  constantTimeEquals,
  DEFAULT_AWARD_DEFINITIONS,
  normalizeEmail,
  normalizeUsername,
  userColumns,
  RESET_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  USERNAME_RE,
} from './user-store-shared';
import { createUserAwardsStore } from './user-store-awards';
import { createUserMatchStore } from './user-store-match';
import { createUserAdminStore } from './user-store-admin';
export type {
  AdminUserDetail,
  AdminUserSummary,
  AwardDefinition,
  AwardMetric,
  PersistableMatchState,
  UserAwardRecord,
  UserRecord,
  UserSessionRecord,
  UserStatsSummary,
} from './user-store-shared';

const scrypt = promisify(scryptBase);

export type UserStore = ReturnType<typeof createUserStore>;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

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
      SELECT ${userColumns}
      FROM app_users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `, [userId]);
    return result.rows[0] ?? null;
  };

  const getUserWithStatusById = async (userId: string): Promise<(UserRecord & { status: 'active' | 'disabled' }) | null> => {
    const result = await pool.query<UserRecord & { status: 'active' | 'disabled' }>(`
      SELECT ${userColumns}, u.status
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

  const matchStore = createUserMatchStore({ pool });
  const {
    linkUserToMatch,
    listUserMatchLinks,
    listUserSessions,
    deleteSessionByIdForUser,
    deleteSessionById,
    persistMatchResultIfFinished,
    getUserStatsSummary,
    listPendingPersistMatchIds,
  } = matchStore;

  const awardsStore = createUserAwardsStore({
    pool,
    getUserStatsSummary,
  });
  const {
    listAwardDefinitions,
    evaluateUserAwards,
    saveAwardDefinition,
    deleteAwardDefinition,
  } = awardsStore;

  const adminStore = createUserAdminStore({
    pool,
    getUserWithStatusById,
    deleteAllSessionsForUser,
    listUserSessions,
    listUserMatchLinks,
    getUserStatsSummary,
    evaluateUserAwards,
    getPublicUserByUsername,
    normalizeUsername,
    normalizeEmail,
    usernameRe: USERNAME_RE,
  });
  const {
    listUsersAdmin,
    updateUserStatus,
    updateUserRole,
    updateUserAdminProfile,
    getAdminUserDetail,
    getPublicProfileByUsername,
  } = adminStore;

  return {
    ensureSchema,
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
