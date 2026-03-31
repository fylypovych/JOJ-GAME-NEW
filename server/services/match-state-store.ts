import type { Pool } from 'pg';

type MatchDbStateLike = { G?: Record<string, unknown> | null; ctx?: Record<string, unknown> | null } | null | undefined;
type MatchDbMetadataLike = Record<string, unknown> | null | undefined;

const parseIso = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return null;
};

const extractSnapshotSeq = (state: MatchDbStateLike, metadata: MatchDbMetadataLike) => {
  const seq = Number(
    (state?.G as { systemMessageSeq?: unknown } | undefined)?.systemMessageSeq
    ?? (state?.G as { gameStats?: { turnsCompleted?: unknown } } | undefined)?.gameStats?.turnsCompleted
    ?? (state?.ctx as { turn?: unknown } | undefined)?.turn
    ?? (metadata as { updatedAt?: unknown } | undefined)?.updatedAt
    ?? Date.now(),
  );
  return Number.isFinite(seq) && seq >= 0 ? Math.floor(seq) : Date.now();
};

const extractStatus = (state: MatchDbStateLike): 'active' | 'finished' | 'stopped' => {
  const gameover = (state?.ctx as { gameover?: unknown } | undefined)?.gameover as Record<string, unknown> | undefined;
  if (!gameover) return 'active';
  if (gameover.forcedStop) return 'stopped';
  return 'finished';
};

const extractMatchPlayers = (state: MatchDbStateLike, metadata: MatchDbMetadataLike) => {
  const names = ((state?.G as { playerNames?: Record<string, string> } | undefined)?.playerNames) ?? {};
  const ranks = ((state?.G as { ranks?: Record<string, string> } | undefined)?.ranks) ?? {};
  const resources = ((state?.G as { resources?: Record<string, unknown> } | undefined)?.resources) ?? {};
  const metadataPlayers = ((metadata as { players?: Record<string, { name?: string }> } | undefined)?.players) ?? {};
  const playerIds = Array.from(new Set([
    ...Object.keys(names),
    ...Object.keys(ranks),
    ...Object.keys(metadataPlayers),
  ]));
  return playerIds.map((playerId) => ({
    playerId,
    playerName: names[playerId] ?? metadataPlayers[playerId]?.name ?? null,
    seatNo: Number.parseInt(playerId, 10),
    finalRankCode: ranks[playerId] ?? null,
    finalResources: resources[playerId] ?? {},
  }));
};

const extractEventRows = (matchId: string, state: MatchDbStateLike) => {
  const chat = ((state?.G as { chat?: Array<Record<string, unknown>> } | undefined)?.chat) ?? [];
  return chat
    .filter((entry) => entry?.type === 'system' && typeof entry.text === 'string' && entry.text.trim())
    .map((entry, index) => {
      const text = String(entry.text);
      const seqMatch = text.match(/\[(\d+)\]/);
      const seqNo = seqMatch ? Number(seqMatch[1]) : index + 1;
      const upper = text.toUpperCase();
      const eventType =
        upper.includes('SCANDAL') ? 'scandal'
          : upper.includes('ЛЕГЕНД') ? 'legendary'
            : upper.includes('ЗВАНН') ? 'rank'
              : 'system';
      return {
        matchId,
        seqNo,
        eventType,
        playerId: typeof entry.playerID === 'string' ? entry.playerID : null,
        message: text,
        payload: entry,
        createdAt: typeof entry.createdAt === 'number' ? new Date(entry.createdAt).toISOString() : null,
      };
    });
};

export const createMatchStateStore = (pool: Pool) => {
  const ensureSchema = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS match_records (
        id text PRIMARY KEY,
        game_name text NOT NULL DEFAULT 'joj-game',
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'stopped', 'deleted')),
        player_count integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        started_at timestamptz,
        finished_at timestamptz,
        winner_player_id text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE TABLE IF NOT EXISTS match_players (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id text NOT NULL REFERENCES match_records(id) ON DELETE CASCADE,
        player_id text NOT NULL,
        player_name text,
        seat_no integer,
        joined_at timestamptz,
        left_at timestamptz,
        final_rank_code text,
        final_resources jsonb NOT NULL DEFAULT '{}'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (match_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players (match_id, seat_no);
      CREATE TABLE IF NOT EXISTS match_state_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id text NOT NULL REFERENCES match_records(id) ON DELETE CASCADE,
        snapshot_seq bigint NOT NULL,
        snapshot_kind text NOT NULL DEFAULT 'autosave' CHECK (snapshot_kind IN ('initial', 'autosave', 'manual', 'admin_stop', 'admin_reset', 'final')),
        state_json jsonb NOT NULL,
        ctx_json jsonb,
        metadata_json jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (match_id, snapshot_seq)
      );
      CREATE INDEX IF NOT EXISTS idx_match_state_snapshots_match_id ON match_state_snapshots (match_id, snapshot_seq DESC);
      CREATE TABLE IF NOT EXISTS match_event_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id text NOT NULL REFERENCES match_records(id) ON DELETE CASCADE,
        seq_no bigint NOT NULL,
        event_type text NOT NULL,
        player_id text,
        message text,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (match_id, seq_no)
      );
      CREATE INDEX IF NOT EXISTS idx_match_event_log_match_id ON match_event_log (match_id, seq_no DESC);
    `);
  };

  const persistMatchSnapshot = async (args: {
    matchId: string;
    state: MatchDbStateLike;
    metadata?: MatchDbMetadataLike;
    snapshotKind?: 'initial' | 'autosave' | 'manual' | 'admin_stop' | 'admin_reset' | 'final';
  }) => {
    const { matchId, state, metadata, snapshotKind = 'autosave' } = args;
    if (!matchId || !state) return false;
    const status = extractStatus(state);
    const players = extractMatchPlayers(state, metadata);
    const playerCount = players.length;
    const gameover = (state.ctx as { gameover?: Record<string, unknown> } | undefined)?.gameover;
    const winnerPlayerId = gameover?.winner ? String(gameover.winner) : null;
    const nowIso = parseIso((metadata as { updatedAt?: unknown } | undefined)?.updatedAt) ?? new Date().toISOString();
    const snapshotSeq = extractSnapshotSeq(state, metadata);
    const eventRows = extractEventRows(matchId, state);

    await pool.query('BEGIN');
    try {
      await pool.query(
        `INSERT INTO match_records (id, status, player_count, updated_at, finished_at, winner_player_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             player_count = EXCLUDED.player_count,
             updated_at = EXCLUDED.updated_at,
             finished_at = COALESCE(EXCLUDED.finished_at, match_records.finished_at),
             winner_player_id = EXCLUDED.winner_player_id,
             metadata = EXCLUDED.metadata`,
        [
          matchId,
          status,
          playerCount,
          nowIso,
          status === 'active' ? null : nowIso,
          winnerPlayerId,
          JSON.stringify(metadata ?? {}),
        ],
      );

      for (const player of players) {
        await pool.query(
          `INSERT INTO match_players (match_id, player_id, player_name, seat_no, final_rank_code, final_resources, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
           ON CONFLICT (match_id, player_id) DO UPDATE
           SET player_name = EXCLUDED.player_name,
               seat_no = EXCLUDED.seat_no,
               final_rank_code = EXCLUDED.final_rank_code,
               final_resources = EXCLUDED.final_resources,
               metadata = EXCLUDED.metadata`,
          [
            matchId,
            player.playerId,
            player.playerName,
            Number.isFinite(player.seatNo) ? player.seatNo : null,
            player.finalRankCode,
            JSON.stringify(player.finalResources ?? {}),
            JSON.stringify({ syncedAt: nowIso }),
          ],
        );
      }

      await pool.query(
        `INSERT INTO match_state_snapshots (match_id, snapshot_seq, snapshot_kind, state_json, ctx_json, metadata_json, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
         ON CONFLICT (match_id, snapshot_seq) DO UPDATE
         SET snapshot_kind = EXCLUDED.snapshot_kind,
             state_json = EXCLUDED.state_json,
             ctx_json = EXCLUDED.ctx_json,
             metadata_json = EXCLUDED.metadata_json,
             created_at = EXCLUDED.created_at`,
        [
          matchId,
          snapshotSeq,
          snapshotKind,
          JSON.stringify(state.G ?? {}),
          JSON.stringify(state.ctx ?? {}),
          JSON.stringify(metadata ?? {}),
          nowIso,
        ],
      );

      for (const event of eventRows) {
        await pool.query(
          `INSERT INTO match_event_log (match_id, seq_no, event_type, player_id, message, payload, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
           ON CONFLICT (match_id, seq_no) DO UPDATE
           SET event_type = EXCLUDED.event_type,
               player_id = EXCLUDED.player_id,
               message = EXCLUDED.message,
               payload = EXCLUDED.payload`,
          [
            matchId,
            event.seqNo,
            event.eventType,
            event.playerId,
            event.message,
            JSON.stringify(event.payload),
            event.createdAt ?? nowIso,
          ],
        );
      }

      await pool.query('COMMIT');
      return true;
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  };

  const markMatchDeleted = async (matchId: string) => {
    if (!matchId) return;
    await pool.query(
      `INSERT INTO match_records (id, status, updated_at, metadata)
       VALUES ($1, 'deleted', now(), '{}'::jsonb)
       ON CONFLICT (id) DO UPDATE
       SET status = 'deleted',
           updated_at = now()`,
      [matchId],
    );
  };

  return {
    ensureSchema,
    persistMatchSnapshot,
    markMatchDeleted,
  };
};
