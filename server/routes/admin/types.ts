import type { Pool } from 'pg';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike, RouteCtx } from '../types';
import type { ServiceHealthSnapshot } from '../../services/service-health';
import type {
  PasswordResetDeliveryHealth,
  PublicPasswordResetDeliveryHealth,
} from '../../services/password-reset-health';
import type { UserStore } from '../../services/user-store';
import type { deliverPasswordReset } from '../../services/user-recovery';

export type CmdResult = { ok: true; stdout: string; stderr: string } | { ok: false; error: string };
export type RunGit = (args: string[]) => Promise<CmdResult>;
export type RunShellCommand = (command: string, timeoutMs?: number) => Promise<CmdResult>;
export type SpawnDetachedShell = (command: string) => void;

export type GitAuthStatus = {
  helper: string;
  helperConfigured: boolean;
  hasGithubCredentials: boolean;
  savedUsername: string;
  credentialsPath: string;
  remoteAuthMode: 'https' | 'ssh' | 'other';
};

export type GitUpdateStatusOk = {
  ok: true;
  branch: string;
  remote: string;
  upstream: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  canUpdate: boolean;
  head: string;
  note?: string;
  ignoredRuntimeDirtyFiles?: string[];
};

export type GitUpdateStatusResult = GitUpdateStatusOk | { ok: false; error: string };

export type MatchDbStateLike = { G?: unknown; ctx?: Record<string, unknown> | null } & Record<string, unknown>;
export type MatchDbMetadataLike = { updatedAt?: number; gameover?: unknown } & Record<string, unknown>;
export type MatchDbFetchResult = { state?: MatchDbStateLike | null; metadata?: MatchDbMetadataLike | null } | null;

export type MatchDbLike = {
  fetch: (
    matchID: string,
    opts: { state?: boolean; metadata?: boolean; initialState?: boolean },
  ) => Promise<MatchDbFetchResult & { initialState?: MatchDbStateLike | null }>;
  setState?: (matchID: string, state: unknown, deltalog?: unknown[]) => Promise<unknown>;
  setMetadata?: (matchID: string, metadata: unknown) => Promise<void>;
  wipe?: (matchID: string) => Promise<void>;
  listMatches?: () => Promise<string[]>;
};

export type AdminRoutesDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  getGitUpdateStatus: (runGit: RunGit) => Promise<GitUpdateStatusResult>;
  getGitAuthStatus: () => Promise<GitAuthStatus>;
  saveGitAuthCredentials: (args: { username: string; token: string }) => Promise<GitAuthStatus>;
  clearGitAuthCredentials: () => Promise<GitAuthStatus>;
  autoStashRuntimeNoise: (args: {
    status: { ignoredRuntimeDirtyFiles?: string[] };
    runGit: RunGit;
    logLine: LogLine;
  }) => Promise<{ ok: boolean; error?: string }>;
  runGit: RunGit;
  runShellCommand: RunShellCommand;
  spawnDetachedShell: SpawnDetachedShell;
  devRestartTouchPath: string;
  dbSchemaPath: string;
  adminDbUiConfigPath: string;
  gameUiConfigPath: string;
  importJsonConfigToDb: (draft?: {
    host: string;
    port: string;
    database: string;
    user: string;
    password?: string;
    sslMode?: 'disable' | 'require';
  }) => Promise<void>;
  syncJsonToPostgresIncremental: (draft?: {
    host: string;
    port: string;
    database: string;
    user: string;
    password?: string;
    sslMode?: 'disable' | 'require';
  }) => Promise<void>;
  loadSharedConfigFromDb?: (draft?: {
    host: string;
    port: string;
    database: string;
    user: string;
    password?: string;
    sslMode?: 'disable' | 'require';
  }) => Promise<void>;
  userStore?: UserStore | null;
  pool?: Pool | null;
  prepareBackupSnapshot?: () => Promise<void>;
  backupRootDir?: string;
  backupAssetDirs?: string[];
  persistMatchSnapshot?: (args: {
    matchId: string;
    state: MatchDbStateLike;
    metadata?: MatchDbMetadataLike;
    snapshotKind?: 'initial' | 'autosave' | 'manual' | 'admin_stop' | 'admin_reset' | 'final';
  }) => Promise<boolean> | boolean;
  markMatchDeleted?: (matchId: string) => Promise<void> | void;
  getPasswordResetDeliveryHealth?: () => PasswordResetDeliveryHealth;
  getPublicPasswordResetDeliveryHealth?: () => PublicPasswordResetDeliveryHealth;
  deliverPasswordResetFn?: typeof deliverPasswordReset;
  getServiceHealth?: () => ServiceHealthSnapshot;
  auditAdminAction?: (input: {
    action: string;
    ctx: RouteCtx;
    success: boolean;
    actor?: string;
    matchId?: string | null;
    details?: Record<string, unknown>;
  }) => Promise<void>;
};

export type AdminRouteSharedDeps = Pick<
  AdminRoutesDeps,
  'router' | 'requireAdminAuth' | 'enforceRateLimit' | 'readJsonBodySafe' | 'logLine' | 'JSON_BODY_LIMIT'
>;

export type RequireAdminWriteAccess = (ctx: RouteCtx, routeLabel: string) => Promise<boolean>;
export type AdminAudit = (
  action: string,
  ctx: RouteCtx,
  success: boolean,
  details?: Record<string, unknown>,
  matchId?: string | null,
) => Promise<void>;
