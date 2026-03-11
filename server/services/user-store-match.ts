import type { Pool } from 'pg';
import type { PersistableMatchState, UserSessionRecord, UserStatsSummary } from './user-store-shared';

export const createUserMatchStore = (args: {
  pool: Pool;
}) => {
  const { pool } = args;

  const linkUserToMatch = async (input: {
    userId: string;
    matchId: string;
    playerId: string;
    playerName?: string;
  }) => {
    await pool.query(`
      INSERT INTO user_match_links (user_id, match_id, player_id, player_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, match_id, player_id)
      DO UPDATE SET player_name = EXCLUDED.player_name
    `, [input.userId, input.matchId, input.playerId, input.playerName?.trim() || null]);
  };

  const listUserMatchLinks = async (userId: string) => {
    const result = await pool.query<{
      match_id: string;
      player_id: string;
      player_name: string | null;
      linked_at: string;
    }>(`
      SELECT match_id, player_id, player_name, linked_at
      FROM user_match_links
      WHERE user_id = $1
      ORDER BY linked_at DESC
      LIMIT 100
    `, [userId]);
    return result.rows;
  };

  const listUserSessions = async (userId: string): Promise<UserSessionRecord[]> => {
    const result = await pool.query<UserSessionRecord>(`
      SELECT
        id,
        created_at AS "createdAt",
        last_seen_at AS "lastSeenAt",
        expires_at AS "expiresAt",
        source_ip AS "sourceIp",
        user_agent AS "userAgent"
      FROM user_sessions
      WHERE user_id = $1
      ORDER BY last_seen_at DESC
    `, [userId]);
    return result.rows;
  };

  const deleteSessionByIdForUser = async (userId: string, sessionId: string) => {
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1 AND id = $2', [userId, sessionId]);
  };

  const deleteSessionById = async (sessionId: string) => {
    await pool.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
  };

  const persistMatchResultIfFinished = async (matchId: string, state: PersistableMatchState | null | undefined) => {
    if (!matchId || !state?.ctx?.gameover) return false;
    const already = await pool.query('SELECT 1 FROM persisted_match_results WHERE match_id = $1 LIMIT 1', [matchId]);
    if (already.rowCount) return true;
    const gameover = state.ctx.gameover;
    const turnsCompleted = Number(state.G?.gameStats?.turnsCompleted ?? 0);
    await pool.query(`
      INSERT INTO persisted_match_results (match_id, winner_player_id, end_reason, turns_completed)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (match_id) DO NOTHING
    `, [matchId, gameover.winner ? String(gameover.winner) : null, gameover.endReason ? String(gameover.endReason) : null, turnsCompleted]);

    const ranks = state.G?.ranks ?? {};
    const resources = state.G?.resources ?? {};
    const playerNames = state.G?.playerNames ?? {};
    const playerStats = state.G?.playerGameStats ?? {};
    for (const playerId of Object.keys(ranks)) {
      const stats = playerStats[playerId] ?? {};
      await pool.query(`
        INSERT INTO persisted_match_participants (
          match_id,
          player_id,
          player_name,
          final_rank_id,
          final_resources,
          resources_gained_total,
          resources_lost_total,
          lyaps_played_on_others,
          scandals_played_on_others,
          turns_taken
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
        ON CONFLICT (match_id, player_id) DO UPDATE SET
          player_name = EXCLUDED.player_name,
          final_rank_id = EXCLUDED.final_rank_id,
          final_resources = EXCLUDED.final_resources,
          resources_gained_total = EXCLUDED.resources_gained_total,
          resources_lost_total = EXCLUDED.resources_lost_total,
          lyaps_played_on_others = EXCLUDED.lyaps_played_on_others,
          scandals_played_on_others = EXCLUDED.scandals_played_on_others,
          turns_taken = EXCLUDED.turns_taken
      `, [
        matchId,
        playerId,
        playerNames[playerId] ?? null,
        ranks[playerId] ?? 'recruit',
        JSON.stringify(resources[playerId] ?? {}),
        Number(stats.resourcesGainedTotal ?? 0),
        Number(stats.resourcesLostTotal ?? 0),
        Number(stats.lyapsPlayedOnOthers ?? 0),
        Number(stats.scandalsPlayedOnOthers ?? 0),
        Number(stats.turnsTaken ?? 0),
      ]);
    }
    return true;
  };

  const getUserStatsSummary = async (userId: string): Promise<UserStatsSummary> => {
    const links = await listUserMatchLinks(userId);
    if (!links.length) return {
      matchesLinked: 0,
      matchesFinished: 0,
      wins: 0,
      winRatePct: 0,
      avgTurns: 0,
      bestRankId: 'recruit',
      bestRankName: 'recruit',
      resourcesGainedTotal: 0,
      resourcesLostTotal: 0,
      lyapsPlayedOnOthers: 0,
      scandalsPlayedOnOthers: 0,
      lastMatchAt: null,
    };
    const result = await pool.query<{
      matches_linked: string;
      matches_finished: string;
      wins: string;
      avg_turns: string | null;
      resources_gained_total: string | null;
      resources_lost_total: string | null;
      lyaps_played_on_others: string | null;
      scandals_played_on_others: string | null;
      last_match_at: string | Date | null;
    }>(`
      SELECT
        COUNT(*)::text AS matches_linked,
        COUNT(r.match_id)::text AS matches_finished,
        COALESCE(SUM(CASE WHEN r.winner_player_id = l.player_id THEN 1 ELSE 0 END), 0)::text AS wins,
        ROUND(AVG(r.turns_completed)::numeric, 2)::text AS avg_turns,
        COALESCE(SUM(p.resources_gained_total), 0)::text AS resources_gained_total,
        COALESCE(SUM(p.resources_lost_total), 0)::text AS resources_lost_total,
        COALESCE(SUM(p.lyaps_played_on_others), 0)::text AS lyaps_played_on_others,
        COALESCE(SUM(p.scandals_played_on_others), 0)::text AS scandals_played_on_others,
        MAX(l.linked_at) AS last_match_at
      FROM user_match_links l
      LEFT JOIN persisted_match_results r ON r.match_id = l.match_id
      LEFT JOIN persisted_match_participants p ON p.match_id = l.match_id AND p.player_id = l.player_id
      WHERE l.user_id = $1
    `, [userId]);
    const bestRank = await pool.query<{ final_rank_id: string }>(`
      SELECT p.final_rank_id
      FROM user_match_links l
      JOIN persisted_match_participants p ON p.match_id = l.match_id AND p.player_id = l.player_id
      WHERE l.user_id = $1
      ORDER BY CASE p.final_rank_id
        WHEN 'recruit' THEN 1
        WHEN 'soldier' THEN 2
        WHEN 'junior_sergeant' THEN 3
        WHEN 'sergeant' THEN 4
        WHEN 'senior_sergeant' THEN 5
        WHEN 'ensign' THEN 6
        WHEN 'junior_lieutenant' THEN 7
        WHEN 'lieutenant' THEN 8
        WHEN 'senior_lieutenant' THEN 9
        WHEN 'captain' THEN 10
        WHEN 'major' THEN 11
        WHEN 'lieutenant_colonel' THEN 12
        WHEN 'colonel' THEN 13
        WHEN 'general' THEN 14
        ELSE 0
      END DESC
      LIMIT 1
    `, [userId]);
    const row = result.rows[0];
    const matchesLinked = Number(row?.matches_linked ?? 0);
    const matchesFinished = Number(row?.matches_finished ?? 0);
    const wins = Number(row?.wins ?? 0);
    const bestRankId = bestRank.rows[0]?.final_rank_id ?? 'recruit';
    return {
      matchesLinked,
      matchesFinished,
      wins,
      winRatePct: matchesFinished > 0 ? Number(((wins / matchesFinished) * 100).toFixed(2)) : 0,
      avgTurns: Number(row?.avg_turns ?? 0),
      bestRankId,
      bestRankName: bestRankId.replace(/_/g, ' '),
      resourcesGainedTotal: Number(row?.resources_gained_total ?? 0),
      resourcesLostTotal: Number(row?.resources_lost_total ?? 0),
      lyapsPlayedOnOthers: Number(row?.lyaps_played_on_others ?? 0),
      scandalsPlayedOnOthers: Number(row?.scandals_played_on_others ?? 0),
      lastMatchAt: row?.last_match_at instanceof Date ? row.last_match_at.toISOString() : row?.last_match_at ?? null,
    };
  };

  const listPendingPersistMatchIds = async () => {
    const result = await pool.query<{ match_id: string }>(`
      SELECT DISTINCT l.match_id
      FROM user_match_links l
      LEFT JOIN persisted_match_results r ON r.match_id = l.match_id
      WHERE r.match_id IS NULL
      ORDER BY l.match_id ASC
      LIMIT 200
    `);
    return result.rows.map((row) => row.match_id);
  };

  return {
    linkUserToMatch,
    listUserMatchLinks,
    listUserSessions,
    deleteSessionByIdForUser,
    deleteSessionById,
    persistMatchResultIfFinished,
    getUserStatsSummary,
    listPendingPersistMatchIds,
  };
};
