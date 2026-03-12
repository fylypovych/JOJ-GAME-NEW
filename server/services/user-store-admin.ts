import type { Pool } from 'pg';
import type {
  AdminUserDetail,
  AdminUserSummary,
  UserAwardRecord,
  UserMatchHistoryItem,
  UserRecord,
  UserSessionRecord,
  UserStatsSummary,
} from './user-store-shared';

export const createUserAdminStore = (args: {
  pool: Pool;
  getUserWithStatusById: (userId: string) => Promise<(UserRecord & { status: 'active' | 'disabled' }) | null>;
  deleteAllSessionsForUser: (userId: string) => Promise<void>;
  listUserSessions: (userId: string) => Promise<UserSessionRecord[]>;
  listUserMatchLinks: (userId: string) => Promise<Array<{
    match_id: string;
    player_id: string;
    player_name: string | null;
    linked_at: string;
  }>>;
  getUserStatsSummary: (userId: string) => Promise<UserStatsSummary>;
  listUserMatchHistory: (userId: string, limit?: number) => Promise<UserMatchHistoryItem[]>;
  evaluateUserAwards: (userId: string, statsArg?: UserStatsSummary) => Promise<UserAwardRecord[]>;
  getPublicUserByUsername: (username: string) => Promise<Pick<UserRecord, 'username' | 'displayName' | 'avatarUrl' | 'bio' | 'createdAt' | 'showStatsPublic' | 'showRecentMatchesPublic'> | null>;
  normalizeUsername: (value: string) => string;
  normalizeEmail: (value: string) => string;
  usernameRe: RegExp;
}) => {
  const {
    pool,
    getUserWithStatusById,
    deleteAllSessionsForUser,
    listUserSessions,
    listUserMatchLinks,
    getUserStatsSummary,
    listUserMatchHistory,
    evaluateUserAwards,
    getPublicUserByUsername,
    normalizeUsername,
    normalizeEmail,
    usernameRe,
  } = args;

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

  const updateUserAdminProfile = async (input: {
    userId: string;
    username: string;
    email?: string | null;
    displayName: string;
    bio: string;
    avatarUrl?: string | null;
    preferredLang?: 'uk' | 'en';
  }) => {
    const normalizedUsername = normalizeUsername(input.username);
    const normalizedEmail = input.email?.trim() ? normalizeEmail(input.email) : null;
    if (!usernameRe.test(input.username.trim())) {
      throw new Error('Username must be 3-24 chars: letters, digits, "_" or "-".');
    }
    const duplicate = await pool.query<{ id: string }>(`
      SELECT id
      FROM app_users
      WHERE id <> $1
        AND (username = $2 OR ($3::text IS NOT NULL AND email = $3))
      LIMIT 1
    `, [input.userId, normalizedUsername, normalizedEmail]);
    if (duplicate.rowCount) {
      throw new Error('Username or email already exists.');
    }
    await pool.query(`
      UPDATE app_users
      SET username = $2,
          email = $3,
          updated_at = now()
      WHERE id = $1
    `, [input.userId, normalizedUsername, normalizedEmail]);
    await pool.query(`
      UPDATE user_profiles
      SET display_name = $2,
          bio = $3,
          avatar_url = $4,
          preferred_lang = $5,
          updated_at = now()
      WHERE user_id = $1
    `, [
      input.userId,
      input.displayName.trim() || input.username.trim(),
      input.bio.trim(),
      input.avatarUrl?.trim() || null,
      input.preferredLang === 'en' ? 'en' : 'uk',
    ]);
    return getUserWithStatusById(input.userId);
  };

  const getAdminUserDetail = async (userId: string): Promise<AdminUserDetail | null> => {
    const user = await getUserWithStatusById(userId);
    if (!user) return null;
    const [stats, sessions, linkedMatches, persistedMatches] = await Promise.all([
      getUserStatsSummary(userId),
      listUserSessions(userId),
      listUserMatchLinks(userId).then((rows) => rows.map((row) => ({
        matchId: row.match_id,
        playerId: row.player_id,
        playerName: row.player_name,
        linkedAt: row.linked_at,
      }))),
      listUserMatchHistory(userId, 50),
    ]);
    const awards = await evaluateUserAwards(userId, stats);
    return {
      user,
      stats,
      awards,
      sessions,
      linkedMatches,
      persistedMatches,
    };
  };

  const getPublicProfileByUsername = async (username: string) => {
    const user = await getPublicUserByUsername(username);
    if (!user) return null;
    const owner = await pool.query<{ id: string }>('SELECT id FROM app_users WHERE username = $1 LIMIT 1', [normalizeUsername(username)]);
    const userId = owner.rows[0]?.id;
    const stats = userId && user.showStatsPublic ? await getUserStatsSummary(userId) : null;
    const awards = userId && user.showStatsPublic ? (await evaluateUserAwards(userId, stats ?? undefined)).filter((award) => (award as { awarded?: boolean }).awarded) : [];
    const recentMatches = userId && user.showRecentMatchesPublic
      ? await listUserMatchHistory(userId, 10)
      : [];
    return { user, stats, awards, recentMatches };
  };

  return {
    listUsersAdmin,
    updateUserStatus,
    updateUserRole,
    updateUserAdminProfile,
    getAdminUserDetail,
    getPublicProfileByUsername,
  };
};
