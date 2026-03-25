import { Readable, Writable } from 'node:stream';
import { readJsonBodySafe } from '../request-utils';
import { createBotPlayerName, getBotSeatIds, normalizeBotSetup } from '../../src/game/bot-engine/config';
import type { LogLine, RouteCtx, RouterLike } from './types';
import type { UserStore } from '../services/user-store';
import { requireUserAuth, requireUserCsrf } from '../services/user-auth';

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
        const [chunk] = args;
        if (typeof chunk !== 'undefined' && typeof chunk !== 'function') {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
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

export const registerUserLobbyRoutes = (args: {
  router: RouterLike;
  userStore: UserStore | null;
  logLine: LogLine;
  jsonBodyLimit: number;
  lobbyApiFactory?: (ctx: RouteCtx) => InternalLobbyApi;
}) => {
  const { router, userStore, logLine, jsonBodyLimit, lobbyApiFactory = createInternalLobbyApi } = args;

  router.post('/api/user-lobby/create-and-join', async (ctx: RouteCtx) => {
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
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
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid create-and-join payload.' };
      return;
    }
    try {
      const lobbyApi = lobbyApiFactory(ctx);
      const botSetup = normalizeBotSetup((setupData as { bots?: unknown } | null | undefined)?.bots, numPlayers);
      const created = await lobbyApi.createMatch(gameName, { numPlayers, setupData });
      const matchID = String(created.matchID ?? '');
      if (!matchID) throw new Error('Match ID missing after creation.');
      const joined = await lobbyApi.joinMatch(gameName, matchID, { playerID: '0', playerName });
      const playerID = String(joined.playerID ?? '0');
      const credentials = String(joined.playerCredentials ?? '');
      if (botSetup) {
        for (const [index, botPlayerID] of getBotSeatIds(numPlayers, botSetup.count).entries()) {
          await lobbyApi.joinMatch(gameName, matchID, {
            playerID: botPlayerID,
            playerName: createBotPlayerName({ difficulty: botSetup.difficulty, profile: botSetup.profile, seatIndex: index + 1 }),
          });
        }
      }
      await verifiedBind({
        ctx,
        userStore,
        userId: user.id,
        matchId: matchID,
        playerId: playerID,
        credentials,
        playerName,
      });
      ctx.body = { ok: true, session: { matchID, playerID, credentials } };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { ok: false, error: String(error instanceof Error ? error.message : error) };
    }
  });

  router.post('/api/user-lobby/join', async (ctx: RouteCtx) => {
    if (!userStore) {
      ctx.status = 503;
      ctx.body = { ok: false, error: 'User module is unavailable.' };
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
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid join payload.' };
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
      ctx.body = { ok: true, session: { matchID, playerID: resolvedPlayerID, credentials } };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { ok: false, error: String(error instanceof Error ? error.message : error) };
    }
  });
};
