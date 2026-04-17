import type { RouteCtx } from './types';
import type { UserStore } from '../services/user-store';
import { routeError } from './response';

export type MatchDbStateLike = {
  G?: {
    ranks?: Record<string, string>;
    resources?: Record<string, Record<string, number>>;
    playerNames?: Record<string, string>;
    playerGameStats?: Record<string, {
      resourcesGainedTotal?: number;
      resourcesLostTotal?: number;
      lyapsPlayedOnOthers?: number;
      scandalsPlayedOnOthers?: number;
    }>;
    gameStats?: { turnsCompleted?: number };
  };
  ctx?: { gameover?: { winner?: string; endReason?: string } | null } | null;
};

export type MatchMetadataLike = {
  players?: Record<string, {
    id?: number | string;
    name?: string;
    credentials?: string;
  }>;
};

export type MatchDbLike = {
  fetch: (
    matchID: string,
    opts: { state?: boolean; metadata?: boolean }
  ) => Promise<{ state?: MatchDbStateLike | null; metadata?: MatchMetadataLike | null } | null>;
};

export const getVerifiedMatchParticipant = async (ctx: RouteCtx, matchId: string, playerId: string) => {
  const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
  const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
  if (!dbCandidate || typeof dbFetch !== 'function') {
    routeError(ctx, 400, 'Match database is unavailable for verification.');
    return null;
  }
  const db = dbCandidate as MatchDbLike;
  const fetched = await db.fetch(matchId, { state: true, metadata: true });
  const state = fetched?.state ?? null;
  const metadata = fetched?.metadata ?? null;
  const knownPlayerName = String(state?.G?.playerNames?.[playerId] ?? metadata?.players?.[playerId]?.name ?? '');
  const playerExists = Boolean(state?.G?.ranks?.[playerId] || metadata?.players?.[playerId]);
  if (!playerExists) {
    routeError(ctx, 404, 'Player not found in match.');
    return null;
  }
  return {
    state,
    metadata,
    knownPlayerName,
    metadataPlayer: metadata?.players?.[playerId] ?? null,
  };
};

export const persistFinishedLinkedMatches = async (ctx: RouteCtx, userStore: UserStore, userId: string) => {
  const links = await userStore.listUserMatchLinks(userId);
  if (!links.length) return;
  const dbCandidate = ctx?.db ?? ctx?.app?.context?.db;
  const dbFetch = (dbCandidate as { fetch?: unknown } | undefined)?.fetch;
  if (!dbCandidate || typeof dbFetch !== 'function') {
    return;
  }
  const db = dbCandidate as MatchDbLike;
  for (const link of links) {
    const fetched = await db.fetch(link.match_id, { state: true, metadata: true });
    await userStore.persistMatchResultIfFinished(link.match_id, fetched?.state ?? null);
  }
};
