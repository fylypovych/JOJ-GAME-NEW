import type { Pool } from 'pg';
import {
  DEFAULT_AWARD_DEFINITIONS,
  normalizeEmail,
  normalizeUsername,
  USERNAME_RE,
} from './user-store-shared';
import { createUserAuthStore } from './user-store-auth';
import { createUserAwardsStore } from './user-store-awards';
import { createUserMatchStore } from './user-store-match';
import { createUserAdminStore } from './user-store-admin';
export type {
  AdminUserDetail,
  AdminUserSummary,
  AwardDefinition,
  AwardMetric,
  PersistableMatchState,
  PublicUser,
  UserAwardRecord,
  UserRecord,
  UserSessionRecord,
  UserStatsSummary,
} from './user-store-shared';

export type UserStore = ReturnType<typeof createUserStore>;

export const createUserStore = (pool: Pool) => {
  const withTransaction = async <T>(run: (client: Pool) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client as unknown as Pool);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  const ensureSchema = async () => {
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

  const getRuntimeDatabaseInfo = async () => {
    const result = await pool.query<{
      database: string;
      user: string;
      serverAddr: string | null;
      serverPort: number | null;
    }>(`
      SELECT
        current_database() AS database,
        current_user AS "user",
        inet_server_addr()::text AS "serverAddr",
        inet_server_port() AS "serverPort"
    `);
    return result.rows[0] ?? { database: '', user: '', serverAddr: null, serverPort: null };
  };

  const authStore = createUserAuthStore({ pool, withTransaction });
  const {
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
  } = authStore;

  const matchStore = createUserMatchStore({ pool, withTransaction });
  const {
    linkUserToMatch,
    listUserMatchLinks,
    listUserSessions,
    deleteSessionByIdForUser,
    deleteSessionById,
    persistMatchResultIfFinished,
    getUserStatsSummary,
    listUserMatchHistory,
    listPendingPersistMatchIds,
    getAdminAnalytics,
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
    withTransaction,
    getUserWithStatusById,
    listUserSessions,
    listUserMatchLinks,
    getUserStatsSummary,
    listUserMatchHistory,
    evaluateUserAwards,
    getPublicUserByUsername,
    normalizeUsername,
    normalizeEmail,
    usernameRe: USERNAME_RE,
  });
  const {
    listUsersAdmin,
    listPublicUsers,
    updateUserStatus,
    updateUserRole,
    updateUserAdminProfile,
    getAdminUserDetail,
    getPublicProfileByUsername,
  } = adminStore;

  return {
    ensureSchema,
    getRuntimeDatabaseInfo,
    withTransaction,
    createUser,
    authenticateUser,
    createSession,
    getUserById,
    getUserBySessionToken,
    verifyAdminAccessToken,
    rotateAdminAccessToken,
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
    listUserMatchHistory,
    listAwardDefinitions,
    evaluateUserAwards,
    saveAwardDefinition,
    deleteAwardDefinition,
    listPendingPersistMatchIds,
    getAdminAnalytics,
    listUsersAdmin,
    listPublicUsers,
    updateUserStatus,
    updateUserRole,
    updateUserAdminProfile,
    getAdminUserDetail,
  };
};
