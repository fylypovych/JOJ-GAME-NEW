import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike, RouteCtx } from './types';
import { requireAdminMutationAuth } from '../admin-auth';
import { registerAdminDbToolRoutes } from '../services/admin-db-tools';
import { loadLobbyGameUiConfig, saveLobbyGameUiConfig } from '../services/game-ui-config';
import { getCookieValue } from '../request-utils';
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
  saveGithubHttpsCredentials: (args: { runGit: RunGit; username: string; token: string }) => Promise<{ ok: boolean; error?: string }>;
  clearGithubHttpsCredentials: () => Promise<{ ok: boolean; error?: string }>;
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
  getPasswordResetDeliveryHealth?: () => PasswordResetDeliveryHealth;
  getPublicPasswordResetDeliveryHealth?: () => PublicPasswordResetDeliveryHealth;
  deliverPasswordResetFn?: typeof deliverPasswordReset;
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
  saveGithubHttpsCredentials,
  clearGithubHttpsCredentials,
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
  getPasswordResetDeliveryHealth: getPasswordResetDeliveryHealthFn = getPasswordResetDeliveryHealth,
  getPublicPasswordResetDeliveryHealth: getPublicPasswordResetDeliveryHealthFn = getPublicPasswordResetDeliveryHealth,
  deliverPasswordResetFn = deliverPasswordReset,
}: AdminRoutesDeps) => {
  const requireAdminWriteAccess = (ctx: RouteCtx, routeLabel: string) =>
    requireAdminMutationAuth(ctx, routeLabel, requireAdminAuth);
  const discardLocalGitChanges = async () => {
    const resetRes = await runGit(['reset', '--hard', 'HEAD']);
    if (!resetRes.ok) return { ok: false as const, error: resetRes.error };
    const cleanRes = await runGit(['clean', '-fd']);
    if (!cleanRes.ok) return { ok: false as const, error: cleanRes.error };
    return {
      ok: true as const,
      output: [resetRes.stdout.trim(), cleanRes.stdout.trim()].filter(Boolean).join('\n').trim(),
    };
  };

  router.get('/api/health', (ctx: RouteCtx) => {
    ctx.body = {
      ok: true,
      service: 'joj-game-server',
      now: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      port: Number(process.env.PORT ?? 8000),
      adminAuthEnabled: Boolean(userStore),
      passwordResetDelivery: getPublicPasswordResetDeliveryHealthFn(),
    };
  });

  router.get('/api/game/ui-config', async (ctx: RouteCtx) => {
    if (!(await enforceRateLimit(ctx, 'public-game-ui-config-get', 60, 60_000))) return;
    const config = await loadLobbyGameUiConfig(gameUiConfigPath);
    ctx.body = { ok: true, ...config };
  });

  router.get('/api/admin/health/password-reset', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/health/password-reset'))) return;
    ctx.body = {
      ok: true,
      passwordResetDelivery: getPasswordResetDeliveryHealthFn(),
    };
  });

  router.get('/api/admin/verify', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/verify'))) return;
    ctx.body = { ok: true, adminAuthEnabled: Boolean(userStore) };
  });

  router.get('/api/admin/game/ui-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/game/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-game-ui-config-get', 30, 60_000))) return;
    const config = await loadLobbyGameUiConfig(gameUiConfigPath);
    ctx.body = { ok: true, ...config };
  });

  router.post('/api/admin/game/ui-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/game/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-game-ui-config-post', 20, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/game/ui-config', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    try {
      const config = await saveLobbyGameUiConfig(gameUiConfigPath, body);
      ctx.body = { ok: true, ...config, message: 'Game UI config saved' };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { ok: false, error: String(error instanceof Error ? error.message : error) };
    }
  });

  router.get('/api/admin/analytics', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/analytics'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    ctx.body = { ok: true, analytics: await userStore.getAdminAnalytics() };
  });

  router.get('/api/admin/awards', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/awards'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    ctx.body = { ok: true, awards: await userStore.listAwardDefinitions() };
  });

  router.post('/api/admin/awards/save', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/awards/save'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
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
      ctx.body = { ok: true, awards };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { ok: false, error: String(error instanceof Error ? error.message : error) };
    }
  });

  router.post('/api/admin/awards/delete', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/awards/delete'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/awards/delete', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const awardId = String(body.awardId ?? '').trim();
    if (!awardId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing awardId' };
      return;
    }
    const awards = await userStore.deleteAwardDefinition(awardId);
    ctx.body = { ok: true, awards };
  });

  router.post('/api/admin/users/create', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/create'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
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
      ctx.body = { ok: true, user };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { ok: false, error: String(error instanceof Error ? error.message : error) };
    }
  });

  router.get('/api/admin/users', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/users'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const search = typeof ctx?.query?.search === 'string' ? ctx.query.search : '';
    const users = await userStore.listUsersAdmin(search);
    ctx.body = { ok: true, users };
  });

  router.get('/api/admin/users/detail', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/users/detail'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const userId = typeof ctx?.query?.userId === 'string' ? ctx.query.userId.trim() : '';
    if (!userId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing userId' };
      return;
    }
    const detail = await userStore.getAdminUserDetail(userId);
    if (!detail) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'User not found' };
      return;
    }
    ctx.body = { ok: true, detail };
  });

  router.post('/api/admin/users/status', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/status'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/status', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    const status = body.status === 'disabled' ? 'disabled' : 'active';
    if (!userId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing userId' };
      return;
    }
    const updated = await userStore.updateUserStatus(userId, status);
    if (!updated) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'User not found' };
      return;
    }
    ctx.body = { ok: true, user: updated };
  });

  router.post('/api/admin/users/role', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/role'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/role', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    const role = body.role === 'administrator' ? 'administrator' : 'user';
    if (!userId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing userId' };
      return;
    }
    const sessionToken = getCookieValue(ctx, 'joj_user_session');
    const actingUser = sessionToken ? await userStore.getUserBySessionToken(sessionToken) : null;
    if (actingUser?.id === userId && actingUser.role === 'administrator' && role !== 'administrator') {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'You cannot remove the administrator role from your own account.' };
      return;
    }
    if (role !== 'administrator') {
      const users = await userStore.listUsersAdmin('', 500);
      const activeAdmins = users.filter((user) => user.role === 'administrator' && user.status === 'active');
      if (activeAdmins.length <= 1 && activeAdmins.some((user) => user.id === userId)) {
        ctx.status = 400;
        ctx.body = { ok: false, error: 'Cannot remove the last active administrator.' };
        return;
      }
    }
    const updated = await userStore.updateUserRole(userId, role);
    if (!updated) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'User not found' };
      return;
    }
    ctx.body = { ok: true, user: updated };
  });

  router.post('/api/admin/users/admin-token', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/admin-token'))) return;
    if (!userStore || typeof userStore.rotateAdminAccessToken !== 'function') {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/admin-token', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    if (!userId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing userId' };
      return;
    }
    const rotated = await userStore.rotateAdminAccessToken(userId);
    if (!rotated) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Admin token can only be issued to an active administrator.' };
      return;
    }
    ctx.body = { ok: true, token: rotated.token, rotatedAt: rotated.rotatedAt };
  });

  router.post('/api/admin/users/update', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/update'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/update', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    if (!userId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing userId' };
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
        ctx.status = 404;
        ctx.body = { ok: false, error: 'User not found' };
        return;
      }
      ctx.body = { ok: true, user: updated };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { ok: false, error: String(error instanceof Error ? error.message : error) };
    }
  });

  router.post('/api/admin/users/request-password-reset', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/request-password-reset'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/request-password-reset', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const login = String(body.login ?? '').trim();
    if (!login) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing login' };
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
        ctx.status = 500;
        ctx.body = { ok: false, error: String(error instanceof Error ? error.message : error) };
        return;
      }
    }
    ctx.body = {
      ok: true,
      created: Boolean(result),
    };
  });

  router.post('/api/admin/users/logout-session', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/logout-session'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/logout-session', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const sessionId = String(body.sessionId ?? '').trim();
    if (!sessionId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing sessionId' };
      return;
    }
    await userStore.deleteSessionById(sessionId);
    ctx.body = { ok: true };
  });

  router.post('/api/admin/users/logout-all', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/users/logout-all'))) return;
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
      return;
    }
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/users/logout-all', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const userId = String(body.userId ?? '').trim();
    if (!userId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing userId' };
      return;
    }
    await userStore.deleteAllSessionsForUser(userId);
    ctx.body = { ok: true };
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
  });

  router.get('/api/admin/match-state', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/match-state'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-state', 60, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    if (!dbCandidate || typeof dbFetch !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database is unavailable' };
      return;
    }
    const db = dbCandidate as MatchDbLike;

    const fetched = await db.fetch(matchID, { state: true, metadata: true });
    const state = fetched?.state;
    const metadata = fetched?.metadata;
    if (!state) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Match not found' };
      return;
    }

    ctx.body = {
      ok: true,
      snapshot: {
        G: state.G,
        ctx: state.ctx,
        updatedAt: metadata?.updatedAt ?? Date.now(),
      },
    };
  });

  router.post('/api/admin/match-stop', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/match-stop'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-stop', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    const dbSetState = (dbCandidate as { setState?: unknown } | undefined)?.setState;
    const dbSetMetadata = (dbCandidate as { setMetadata?: unknown } | undefined)?.setMetadata;
    if (!dbCandidate || typeof dbFetch !== 'function' || typeof dbSetState !== 'function' || typeof dbSetMetadata !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database stop controls are unavailable' };
      return;
    }
    const db = dbCandidate as MatchDbLike;

    const fetched = await db.fetch(matchID, { state: true, metadata: true });
    const state = fetched?.state;
    if (!state) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Match not found' };
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
    await logLine('WARN', `admin stopped match matchID=${matchID}`);

    ctx.body = {
      ok: true,
      matchID,
      stopped: true,
      snapshot: {
        G: nextState.G,
        ctx: nextState.ctx,
        updatedAt: now,
      },
    };
  });

  router.post('/api/admin/match-reset', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/match-reset'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-reset', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    const dbSetState = (dbCandidate as { setState?: unknown } | undefined)?.setState;
    const dbSetMetadata = (dbCandidate as { setMetadata?: unknown } | undefined)?.setMetadata;
    if (!dbCandidate || typeof dbFetch !== 'function' || typeof dbSetState !== 'function' || typeof dbSetMetadata !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database reset controls are unavailable' };
      return;
    }
    const db = dbCandidate as MatchDbLike;

    const fetched = await db.fetch(matchID, { state: true, metadata: true, initialState: true });
    const state = fetched?.state;
    const initialState = fetched?.initialState;
    if (!state || !initialState) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Match or initial state not found' };
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
    await logLine('WARN', `admin reset match matchID=${matchID}`);

    ctx.body = {
      ok: true,
      matchID,
      reset: true,
      snapshot: {
        G: initialState.G,
        ctx: initialState.ctx,
        updatedAt: now,
      },
    };
  });

  router.post('/api/admin/match-delete', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/match-delete'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-match-delete', 10, 60_000))) return;
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
    const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
    const dbWipe = (dbCandidate as { wipe?: unknown } | undefined)?.wipe;
    if (!dbCandidate || typeof dbWipe !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database delete controls are unavailable' };
      return;
    }
    const db = dbCandidate as MatchDbLike;
    const fetched = typeof dbFetch === 'function'
      ? await db.fetch(matchID, { state: true, metadata: true })
      : null;
    if (!fetched?.state && !fetched?.metadata) {
      ctx.body = { ok: true, matchID, deleted: false, missing: true };
      return;
    }

    await db.wipe?.(matchID);
    await logLine('WARN', `admin deleted match matchID=${matchID}`);
    ctx.body = { ok: true, matchID, deleted: true };
  });

  router.get('/api/admin/git/status', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/status'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-status', 20, 60_000))) return;
    const result = await getGitUpdateStatus(runGit);
    if (!result.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status', details: result.error };
      await logLine('ERROR', `git status failed: ${result.error}`);
      return;
    }
    ctx.body = result;
  });

  router.get('/api/admin/git/auth-status', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/git/auth-status'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-auth-status', 20, 60_000))) return;
    try {
      ctx.body = { ok: true, ...(await getGitAuthStatus(runGit)) };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read GitHub auth status', details: String(error instanceof Error ? error.message : error) };
      await logLine('ERROR', `git auth status failed: ${String(error instanceof Error ? error.message : error)}`);
    }
  });

  router.post('/api/admin/git/auth-configure', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/git/auth-configure'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-auth-configure', 10, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/git/auth-configure', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const action = String(body.action ?? 'save').trim().toLowerCase();
    if (action === 'clear') {
      const clearRes = await clearGithubHttpsCredentials();
      if (!clearRes.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Failed to clear GitHub credentials', details: clearRes.error };
        await logLine('ERROR', `git auth clear failed: ${clearRes.error}`);
        return;
      }
      await logLine('WARN', 'admin cleared stored GitHub HTTPS credentials');
      ctx.body = { ok: true, message: 'GitHub credentials cleared', status: await getGitAuthStatus(runGit) };
      return;
    }

    const username = String(body.username ?? '').trim();
    const token = String(body.token ?? '').trim();
    const saveRes = await saveGithubHttpsCredentials({ runGit, username, token });
    if (!saveRes.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Failed to save GitHub credentials', details: saveRes.error };
      await logLine('ERROR', `git auth save failed: ${saveRes.error}`);
      return;
    }
    await logLine('WARN', `admin saved GitHub HTTPS credentials for username=${username}`);
    ctx.body = { ok: true, message: 'GitHub credentials saved', status: await getGitAuthStatus(runGit) };
  });

  router.post('/api/admin/restart', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/restart'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-restart', 5, 60_000))) return;
    const isPm2Managed =
      process.env.pm_id !== undefined ||
      process.env.PM2_HOME !== undefined ||
      process.env.name === 'joj-game-server';
    await logLine('WARN', `admin requested server restart (pm2Managed=${isPm2Managed ? 'yes' : 'no'})`);
    if (!isPm2Managed) {
      ctx.body = { ok: true, message: 'Dev server restart scheduled (file watch)' };
      setTimeout(async () => {
        try {
          await mkdir(path.dirname(devRestartTouchPath), { recursive: true });
          await writeFile(devRestartTouchPath, `${Date.now()}\n`, 'utf8');
        } catch (error) {
          await logLine('ERROR', `dev restart trigger failed: ${String(error)}`);
        }
      }, 250);
      return;
    }
    ctx.body = { ok: true, message: 'Server restart scheduled' };
    setTimeout(() => {
      process.exit(0);
    }, 400);
  });

  router.post('/api/admin/git/update', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/git/update'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-update', 5, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/git/update', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const ignoreLocalChanges = body.ignoreLocalChanges === true;
    let status = await getGitUpdateStatus(runGit);
    if (!status.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status before update', details: status.error };
      await logLine('ERROR', `git pre-update status failed: ${status.error}`);
      return;
    }
    if (status.dirty) {
      if (!ignoreLocalChanges) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'Working tree has local changes. Commit or stash before update.', status };
        return;
      }
      const discardRes = await discardLocalGitChanges();
      if (!discardRes.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Failed to discard local changes before update', details: discardRes.error, status };
        await logLine('ERROR', `git discard local changes failed before update: ${discardRes.error}`);
        return;
      }
      await logLine('WARN', 'admin update discarded local git changes before pull');
      status = await getGitUpdateStatus(runGit);
      if (!status.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Failed to read Git status after discarding local changes', details: status.error };
        await logLine('ERROR', `git status after discard failed before update: ${status.error}`);
        return;
      }
    }
    const stashRuntime = await autoStashRuntimeNoise({ status, runGit, logLine });
    if (!stashRuntime.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to stash runtime files', details: stashRuntime.error, status };
      await logLine('ERROR', `git runtime stash failed: ${stashRuntime.error}`);
      return;
    }
    if (status.behind <= 0) {
      ctx.body = { ok: true, updated: false, message: 'Already up to date', status };
      return;
    }

    const pullRes = await runGit(['pull', '--ff-only']);
    if (!pullRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Git pull failed', details: pullRes.error, status };
      await logLine('ERROR', `git update failed: ${pullRes.error}`);
      return;
    }

    const nextStatus = await getGitUpdateStatus(runGit);
    if (!nextStatus.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status after update', details: nextStatus.error };
      await logLine('ERROR', `git post-update status failed: ${nextStatus.error}`);
      return;
    }

    await logLine('WARN', `git update applied on branch=${status.branch}; pull output=${pullRes.stdout.trim() || '(no output)'}`);
    ctx.body = {
      ok: true,
      updated: true,
      message: 'Update applied',
      output: pullRes.stdout.trim(),
      status: nextStatus,
    };
  });

  router.post('/api/admin/git/deploy', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/git/deploy'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-deploy', 3, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/git/deploy', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const ignoreLocalChanges = body.ignoreLocalChanges === true;

    let status = await getGitUpdateStatus(runGit);
    if (!status.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status before deploy', details: status.error };
      await logLine('ERROR', `git pre-deploy status failed: ${status.error}`);
      return;
    }
    if (status.dirty) {
      if (!ignoreLocalChanges) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'Working tree has local changes. Commit or stash before deploy.', status };
        return;
      }
      const discardRes = await discardLocalGitChanges();
      if (!discardRes.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Failed to discard local changes before deploy', details: discardRes.error, status };
        await logLine('ERROR', `git discard local changes failed before deploy: ${discardRes.error}`);
        return;
      }
      await logLine('WARN', 'admin deploy discarded local git changes before pull/build');
      status = await getGitUpdateStatus(runGit);
      if (!status.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Failed to read Git status after discarding local changes', details: status.error };
        await logLine('ERROR', `git status after discard failed before deploy: ${status.error}`);
        return;
      }
    }

    const stashRuntime = await autoStashRuntimeNoise({ status, runGit, logLine });
    if (!stashRuntime.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to stash runtime files', details: stashRuntime.error, status };
      await logLine('ERROR', `git runtime stash failed before deploy: ${stashRuntime.error}`);
      return;
    }

    const steps: Array<{ step: string; output?: string }> = [];

    if (status.behind > 0) {
      const pullRes = await runGit(['pull', '--ff-only']);
      if (!pullRes.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Git pull failed', details: pullRes.error, status };
        await logLine('ERROR', `git deploy pull failed: ${pullRes.error}`);
        return;
      }
      steps.push({ step: 'git pull --ff-only', output: pullRes.stdout.trim() || pullRes.stderr.trim() || '(ok)' });
    } else {
      steps.push({ step: 'git pull --ff-only', output: 'Already up to date' });
    }

    let installRes = await runShellCommand('npm ci --include=dev', 30 * 60_000);
    if (!installRes.ok) {
      await logLine('WARN', `deploy npm ci --include=dev failed, falling back to npm install --include=dev: ${installRes.error}`);
      steps.push({ step: 'npm ci --include=dev', output: `FAILED (fallback to npm install --include=dev): ${installRes.error}` });
      installRes = await runShellCommand('npm install --include=dev', 30 * 60_000);
      if (!installRes.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'npm install failed', details: installRes.error, steps };
        await logLine('ERROR', `deploy npm install --include=dev failed: ${installRes.error}`);
        return;
      }
      steps.push({ step: 'npm install --include=dev', output: installRes.stdout.trim() || '(ok)' });
    } else {
      steps.push({ step: 'npm ci --include=dev', output: installRes.stdout.trim() || '(ok)' });
    }

    const tscRes = await runShellCommand('npm run typecheck', 20 * 60_000);
    if (!tscRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'TypeScript build failed', details: tscRes.error, steps };
      await logLine('ERROR', `deploy tsc failed: ${tscRes.error}`);
      return;
    }
    steps.push({ step: 'npm run typecheck', output: tscRes.stdout.trim() || '(ok)' });

    const viteRes = await runShellCommand('npm run build', 30 * 60_000);
    if (!viteRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Vite build failed', details: viteRes.error, steps };
      await logLine('ERROR', `deploy vite build failed: ${viteRes.error}`);
      return;
    }
    steps.push({ step: 'npm run build', output: viteRes.stdout.trim() || '(ok)' });

    const nextStatus = await getGitUpdateStatus(runGit);
    if (!nextStatus.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status after deploy', details: nextStatus.error, steps };
      await logLine('ERROR', `git post-deploy status failed: ${nextStatus.error}`);
      return;
    }

    await logLine('WARN', `admin deploy completed; scheduling PM2 restart; head=${nextStatus.head}`);
    ctx.body = {
      ok: true,
      message: 'Update, build and restart scheduled',
      restarted: true,
      steps,
      status: nextStatus,
    };

    setTimeout(() => {
      try {
        spawnDetachedShell('pm2 restart ecosystem.config.cjs --update-env');
      } catch {
        process.exit(0);
      }
    }, 300);
  });

  router.post('/api/admin/git/publish', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/git/publish'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-git-publish', 5, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/git/publish', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const commitMessage = String(body.commitMessage ?? '').trim();
    let status = await getGitUpdateStatus(runGit);
    if (!status.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status before publish', details: status.error };
      await logLine('ERROR', `git pre-publish status failed: ${status.error}`);
      return;
    }

    const steps: Array<{ step: string; output?: string }> = [];

    if (status.dirty) {
      if (!commitMessage) {
        ctx.status = 400;
        ctx.body = { ok: false, error: 'Commit message is required when there are local changes.', status };
        return;
      }
      const addRes = await runGit(['add', '-A']);
      if (!addRes.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Git add failed', details: addRes.error, status };
        await logLine('ERROR', `git publish add failed: ${addRes.error}`);
        return;
      }
      steps.push({ step: 'git add -A', output: addRes.stdout.trim() || '(ok)' });

      const commitRes = await runGit(['commit', '-m', commitMessage]);
      if (!commitRes.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Git commit failed', details: commitRes.error, status, steps };
        await logLine('ERROR', `git publish commit failed: ${commitRes.error}`);
        return;
      }
      steps.push({ step: `git commit -m "${commitMessage}"`, output: commitRes.stdout.trim() || '(ok)' });

      status = await getGitUpdateStatus(runGit);
      if (!status.ok) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'Failed to read Git status after commit', details: status.error, steps };
        await logLine('ERROR', `git post-commit status failed: ${status.error}`);
        return;
      }
    }

    if (status.ahead <= 0) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'There are no local commits to push.', status, steps };
      return;
    }

    const branch = status.branch || 'main';
    const pushRes = await runGit(['push', 'origin', branch]);
    if (!pushRes.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Git push failed', details: pushRes.error, status, steps };
      await logLine('ERROR', `git publish push failed: ${pushRes.error}`);
      return;
    }
    steps.push({ step: `git push origin ${branch}`, output: pushRes.stdout.trim() || pushRes.stderr.trim() || '(ok)' });

    const nextStatus = await getGitUpdateStatus(runGit);
    if (!nextStatus.ok) {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to read Git status after push', details: nextStatus.error, steps };
      await logLine('ERROR', `git post-push status failed: ${nextStatus.error}`);
      return;
    }

    await logLine('WARN', `git publish completed on branch=${branch}; push output=${pushRes.stdout.trim() || '(no output)'}`);
    ctx.body = {
      ok: true,
      message: 'Commit and push completed',
      steps,
      status: nextStatus,
    };
  });
};
