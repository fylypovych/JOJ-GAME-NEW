import type { Pool } from 'pg';

type MatchState = Record<string, unknown> | null;
type MatchMetadata = Record<string, unknown> | null;
type MatchLogEntry = Record<string, unknown>;

type CreateMatchOpts = {
  initialState: MatchState;
  metadata: MatchMetadata;
};

type FetchOpts = {
  state?: boolean;
  metadata?: boolean;
  log?: boolean;
  initialState?: boolean;
};

type ListMatchesOpts = {
  gameName?: string;
  where?: {
    isGameover?: boolean;
    updatedBefore?: number;
    updatedAfter?: number;
  };
};

const normalizeUpdatedAt = (metadata: MatchMetadata) => {
  const updatedAt = Number((metadata as { updatedAt?: unknown } | null)?.updatedAt ?? Date.now());
  return Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : Date.now();
};

const isGameover = (metadata: MatchMetadata) =>
  typeof (metadata as { gameover?: unknown } | null)?.gameover !== 'undefined';

export const createBoardgamePostgresDb = (pool: Pool) => {
  const type = () => 1;

  const ensureSchema = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_matches (
        match_id text PRIMARY KEY,
        state_json jsonb,
        metadata_json jsonb,
        initial_state_json jsonb,
        log_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        game_name text,
        is_gameover boolean NOT NULL DEFAULT false,
        updated_at bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_live_matches_game_name ON live_matches (game_name);
      CREATE INDEX IF NOT EXISTS idx_live_matches_updated_at ON live_matches (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_live_matches_is_gameover ON live_matches (is_gameover);
    `);
  };

  const connect = async () => {
    await ensureSchema();
  };

  const createMatch = async (matchID: string, opts: CreateMatchOpts) => {
    const updatedAt = normalizeUpdatedAt(opts.metadata);
    const gameName = typeof (opts.metadata as { gameName?: unknown } | null)?.gameName === 'string'
      ? String((opts.metadata as { gameName?: unknown }).gameName)
      : null;
    await pool.query(
      `INSERT INTO live_matches (
        match_id, state_json, metadata_json, initial_state_json, log_json, game_name, is_gameover, updated_at
      ) VALUES (
        $1, $2::jsonb, $3::jsonb, $4::jsonb, '[]'::jsonb, $5, $6, $7
      )
      ON CONFLICT (match_id) DO UPDATE
      SET state_json = EXCLUDED.state_json,
          metadata_json = EXCLUDED.metadata_json,
          initial_state_json = EXCLUDED.initial_state_json,
          game_name = EXCLUDED.game_name,
          is_gameover = EXCLUDED.is_gameover,
          updated_at = EXCLUDED.updated_at`,
      [
        matchID,
        JSON.stringify(opts.initialState ?? null),
        JSON.stringify(opts.metadata ?? null),
        JSON.stringify(opts.initialState ?? null),
        gameName,
        isGameover(opts.metadata),
        updatedAt,
      ],
    );
  };

  const setState = async (matchID: string, state: MatchState, deltalog?: MatchLogEntry[]) => {
    const current = await pool.query<{ log_json: MatchLogEntry[] | null }>(
      'SELECT log_json FROM live_matches WHERE match_id = $1 LIMIT 1',
      [matchID],
    );
    const nextLog = [
      ...(((current.rows[0]?.log_json ?? []) as MatchLogEntry[]) || []),
      ...((Array.isArray(deltalog) ? deltalog : []) as MatchLogEntry[]),
    ];
    await pool.query(
      `INSERT INTO live_matches (match_id, state_json, log_json, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)
       ON CONFLICT (match_id) DO UPDATE
       SET state_json = EXCLUDED.state_json,
           log_json = EXCLUDED.log_json,
           updated_at = EXCLUDED.updated_at`,
      [matchID, JSON.stringify(state ?? null), JSON.stringify(nextLog), Date.now()],
    );
  };

  const setMetadata = async (matchID: string, metadata: MatchMetadata) => {
    const updatedAt = normalizeUpdatedAt(metadata);
    const gameName = typeof (metadata as { gameName?: unknown } | null)?.gameName === 'string'
      ? String((metadata as { gameName?: unknown }).gameName)
      : null;
    await pool.query(
      `INSERT INTO live_matches (match_id, metadata_json, game_name, is_gameover, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       ON CONFLICT (match_id) DO UPDATE
       SET metadata_json = EXCLUDED.metadata_json,
           game_name = EXCLUDED.game_name,
           is_gameover = EXCLUDED.is_gameover,
           updated_at = EXCLUDED.updated_at`,
      [matchID, JSON.stringify(metadata ?? null), gameName, isGameover(metadata), updatedAt],
    );
  };

  const fetch = async <O extends FetchOpts>(matchID: string, opts: O) => {
    const result = await pool.query<{
      state_json: MatchState;
      metadata_json: MatchMetadata;
      initial_state_json: MatchState;
      log_json: MatchLogEntry[] | null;
    }>(
      `SELECT state_json, metadata_json, initial_state_json, log_json
       FROM live_matches
       WHERE match_id = $1
       LIMIT 1`,
      [matchID],
    );
    const row = result.rows[0];
    const payload: Record<string, unknown> = {};
    if (opts.state) payload.state = row?.state_json;
    if (opts.metadata) payload.metadata = row?.metadata_json;
    if (opts.initialState) payload.initialState = row?.initial_state_json;
    if (opts.log) payload.log = row?.log_json ?? [];
    return payload as {
      [K in keyof O as O[K] extends true ? K : never]:
      K extends 'state' ? MatchState
        : K extends 'metadata' ? MatchMetadata
          : K extends 'initialState' ? MatchState
            : MatchLogEntry[];
    };
  };

  const wipe = async (matchID: string) => {
    await pool.query('DELETE FROM live_matches WHERE match_id = $1', [matchID]);
  };

  const listMatches = async (opts?: ListMatchesOpts) => {
    const where: string[] = [];
    const values: unknown[] = [];
    if (opts?.gameName) {
      values.push(opts.gameName);
      where.push(`game_name = $${values.length}`);
    }
    if (typeof opts?.where?.isGameover === 'boolean') {
      values.push(opts.where.isGameover);
      where.push(`is_gameover = $${values.length}`);
    }
    if (typeof opts?.where?.updatedBefore === 'number') {
      values.push(Math.floor(opts.where.updatedBefore));
      where.push(`updated_at < $${values.length}`);
    }
    if (typeof opts?.where?.updatedAfter === 'number') {
      values.push(Math.floor(opts.where.updatedAfter));
      where.push(`updated_at > $${values.length}`);
    }
    const result = await pool.query<{ match_id: string }>(
      `SELECT match_id
       FROM live_matches
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY updated_at DESC, match_id ASC`,
      values,
    );
    return result.rows.map((row) => row.match_id);
  };

  return {
    type,
    connect,
    ensureSchema,
    createMatch,
    setState,
    setMetadata,
    fetch,
    wipe,
    listMatches,
  };
};
