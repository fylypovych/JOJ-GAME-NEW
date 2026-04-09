import { randomBytes, scrypt as scryptBase, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import {
  type UserRecord,
  constantTimeEquals,
  normalizeEmail,
  normalizeUsername,
  userColumns,
  RESET_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  USERNAME_RE,
} from './user-store-shared';

const scrypt = promisify(scryptBase);
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const createUserAuthStore = (args: {
  pool: Pool;
  withTransaction: <T>(run: (client: Pool) => Promise<T>) => Promise<T>;
}) => {
  const { pool, withTransaction } = args;

  const hashPassword = async (password: string) => {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return { salt, hash: derived.toString('hex') };
  };

  const verifyPassword = async (password: string, salt: string, hash: string) => {
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return constantTimeEquals(derived.toString('hex'), hash);
  };

  const getUserById = async (userId: string): Promise<UserRecord | null> => {
    const result = await pool.query<UserRecord>(
      `
      SELECT ${userColumns}
      FROM app_users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
      [userId],
    );
    return result.rows[0] ?? null;
  };

  const getUserWithStatusById = async (
    userId: string,
  ): Promise<(UserRecord & { status: 'active' | 'disabled' }) | null> => {
    const result = await pool.query<UserRecord & { status: 'active' | 'disabled' }>(
      `
      SELECT ${userColumns}, u.status
      FROM app_users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
      [userId],
    );
    return result.rows[0] ?? null;
  };

  const findUserForLogin = async (login: string) => {
    const normalizedLogin = login.includes('@')
      ? normalizeEmail(login)
      : normalizeUsername(login);
    const result = await pool.query<{
      id: string;
      username: string;
      email: string | null;
      password_hash: string;
      password_salt: string;
      status: string;
    }>(
      `
      SELECT id, username, email, password_hash, password_salt, status
      FROM app_users
      WHERE username = $1 OR email = $1
      LIMIT 1
    `,
      [normalizedLogin],
    );
    return result.rows[0] ?? null;
  };

  const createUser = async (input: {
    username: string;
    email?: string;
    password: string;
    displayName?: string;
    preferredLang?: 'uk' | 'en';
    role?: 'user' | 'administrator';
  }): Promise<UserRecord> => {
    const username = normalizeUsername(input.username);
    const email = input.email?.trim() ? normalizeEmail(input.email) : null;
    const displayName = input.displayName?.trim() || input.username.trim();
    const preferredLang = input.preferredLang === 'en' ? 'en' : 'uk';
    const role = input.role === 'administrator' ? 'administrator' : 'user';
    if (!USERNAME_RE.test(input.username.trim())) {
      throw new Error('Username must be 3-24 chars: letters, digits, "_" or "-".');
    }
    if (input.password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    const existing = await pool.query(
      'SELECT 1 FROM app_users WHERE username = $1 OR ($2::text IS NOT NULL AND email = $2) LIMIT 1',
      [username, email],
    );
    if (existing.rowCount) {
      throw new Error('Username or email already exists.');
    }
    const { salt, hash } = await hashPassword(input.password);
    const userId = await withTransaction(async (client) => {
      const created = await client.query<{ id: string }>(
        `
        INSERT INTO app_users (username, email, role, password_hash, password_salt)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
        [username, email, role, hash, salt],
      );
      const createdUserId = created.rows[0]?.id;
      await client.query(
        `
        INSERT INTO user_profiles (user_id, display_name, preferred_lang)
        VALUES ($1, $2, $3)
      `,
        [createdUserId, displayName, preferredLang],
      );
      return createdUserId;
    });
    const user = await getUserById(userId);
    if (!user) throw new Error('Failed to create user.');
    return user;
  };

  const createSession = async (input: {
    userId: string;
    sourceIp?: string;
    userAgent?: string;
  }) => {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await pool.query(
      `
      INSERT INTO user_sessions (user_id, token_hash, expires_at, source_ip, user_agent)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [input.userId, tokenHash, expiresAt, input.sourceIp ?? null, input.userAgent ?? null],
    );
    await pool.query(
      'UPDATE app_users SET last_login_at = now(), updated_at = now() WHERE id = $1',
      [input.userId],
    );
    return { token, expiresAt };
  };

  const getUserBySessionToken = async (token: string): Promise<UserRecord | null> => {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = await pool.query<{ user_id: string }>(
      `
      SELECT user_id
      FROM user_sessions
      WHERE token_hash = $1 AND expires_at > now()
      LIMIT 1
    `,
      [tokenHash],
    );
    const userId = session.rows[0]?.user_id;
    if (!userId) return null;
    await pool.query('UPDATE user_sessions SET last_seen_at = now() WHERE token_hash = $1', [
      tokenHash,
    ]);
    return getUserById(userId);
  };

  const verifyAdminAccessToken = async (
    userId: string,
    token: string,
  ): Promise<boolean> => {
    const trimmed = token.trim();
    if (!userId || !trimmed) return false;
    const result = await pool.query<{
      admin_access_token_hash: string | null;
      role: 'user' | 'administrator';
      status: 'active' | 'disabled';
    }>(
      `
      SELECT admin_access_token_hash, role, status
      FROM app_users
      WHERE id = $1
      LIMIT 1
    `,
      [userId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.role !== 'administrator' ||
      row.status !== 'active' ||
      !row.admin_access_token_hash
    ) {
      return false;
    }
    return constantTimeEquals(hashToken(trimmed), row.admin_access_token_hash);
  };

  const rotateAdminAccessToken = async (
    userId: string,
  ): Promise<{ token: string; rotatedAt: string } | null> => {
    const user = await getUserWithStatusById(userId);
    if (!user || user.role !== 'administrator') return null;
    const token = randomBytes(24).toString('hex');
    const rotatedAt = new Date().toISOString();
    await pool.query(
      `
      UPDATE app_users
      SET admin_access_token_hash = $2,
          admin_access_token_rotated_at = $3,
          updated_at = now()
      WHERE id = $1
    `,
      [userId, hashToken(token), rotatedAt],
    );
    return { token, rotatedAt };
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
    await pool.query(
      'DELETE FROM user_password_reset_tokens WHERE consumed_at IS NOT NULL OR expires_at <= now()',
    );
  };

  const authenticateUser = async (
    login: string,
    password: string,
  ): Promise<UserRecord | null> => {
    const user = await findUserForLogin(login);
    if (!user || user.status !== 'active') return null;
    const ok = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!ok) return null;
    return getUserById(user.id);
  };

  const updateProfile = async (input: {
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
    const normalizedEmail = input.email?.trim() ? normalizeEmail(input.email) : null;
    const duplicate = await pool.query<{ id: string }>(
      `
      SELECT id
      FROM app_users
      WHERE email = $2 AND id <> $1
      LIMIT 1
    `,
      [input.userId, normalizedEmail],
    );
    if (duplicate.rowCount) {
      throw new Error('Email already exists.');
    }
    await withTransaction(async (client) => {
      await client.query(
        `
        UPDATE app_users
        SET email = $2,
            updated_at = now()
        WHERE id = $1
      `,
        [input.userId, normalizedEmail],
      );
      await client.query(
        `
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
      `,
        [
          input.userId,
          input.displayName.trim(),
          input.bio.trim(),
          input.avatarUrl?.trim() || null,
          input.preferredLang === 'en' ? 'en' : 'uk',
          input.profilePublic !== false,
          input.showStatsPublic !== false,
          input.showRecentMatchesPublic === true,
        ],
      );
    });
    return getUserById(input.userId);
  };

  const changePassword = async (input: {
    userId: string;
    currentPassword: string;
    nextPassword: string;
  }) => {
    if (input.nextPassword.length < 8) {
      throw new Error('New password must be at least 8 characters.');
    }
    const result = await pool.query<{
      password_hash: string;
      password_salt: string;
    }>('SELECT password_hash, password_salt FROM app_users WHERE id = $1 LIMIT 1', [
      input.userId,
    ]);
    const row = result.rows[0];
    if (!row) throw new Error('User not found.');
    const ok = await verifyPassword(input.currentPassword, row.password_salt, row.password_hash);
    if (!ok) throw new Error('Current password is invalid.');
    const { salt, hash } = await hashPassword(input.nextPassword);
    await pool.query(
      `
      UPDATE app_users
      SET password_hash = $2,
          password_salt = $3,
          updated_at = now()
      WHERE id = $1
    `,
      [input.userId, hash, salt],
    );
  };

  const getPublicUserByUsername = async (username: string) => {
    const result = await pool.query<
      Pick<
        UserRecord,
        | 'username'
        | 'displayName'
        | 'avatarUrl'
        | 'bio'
        | 'createdAt'
        | 'showStatsPublic'
        | 'showRecentMatchesPublic'
      >
    >(
      `
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
    `,
      [normalizeUsername(username)],
    );
    return result.rows[0] ?? null;
  };

  const createPasswordResetToken = async (login: string) => {
    const user = await findUserForLogin(login);
    if (!user || user.status !== 'active') return null;
    await pool.query(
      'DELETE FROM user_password_reset_tokens WHERE user_id = $1 OR consumed_at IS NOT NULL OR expires_at <= now()',
      [user.id],
    );
    const token = randomBytes(24).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    await pool.query(
      `
      INSERT INTO user_password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
      [user.id, tokenHash, expiresAt],
    );
    return { token, expiresAt, userId: user.id };
  };

  const resetPasswordWithToken = async (input: {
    token: string;
    nextPassword: string;
  }) => {
    if (input.nextPassword.length < 8) {
      throw new Error('New password must be at least 8 characters.');
    }
    const tokenHash = hashToken(input.token);
    const result = await pool.query<{ id: string; user_id: string }>(
      `
      SELECT id, user_id
      FROM user_password_reset_tokens
      WHERE token_hash = $1
        AND consumed_at IS NULL
        AND expires_at > now()
      LIMIT 1
    `,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Reset token is invalid or expired.');
    const { salt, hash } = await hashPassword(input.nextPassword);
    await withTransaction(async (client) => {
      await client.query(
        `
        UPDATE app_users
        SET password_hash = $2,
            password_salt = $3,
            updated_at = now()
        WHERE id = $1
      `,
        [row.user_id, hash, salt],
      );
      await client.query(
        `
        UPDATE user_password_reset_tokens
        SET consumed_at = now()
        WHERE id = $1
      `,
        [row.id],
      );
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [row.user_id]);
    });
    return getUserById(row.user_id);
  };

  return {
    getUserById,
    getUserWithStatusById,
    createUser,
    authenticateUser,
    createSession,
    getUserBySessionToken,
    verifyAdminAccessToken,
    rotateAdminAccessToken,
    deleteSession,
    deleteAllSessionsForUser,
    deleteExpiredSessions,
    updateProfile,
    changePassword,
    createPasswordResetToken,
    resetPasswordWithToken,
    getPublicUserByUsername,
  };
};

