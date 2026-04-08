/**
 * User Repository Interface - defines the contract for user data access
 * Following the Repository Pattern for better testability and decoupling
 */
import type {
  AdminUserDetail,
  AdminUserSummary,
  UserRecord,
  UserSessionRecord,
  UserStatsSummary,
} from '../services/user-store-shared';

export interface UserRepository {
  // User CRUD operations
  findById(id: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByUsernameOrEmail(usernameOrEmail: string): Promise<UserRecord | null>;
  createUser(user: Omit<UserRecord, 'id' | 'createdAt'> & { password: string }): Promise<UserRecord>;
  updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null>;
  deleteUser(id: string): Promise<boolean>;

  // Profile operations
  getProfile(userId: string): Promise<{
    displayName: string;
    email?: string;
    avatarUrl?: string;
    bio: string;
    preferredLang: 'uk' | 'en';
    profilePublic: boolean;
    showStatsPublic: boolean;
    showRecentMatchesPublic: boolean;
  } | null>;
  updateProfile(userId: string, profile: {
    displayName?: string;
    email?: string;
    avatarUrl?: string;
    bio?: string;
    profilePublic?: boolean;
    showStatsPublic?: boolean;
    showRecentMatchesPublic?: boolean;
  }): Promise<boolean>;

  // Authentication operations
  validateCredentials(usernameOrEmail: string, password: string): Promise<UserRecord | null>;
  changePassword(userId: string, newPassword: string): Promise<boolean>;
  createPasswordResetToken(userId: string): Promise<string | null>;
  consumePasswordResetToken(token: string): Promise<string | null>; // returns userId

  // Session operations
  createSession(userId: string, options?: { ip?: string; userAgent?: string }): Promise<{ token: string; expiresAt: Date }>;
  validateSession(token: string): Promise<UserSessionRecord | null>;
  revokeSession(token: string): Promise<boolean>;
  revokeAllUserSessions(userId: string): Promise<boolean>;
  getUserSessions(userId: string): Promise<UserSessionRecord[]>;

  // Admin operations
  listAllUsers(options?: { limit?: number; offset?: number }): Promise<AdminUserSummary[]>;
  getUserDetails(userId: string): Promise<AdminUserDetail | null>;
  setUserRole(userId: string, role: 'user' | 'administrator'): Promise<boolean>;
  setUserStatus(userId: string, status: 'active' | 'disabled'): Promise<boolean>;
  rotateAdminToken(userId: string): Promise<string | null>;
  validateAdminToken(token: string): Promise<string | null>; // returns userId

  // Statistics
  getUserStats(userId: string): Promise<UserStatsSummary | null>;

  // Match linking
  linkMatchToUser(userId: string, matchId: string, playerId: string, playerName?: string): Promise<boolean>;
  getUserMatches(userId: string): Promise<Array<{ matchId: string; playerId: string; linkedAt: Date }>>;
}
