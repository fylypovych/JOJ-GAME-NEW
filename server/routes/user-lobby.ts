import { Readable, Writable } from 'node:stream';
import type { Pool } from 'pg';
import { readJsonBodySafe } from '../request-utils';
import { createBotPlayerName, getBotSeatIds, normalizeBotSetup } from '../../src/game/bot-engine/config';
import { clampBotCountToAllowed, clampRoomCapacityToAllowed } from '../../src/game/lobbyConfig';
import type { EnforceRateLimit, LogLine, RouteCtx, RouterLike } from './types';
import type { UserStore } from '../services/user-store';
import { requireUserAuth, requireUserCsrf } from '../services/user-auth';
import { loadLobbyGameUiConfig } from '../services/game-ui-config';
import { routeError, routeOk } from './response';

type MatchDbStateLike = {
  G?: {
    playerNames?: Record<string, string>;
    ranks?: Record<string, string>;
  };
};

type MatchMetadataLike = {
  players?: Record<string, {
    name?: string;
    credentials?: string;
  }>;
};

type MatchDbLike = {
  fetch: (
    matchID: string,
    opts: { state?: boolean; metadata?: boolean }
  ) => Promise<{ state?: MatchDbStateLike | null; metadata?: MatchMetadataLike | null } | null>;
};

type InternalLobbyApi = {
  createMatch: (gameName: string, args: { numPlayers: number; setupData: unknown }) => Promise<{ matchID: string }>;
  joinMatch: (gameName: string, matchID: string, args: { playerID: string; playerName: string }) => Promise<{ playerID: string; playerCredentials: string }>;
  leaveMatch: (gameName: string, matchID: string, args: { playerID: string; credentials: string }) => Promise<void>;
  wipeMatch?: (matchID: string) => Promise<void>;
};

const INTERNAL_LOBBY_TIMEOUT_MS = 10_000;

const parseInternalJsonBody = (value: Buffer) => {
  if (!value.length) return {};
  try {
    const parsed = JSON.parse(value.toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const createInternalLobbyApi = (ctx: RouteCtx): InternalLobbyApi => {
  const directLobbyApi = (ctx as RouteCtx & { app?: { context?: { lobbyApi?: InternalLobbyApi } } })?.app?.context?.lobbyApi;
  if (directLobbyApi) return directLobbyApi;
  const app = (ctx as RouteCtx & { app?: { callback?: () => (req: NodeJS.ReadableStream, res: NodeJS.WritableStream) => void } }).app;
  if (!app || typeof app.callback !== 'function') {
    throw new Error('Lobby app is unavailable.');
  }
  const handler = app.callback();

  const invoke = async (method: 'POST', path: string, payload: Record<string, unknown>) => {
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const request = new Readable({
      read() {
        this.push(rawBody);
        this.push(null);
      },
    }) as Readable & { method?: string; url?: string; headers?: Record<string, string>; socket?: { remoteAddress?: string } };
    request.method = method;
    request.url = path;
    request.headers = {
      'content-type': 'application/json',
      'content-length': String(rawBody.length),
      host: typeof ctx?.request?.headers?.host === 'string' ? String(ctx.request.headers.host) : `127.0.0.1:${Number(process.env.PORT ?? 8000)}`,
      origin: typeof ctx?.request?.headers?.origin === 'string' ? String(ctx.request.headers.origin) : `http://127.0.0.1:${Number(process.env.PORT ?? 8000)}`,
    };
    request.socket = { remoteAddress: '127.0.0.1' };

    const chunks: Buffer[] = [];
    const headerStore = new Map<string, string | string[]>();
    const response = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        callback();
      },
    }) as Writable & {
      statusCode?: number;
      headersSent?: boolean;
      setHeader?: (name: string, value: string | string[]) => void;
      getHeader?: (name: string) => string | string[] | undefined;
      getHeaders?: () => Record<string, string | string[]>;
      removeHeader?: (name: string) => void;
      writeHead?: (statusCode: number, headers?: Record<string, string | string[]>) => void;
      end: (chunk?: string | Buffer) => Writable;
    };
    response.statusCode = 200;
    response.headersSent = false;
    response.setHeader = (name, value) => {
      headerStore.set(name.toLowerCase(), value);
    };
    response.getHeader = (name) => headerStore.get(name.toLowerCase());
    response.getHeaders = () => Object.fromEntries(headerStore.entries());
    response.removeHeader = (name) => {
      headerStore.delete(name.toLowerCase());
    };
    response.writeHead = (statusCode, headers) => {
      response.statusCode = statusCode;
      if (headers) {
        Object.entries(headers).forEach(([name, value]) => {
          response.setHeader?.(name, value);
        });
      }
      response.headersSent = true;
    };

    const done = new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Internal lobby request timed out for ${path}.`));
      }, INTERNAL_LOBBY_TIMEOUT_MS);
      const finish = (result: { status: number; body: Record<string, unknown> }) => {
        clearTimeout(timeout);
        resolve(result);
      };
      const fail = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };
      const originalEnd = response.end.bind(response) as (...args: unknown[]) => Writable;
      response.end = ((...args: unknown[]) => {
        response.headersSent = true;
        originalEnd(...args);
        finish({
          status: Number(response.statusCode ?? 500),
          body: parseInternalJsonBody(Buffer.concat(chunks)),
        });
        return response;
      }) as typeof response.end;
      request.on('error', (error) => {
        fail(error instanceof Error ? error : new Error(String(error)));
      });
      response.on('error', (error) => {
        fail(error instanceof Error ? error : new Error(String(error)));
      });
      response.on('finish', () => {
        if (response.headersSent) return;
        finish({
          status: Number(response.statusCode ?? 500),
          body: parseInternalJsonBody(Buffer.concat(chunks)),
        });
      });
    });

    try {
      handler(request as never, response as never);
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    return done;
  };

  return {
    createMatch: async (gameName, args) => {
      const result = await invoke('POST', `/games/${encodeURIComponent(gameName)}/create`, args as Record<string, unknown>);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(String(result.body.error ?? 'Failed to create match.'));
      }
      return { matchID: String(result.body.matchID ?? '') };
    },
    joinMatch: async (gameName, matchID, args) => {
      const result = await invoke('POST', `/games/${encodeURIComponent(gameName)}/${encodeURIComponent(matchID)}/join`, args as Record<string, unknown>);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(String(result.body.error ?? 'Failed to join match.'));
      }
      return {
        playerID: String(result.body.playerID ?? args.playerID),
        playerCredentials: String(result.body.playerCredentials ?? ''),
      };
    },
    leaveMatch: async (gameName, matchID, args) => {
      const result = await invoke('POST', `/games/${encodeURIComponent(gameName)}/${encodeURIComponent(matchID)}/leave`, args as Record<string, unknown>);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(String(result.body.error ?? 'Failed to leave match.'));
      }
    },
    wipeMatch: async (matchID) => {
      const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
      const wipe = (dbCandidate as { wipe?: unknown } | undefined)?.wipe;
      if (typeof wipe !== 'function') return;
      await (wipe as (id: string) => Promise<void>).call(dbCandidate, matchID);
    },
  };
};

const verifiedBind = async (args: {
  ctx: RouteCtx;
  userStore: UserStore;
  userId: string;
  matchId: string;
  playerId: string;
  credentials: string;
  playerName: string;
}) => {
  const { ctx, userStore, userId, matchId, playerId, credentials, playerName } = args;
  const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
  const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
  if (!dbCandidate || typeof dbFetch !== 'function') {
    throw new Error('Match database is unavailable for verification.');
  }
  const db = dbCandidate as MatchDbLike;
  const fetched = await db.fetch(matchId, { state: true, metadata: true });
  const metadataPlayer = fetched?.metadata?.players?.[playerId];
  const knownPlayerName = String(fetched?.state?.G?.playerNames?.[playerId] ?? metadataPlayer?.name ?? '');
  const playerExists = Boolean(fetched?.state?.G?.ranks?.[playerId] || metadataPlayer);
  if (!playerExists) {
    throw new Error('Player not found in match.');
  }
  if (!metadataPlayer?.credentials || metadataPlayer.credentials !== credentials) {
    throw new Error('Invalid match credentials.');
  }
  await userStore.linkUserToMatch({
    userId,
    matchId,
    playerId,
    playerName: knownPlayerName || playerName || undefined,
  });
  await userStore.persistMatchResultIfFinished(matchId, fetched?.state ?? null);
};

const createAndJoinLobby = async (args: {
  lobbyApi: InternalLobbyApi;
  gameName: string;
  playerName: string;
  numPlayers: number;
  setupData: unknown;
  gameUiConfigPath: string;
  pool?: Pool | null;
}) => {
  const { lobbyApi, gameName, playerName, numPlayers, setupData, gameUiConfigPath, pool } = args;
  const gameUiConfig = await loadLobbyGameUiConfig(gameUiConfigPath, pool);
  const effectiveNumPlayers = clampRoomCapacityToAllowed(numPlayers, gameUiConfig.allowedRoomCapacities);
  const requestedBotSetup = normalizeBotSetup((setupData as { bots?: unknown } | null | undefined)?.bots, effectiveNumPlayers);
  const clampedBotCount = requestedBotSetup
    ? clampBotCountToAllowed(requestedBotSetup.count, gameUiConfig.allowedBotCounts, effectiveNumPlayers)
    : 0;
  const botSetup = requestedBotSetup && clampedBotCount > 0
    ? { ...requestedBotSetup, count: clampedBotCount }
    : null;
  const normalizedSetupData = setupData && typeof setupData === 'object'
    ? { ...(setupData as Record<string, unknown>), bots: botSetup }
    : { bots: botSetup };
  let matchID = '';
  try {
    const created = await lobbyApi.createMatch(gameName, { numPlayers: effectiveNumPlayers, setupData: normalizedSetupData });
    matchID = String(created.matchID ?? '');
    if (!matchID) throw new Error('Match ID missing after creation.');
    const joined = await lobbyApi.joinMatch(gameName, matchID, { playerID: '0', playerName });
    if (botSetup) {
      for (const [index, botPlayerID] of getBotSeatIds(effectiveNumPlayers, botSetup.count).entries()) {
        await lobbyApi.joinMatch(gameName, matchID, {
          playerID: botPlayerID,
          playerName: createBotPlayerName({ difficulty: botSetup.difficulty, profile: botSetup.profile, seatIndex: index + 1 }),
        });
      }
    }
    return {
      matchID,
      playerID: String(joined.playerID ?? '0'),
      credentials: String(joined.playerCredentials ?? ''),
    };
  } catch (error) {
    if (matchID) await lobbyApi.wipeMatch?.(matchID).catch(() => undefined);
    throw error;
  }
};

export const registerUserLobbyRoutes = (args: {
  router: RouterLike;
  userStore: UserStore | null;
  logLine: LogLine;
  jsonBodyLimit: number;
  gameUiConfigPath: string;
  pool?: Pool | null;
  enforceRateLimit: EnforceRateLimit;
  lobbyApiFactory?: (ctx: RouteCtx) => InternalLobbyApi;
}) => {
  const { router, userStore, logLine, jsonBodyLimit, gameUiConfigPath, pool, enforceRateLimit, lobbyApiFactory = createInternalLobbyApi } = args;

  router.post('/api/lobby/create-and-join', async (ctx: RouteCtx) => {
    if (!requireUserCsrf(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'lobby-create', 10, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/lobby/create-and-join', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const gameName = String(body.gameName ?? '').trim();
    const playerName = String(body.playerName ?? '').trim();
    const numPlayers = Number(body.numPlayers ?? 0);
    if (!gameName || !playerName || Number.isNaN(numPlayers) || numPlayers < 2) {
      routeError(ctx, 400, 'Invalid create-and-join payload.');
      return;
    }
    try {
      const session = await createAndJoinLobby({
        lobbyApi: lobbyApiFactory(ctx),
        gameName,
        playerName,
        numPlayers,
        setupData: body.setupData,
        gameUiConfigPath,
        pool,
      });
      routeOk(ctx, { session });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/lobby/join', async (ctx: RouteCtx) => {
    if (!requireUserCsrf(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'lobby-join', 30, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/lobby/join', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const gameName = String(body.gameName ?? '').trim();
    const matchID = String(body.matchID ?? '').trim();
    const playerID = String(body.playerID ?? '').trim();
    const playerName = String(body.playerName ?? '').trim();
    if (!gameName || !matchID || !playerID || !playerName) {
      routeError(ctx, 400, 'Invalid join payload.');
      return;
    }
    try {
      const joined = await lobbyApiFactory(ctx).joinMatch(gameName, matchID, { playerID, playerName });
      routeOk(ctx, {
        session: {
          matchID,
          playerID: String(joined.playerID ?? playerID),
          credentials: String(joined.playerCredentials ?? ''),
        },
      });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/lobby/leave', async (ctx: RouteCtx) => {
    if (!requireUserCsrf(ctx)) return;
    if (!(await enforceRateLimit(ctx, 'lobby-leave', 30, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/lobby/leave', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const gameName = String(body.gameName ?? '').trim();
    const matchID = String(body.matchID ?? '').trim();
    const playerID = String(body.playerID ?? '').trim();
    const credentials = String(body.credentials ?? '').trim();
    if (!gameName || !matchID || !playerID || !credentials) {
      routeError(ctx, 400, 'Invalid leave payload.');
      return;
    }
    try {
      await lobbyApiFactory(ctx).leaveMatch(gameName, matchID, { playerID, credentials });
      routeOk(ctx, {});
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/user-lobby/create-and-join', async (ctx: RouteCtx) => {
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    if (!requireUserCsrf(ctx)) return;
    const user = await requireUserAuth(ctx, userStore);
    if (!user) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/user-lobby/create-and-join', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const gameName = String(body.gameName ?? '').trim();
    const playerName = String(body.playerName ?? '').trim();
    const numPlayers = Number(body.numPlayers ?? 0);
    const setupData = body.setupData;
    if (!gameName || !playerName || Number.isNaN(numPlayers) || numPlayers < 2) {
      routeError(ctx, 400, 'Invalid create-and-join payload.');
      return;
    }
    try {
      const session = await createAndJoinLobby({
        lobbyApi: lobbyApiFactory(ctx),
        gameName,
        playerName,
        numPlayers,
        setupData,
        gameUiConfigPath,
        pool,
      });
      await verifiedBind({
        ctx,
        userStore,
        userId: user.id,
        matchId: session.matchID,
        playerId: session.playerID,
        credentials: session.credentials,
        playerName,
      });
      routeOk(ctx, { session });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/user-lobby/join', async (ctx: RouteCtx) => {
    if (!userStore) {
      routeError(ctx, 503, 'User module is unavailable.');
      return;
    }
    if (!requireUserCsrf(ctx)) return;
    const user = await requireUserAuth(ctx, userStore);
    if (!user) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/user-lobby/join', maxBytes: jsonBodyLimit, logLine });
    if (!body) return;
    const gameName = String(body.gameName ?? '').trim();
    const matchID = String(body.matchID ?? '').trim();
    const playerID = String(body.playerID ?? '').trim();
    const playerName = String(body.playerName ?? '').trim();
    if (!gameName || !matchID || !playerID || !playerName) {
      routeError(ctx, 400, 'Invalid join payload.');
      return;
    }
    try {
      const lobbyApi = lobbyApiFactory(ctx);
      const joined = await lobbyApi.joinMatch(gameName, matchID, { playerID, playerName });
      const resolvedPlayerID = String(joined.playerID ?? playerID);
      const credentials = String(joined.playerCredentials ?? '');
      await verifiedBind({
        ctx,
        userStore,
        userId: user.id,
        matchId: matchID,
        playerId: resolvedPlayerID,
        credentials,
        playerName,
      });
      routeOk(ctx, { session: { matchID, playerID: resolvedPlayerID, credentials } });
    } catch (error) {
      routeError(ctx, 400, String(error instanceof Error ? error.message : error));
    }
  });
};
