import type { Pool } from 'pg';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike, RouteCtx } from './types';
import { requireAdminMutationAuth } from '../admin-auth';
import { registerAdminDbToolRoutes } from '../services/admin-db-tools';
import { registerAdminGitRoutes } from '../services/admin-git-ops';
import { buildPublicHealthPayload, getReadinessFromServices, type ServiceHealthSnapshot } from '../services/service-health';
import { loadLobbyGameUiConfig, saveLobbyGameUiConfig } from '../services/game-ui-config';
import { getCookieValue } from '../request-utils';
import { routeError, routeOk } from './response';
import {
  getPasswordResetDeliveryHealth,
  getPublicPasswordResetDeliveryHealth,
  type PasswordResetDeliveryHealth,
  type PublicPasswordResetDeliveryHealth,
} from '../services/password-reset-health';
import type { UserStore } from '../services/user-store';
import { deliverPasswordReset } from '../services/user-recovery';

type CmdResult = { ok: true; stdout: string; stderr: string } | { ok: false; error: string };
type RunGit = (args: string[]) => Promise<CmdResult>;
type RunShellCommand = (command: string, timeoutMs?: number) => Promise<CmdResult>;
type SpawnDetachedShell = (command: string) => void;
type GitAuthStatus = {
  helper: string;
  helperConfigured: boolean;
  hasGithubCredentials: boolean;
  savedUsername: string;
  credentialsPath: string;
  remoteAuthMode: 'https' | 'ssh' | 'other';
};
type GitUpdateStatusOk = {
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
type GitUpdateStatusResult = GitUpdateStatusOk | { ok: false; error: string };
type MatchDbStateLike = { G?: unknown; ctx?: Record<string, unknown> | null } & Record<string, unknown>;
type MatchDbMetadataLike = { updatedAt?: number; gameover?: unknown } & Record<string, unknown>;
type MatchDbFetchResult = { state?: MatchDbStateLike | null; metadata?: MatchDbMetadataLike | null } | null;
type MatchDbLike = {
  fetch: (matchID: string, opts: { state?: boolean; metadata?: boolean; initialState?: boolean }) => Promise<MatchDbFetchResult & { initialState?: MatchDbStateLike | null }>;
  setState?: (matchID: string, state: unknown, deltalog?: unknown[]) => Promise<unknown>;
  setMetadata?: (matchID: string, metadata: unknown) => Promise<void>;
  wipe?: (matchID: string) => Promise<void>;
};

type AdminRoutesDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  getGitUpdateStatus: (runGit: RunGit) => Promise<GitUpdateStatusResult>;
  getGitAuthStatus: (runGit: RunGit) => Promise<GitAuthStatus>;
  autoStashRuntimeNoise: (args: { status: { ignoredRuntimeDirtyFiles?: string[] }; runGit: RunGit; logLine: LogLine }) => Promise<{ ok: boolean; error?: string }>;
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

export const registerAdminRoutes = ({
  router,
  requireAdminAuth,
  enforceRateLimit,
  readJsonBodySafe,
  logLine,
  JSON_BODY_LIMIT,
  getGitUpdateStatus,
  getGitAuthStatus,
  autoStashRuntimeNoise,
  runGit,
  runShellCommand,
  spawnDetachedShell,
  devRestartTouchPath,
  dbSchemaPath,
  adminDbUiConfigPath,
  gameUiConfigPath,
  importJsonConfigToDb,
  userStore,
  pool,
  prepareBackupSnapshot,
  backupRootDir,
  backupAssetDirs,
  persistMatchSnapshot,
  markMatchDeleted,
  getPasswordResetDeliveryHealth: getPasswordResetDeliveryHealthFn = getPasswordResetDeliveryHealth,
  getPublicPasswordResetDeliveryHealth: getPublicPasswordResetDeliveryHealthFn = getPublicPasswordResetDeliveryHealth,
  deliverPasswordResetFn = deliverPasswordReset,
  getServiceHealth,
  auditAdminAction,
}: AdminRoutesDeps) => {
  const requireAdminWriteAccess = (ctx: RouteCtx, routeLabel: string) =>
    requireAdminMutationAuth(ctx, routeLabel, requireAdminAuth);
  const audit = async (action: string, ctx: RouteCtx, success: boolean, details?: Record<string, unknown>, matchId?: string | null) => {
    await auditAdminAction?.({ action, ctx, success, details, matchId });
  };
  router.get('/api/health', (ctx: RouteCtx) => {
    const services = getServiceHealth?.() ?? {};
    routeOk(ctx, buildPublicHealthPayload({
      adminAuthEnabled: Boolean(userStore),
      passwordResetDelivery: getPublicPasswordResetDeliveryHealthFn(),
      services,
    }));
  });

  router.get('/api/ready', (ctx: RouteCtx) => {
    const services = getServiceHealth?.() ?? {};
    const ready = getReadinessFromServices(services);
    if (!ready) {
      routeError(ctx, 503, 'Service readiness check failed.', { services });
      return;
    }
    routeOk(ctx, { services });
  });

  router.get('/api/game/ui-config', async (ctx: RouteCtx) => {
    if (!(await enforceRateLimit(ctx, 'public-game-ui-config-get', 60, 60_000))) return;
    const config = await loadLobbyGameUiConfig(gameUiConfigPath, pool);
    routeOk(ctx, config);
  });

  router.get('/api/admin/health/password-reset', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/health/password-reset'))) return;
    routeOk(ctx, { passwordResetDelivery: getPasswordResetDeliveryHealthFn() });
  });

  router.get('/api/admin/verify', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/verify'))) return;
    routeOk(ctx, { adminAuthEnabled: Boolean(userStore) });
  });

  router.get('/api/admin/game/ui-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/game/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-game-ui-config-get', 30, 60_000))) return;
    const config = await loadLobbyGameUiConfig(gameUiConfigPath, pool);
    routeOk(ctx, config);
  });

  router.post('/api/admin/game/ui-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/game/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-game-ui-config-post', 20, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/game/ui-config', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    try {
      const config = await saveLobbyGameUiConfig(gameUiConfigPath, body, pool);
      await audit('admin.game-ui-config.save', ctx, true, { updatedAt: config.updatedAt });
      routeOk(ctx, { ...config, message: 'Game UI config saved' });
    } catch (error) {
      await audit('admin.game-ui-config.save', ctx, false, { error: String(error instanceof Error ? error.message : error) });
      routeError(ctx, 500, String(error instanceof Error ? error.message : error));
    }
  });

  router.get('/api/admin/analytics', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/analytics'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    routeOk(ctx, { analytics: await userStore.getAdminAnalytics() });
  });

  router.get('/api/admin/awards', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/awards'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    routeOk(ctx, { awards: await userStore.listAwardDefinitions() });
  });

  router.post('/api/admin/awards/save', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/awards/save'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/awards/save', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    try {
      const awards = await userStore.saveAwardDefinition({
        id: typeof body.id === 'string' ? body.id : undefined,
        key: String(body.key ?? ''),
        title: String(body.title ?? ''),
        description: String(body.description ?? ''),
        category: body.category as never,
        metric: body.metric as never,
        threshold: Number(body.threshold ?? 0),
        badgeLabel: String(body.badgeLabel ?? ''),
        badgeVariant: body.badgeVariant as never,
        iconPath: typeof body.iconPath === 'string' ? body.iconPath : null,
        active: body.active !== false,
        sortOrder: Number(body.sortOrder ?? 0),
      });
      routeOk(ctx, { awards });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/admin/awards/delete', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/awards/delete'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/awards/delete', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const awardId = String(body.awardId ?? '').trim();
    if (!awardId) {
      routeError(ctx, 400, 'Missing awardId');
      return;
    }
    const awards = await userStore.deleteAwardDefinition(awardId);
    routeOk(ctx, { awards });
  });

  router.post('/api/admin/users/create', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/create'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/create', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    try {
      const user = await userStore.createUser({
        username: String(body.username ?? ''),
        email: typeof body.email === 'string' ? body.email : undefined,
        password: String(body.password ?? ''),
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
        preferredLang: body.preferredLang === 'en' ? 'en' : 'uk',
        role: body.role === 'administrator' ? 'administrator' : 'user',
      });
      routeOk(ctx, { user });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.get('/api/admin/users', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/users'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const search = typeof ctx?.query?.search === 'string' ? ctx.query.search : '';
    const users = await userStore.listUsersAdmin(search);
    routeOk(ctx, { users });
  });

  router.get('/api/admin/users/detail', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/users/detail'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const userId = typeof ctx?.query?.userId === 'string' ? ctx.query.userId.trim() : '';
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    const detail = await userStore.getAdminUserDetail(userId);
    if (!detail) {
      routeError(ctx, 404, 'User not found');
      return;
    }
    routeOk(ctx, { detail });
  });

  router.post('/api/admin/users/status', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/status'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/status', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    const status = body.status === 'disabled' ? 'disabled' : 'active';
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    const updated = await userStore.updateUserStatus(userId, status);
    if (!updated) {
      routeError(ctx, 404, 'User not found');
      return;
    }
    routeOk(ctx, { user: updated });
  });

  router.post('/api/admin/users/role', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/role'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/role', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    const role = body.role === 'administrator' ? 'administrator' : 'user';
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    const sessionToken = getCookieValue(ctx, 'joj_user_session');
    const actingUser = sessionToken ? await userStore.getUserBySessionToken(sessionToken) : null;
    if (actingUser?.id === userId && actingUser.role === 'administrator' && role !== 'administrator') {
      routeError(ctx, 400, 'You cannot remove the administrator role from your own account.');
      return;
    }
    if (role !== 'administrator') {
      const users = await userStore.listUsersAdmin('', 500);
      const activeAdmins = users.filter((user) => user.role === 'administrator' && user.status === 'active');
      if (activeAdmins.length <= 1 && activeAdmins.some((user) => user.id === userId)) {
        routeError(ctx, 400, 'Cannot remove the last active administrator.');
        return;
      }
    }
    const updated = await userStore.updateUserRole(userId, role);
    if (!updated) {
      routeError(ctx, 404, 'User not found');
      return;
    }
    routeOk(ctx, { user: updated });
  });

  router.post('/api/admin/users/update', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/update'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/update', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    try {
      const updated = await userStore.updateUserAdminProfile({
        userId,
        username: String(body.username ?? ''),
        email: typeof body.email === 'string' ? body.email : null,
        displayName: typeof body.displayName === 'string' ? body.displayName : '',
        bio: typeof body.bio === 'string' ? body.bio : '',
        avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl : null,
        preferredLang: body.preferredLang === 'en' ? 'en' : 'uk',
      });
      if (!updated) {
        routeError(ctx, 404, 'User not found');
        return;
      }
      routeOk(ctx, { user: updated });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/admin/users/request-password-reset', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/request-password-reset'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/request-password-reset', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const login = String(body.login ?? '').trim();
    if (!login) {
      routeError(ctx, 400, 'Missing login');
      return;
    }
    const result = await userStore.createPasswordResetToken(login);
    if (result) {
      try {
        await deliverPasswordResetFn({
          usernameOrEmail: login,
          token: result.token,
          expiresAt: result.expiresAt,
          logLine,
        });
      } catch (error) {
        routeError(ctx, 500, String(error instanceof Error ? error.message : error));
        return;
      }
    }
    routeOk(ctx, { created: Boolean(result) });
  });

  router.post('/api/admin/users/logout-session', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/logout-session'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/logout-session', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const sessionId = String(body.sessionId ?? '').trim();
    if (!sessionId) {
      routeError(ctx, 400, 'Missing sessionId');
      return;
    }
    await userStore.deleteSessionById(sessionId);
    routeOk(ctx);
  });

  router.post('/api/admin/users/logout-all', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/logout-all'))) return;
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/logout-all', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    if (!userId) {
      routeError(ctx, 400, 'Missing userId');
      return;
    }
    await userStore.deleteAllSessionsForUser(userId);
    routeOk(ctx);
  });
  registerAdminDbToolRoutes({
    router,
    requireAdminAuth,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT,
    dbSchemaPath,
    adminDbUiConfigPath,
    importJsonConfigToDb,
    pool,
    prepareBackupSnapshot,
    backupRootDir,
    backupAssetDirs,
  });

  router.get('/api/admin/match-state', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/match-state'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-state', 60, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      routeError(ctx, 400, 'Missing matchID');
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    if (!dbCandidate || typeof dbFetch !== 'function') {
      routeError(ctx, 500, 'Database is unavailable');
      return;
    }
    const db = dbCandidate as MatchDbLike;

    const fetched = await db.fetch(matchID, { state: true, metadata: true });
    const state = fetched?.state;
    const metadata = fetched?.metadata;
    if (!state) {
      routeError(ctx, 404, 'Match not found');
      return;
    }

    await persistMatchSnapshot?.({ matchId: matchID, state, metadata: metadata ?? undefined, snapshotKind: 'manual' });

    routeOk(ctx, {
      snapshot: {
        G: state.G,
        ctx: state.ctx,
        updatedAt: metadata?.updatedAt ?? Date.now(),
      },
    });
  });

  router.post('/api/admin/match-stop', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/match-stop'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-stop', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      routeError(ctx, 400, 'Missing matchID');
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    const dbSetState = (dbCandidate as { setState?: unknown } | undefined)?.setState;
    const dbSetMetadata = (dbCandidate as { setMetadata?: unknown } | undefined)?.setMetadata;
    if (!dbCandidate || typeof dbFetch !== 'function' || typeof dbSetState !== 'function' || typeof dbSetMetadata !== 'function') {
      routeError(ctx, 500, 'Database stop controls are unavailable');
      return;
    }
    const db = dbCandidate as MatchDbLike;

    const fetched = await db.fetch(matchID, { state: true, metadata: true });
    const state = fetched?.state;
    if (!state) {
      routeError(ctx, 404, 'Match not found');
      return;
    }

    const now = Date.now();
    const nextState: MatchDbStateLike = {
      ...state,
      ctx: {
        ...(state.ctx ?? {}),
        gameover: {
          forcedStop: true,
          stoppedAt: now,
        },
      },
    };
    const nextMetadata: MatchDbMetadataLike = {
      ...(fetched?.metadata ?? {}),
      updatedAt: now,
      gameover: { forcedStop: true, stoppedAt: now },
    };

    await db.setState?.(matchID, nextState);
    await db.setMetadata?.(matchID, nextMetadata);
    await persistMatchSnapshot?.({ matchId: matchID, state: nextState, metadata: nextMetadata, snapshotKind: 'admin_stop' });
    await logLine('WARN', `admin stopped match matchID=${matchID}`);

    routeOk(ctx, {
      matchID,
      stopped: true,
      snapshot: {
        G: nextState.G,
        ctx: nextState.ctx,
        updatedAt: now,
      },
    });
  });

  router.post('/api/admin/match-reset', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/match-reset'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-reset', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      routeError(ctx, 400, 'Missing matchID');
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    const dbSetState = (dbCandidate as { setState?: unknown } | undefined)?.setState;
    const dbSetMetadata = (dbCandidate as { setMetadata?: unknown } | undefined)?.setMetadata;
    if (!dbCandidate || typeof dbFetch !== 'function' || typeof dbSetState !== 'function' || typeof dbSetMetadata !== 'function') {
      routeError(ctx, 500, 'Database reset controls are unavailable');
      return;
    }
    const db = dbCandidate as MatchDbLike;

    const fetched = await db.fetch(matchID, { state: true, metadata: true, initialState: true });
    const state = fetched?.state;
    const initialState = fetched?.initialState;
    if (!state || !initialState) {
      routeError(ctx, 404, 'Match or initial state not found');
      return;
    }

    const now = Date.now();
    const nextMetadata: MatchDbMetadataLike = {
      ...(fetched?.metadata ?? {}),
      updatedAt: now,
    };
    delete nextMetadata.gameover;

    await db.setState?.(matchID, initialState, []);
    await db.setMetadata?.(matchID, nextMetadata);
    await persistMatchSnapshot?.({ matchId: matchID, state: initialState, metadata: nextMetadata, snapshotKind: 'admin_reset' });
    await logLine('WARN', `admin reset match matchID=${matchID}`);

    routeOk(ctx, {
      matchID,
      reset: true,
      snapshot: {
        G: initialState.G,
        ctx: initialState.ctx,
        updatedAt: now,
      },
    });
  });

  router.post('/api/admin/match-delete', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/match-delete'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-delete', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      routeError(ctx, 400, 'Missing matchID');
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    const dbWipe = (dbCandidate as { wipe?: unknown } | undefined)?.wipe;
    if (!dbCandidate || typeof dbWipe !== 'function') {
      routeError(ctx, 500, 'Database delete controls are unavailable');
      return;
    }
    const db = dbCandidate as MatchDbLike;
    const fetched = typeof dbFetch === 'function'
      ? await db.fetch(matchID, { state: true, metadata: true })
      : null;
    if (!fetched?.state && !fetched?.metadata) {
      routeOk(ctx, { matchID, deleted: false, missing: true });
      return;
    }

    await db.wipe?.(matchID);
    await markMatchDeleted?.(matchID);
    await logLine('WARN', `admin deleted match matchID=${matchID}`);
    routeOk(ctx, { matchID, deleted: true });
  });

  registerAdminGitRoutes({
    router,
    requireAdminAuth,
    requireAdminWriteAccess,
    enforceRateLimit,
    readJsonBodySafe,
    logLine,
    JSON_BODY_LIMIT,
    getGitUpdateStatus,
    getGitAuthStatus,
    autoStashRuntimeNoise,
    runGit,
    runShellCommand,
    spawnDetachedShell,
    devRestartTouchPath,
  });
};
