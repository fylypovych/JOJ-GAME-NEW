import { readJsonBodySafe } from '../request-utils';
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

const getSelfServerBaseUrl = () => `http://127.0.0.1:${Number(process.env.PORT ?? 8000)}`;

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
  if (playerName && knownPlayerName && playerName !== knownPlayerName) {
    throw new Error('Player name does not match current match state.');
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
}) => {
  const { router, userStore, logLine, jsonBodyLimit } = args;

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
      const base = getSelfServerBaseUrl();
      const createdResponse = await fetch(`${base}/games/${encodeURIComponent(gameName)}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numPlayers, setupData }),
      });
      const createdPayload = await createdResponse.json().catch(() => ({}));
      if (!createdResponse.ok) {
        throw new Error(String((createdPayload as { error?: string }).error ?? 'Failed to create match.'));
      }
      const matchID = String((createdPayload as { matchID?: string }).matchID ?? '');
      if (!matchID) throw new Error('Match ID missing after creation.');
      const joinedResponse = await fetch(`${base}/games/${encodeURIComponent(gameName)}/${encodeURIComponent(matchID)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID: '0', playerName }),
      });
      const joinedPayload = await joinedResponse.json().catch(() => ({}));
      if (!joinedResponse.ok) {
        throw new Error(String((joinedPayload as { error?: string }).error ?? 'Failed to join match.'));
      }
      const playerID = String((joinedPayload as { playerID?: string }).playerID ?? '0');
      const credentials = String((joinedPayload as { playerCredentials?: string }).playerCredentials ?? '');
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
      const base = getSelfServerBaseUrl();
      const joinedResponse = await fetch(`${base}/games/${encodeURIComponent(gameName)}/${encodeURIComponent(matchID)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID, playerName }),
      });
      const joinedPayload = await joinedResponse.json().catch(() => ({}));
      if (!joinedResponse.ok) {
        throw new Error(String((joinedPayload as { error?: string }).error ?? 'Failed to join match.'));
      }
      const resolvedPlayerID = String((joinedPayload as { playerID?: string }).playerID ?? playerID);
      const credentials = String((joinedPayload as { playerCredentials?: string }).playerCredentials ?? '');
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
