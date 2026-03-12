import type { Pool } from 'pg';
import type {
  AdminAnalyticsSummary,
  PersistableMatchState,
  UserMatchHistoryItem,
  UserSessionRecord,
  UserStatsSummary,
} from './user-store-shared';

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
    const playerNames = state.G?.playerNames ?? {};
    const ranks = state.G?.ranks ?? {};
    const botPlayers = state.G?.botPlayers ?? {};
    const botIds = Object.keys(botPlayers);
    const winnerPlayerId = gameover.winner ? String(gameover.winner) : null;
    const winnerPlayerName = winnerPlayerId ? String(playerNames[winnerPlayerId] ?? '') || null : null;
    const playerCount = Object.keys(ranks).length;
    const botCount = botIds.length;
    const botDifficulty = botIds.length > 0 ? String(botPlayers[botIds[0]]?.difficulty ?? '').trim() || null : null;
    await pool.query(`
      INSERT INTO persisted_match_results (
        match_id,
        winner_player_id,
        winner_player_name,
        end_reason,
        game_mode,
        player_count,
        bot_count,
        bot_difficulty,
        turns_completed
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (match_id) DO NOTHING
    `, [
      matchId,
      winnerPlayerId,
      winnerPlayerName,
      gameover.endReason ? String(gameover.endReason) : null,
      state.G?.gameMode ?? 'standard',
      playerCount,
      botCount,
      botDifficulty,
      turnsCompleted,
    ]);

    const resources = state.G?.resources ?? {};
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
      rankWins: 0,
      scoreWins: 0,
      stalledMatches: 0,
      botMatchesFinished: 0,
      winRatePct: 0,
      avgTurns: 0,
      bestRankId: 'recruit',
      bestRankName: 'recruit',
      resourcesGainedTotal: 0,
      resourcesLostTotal: 0,
      lyapsPlayedOnOthers: 0,
      scandalsPlayedOnOthers: 0,
      lastMatchAt: null,
      byMode: [],
      byPlayerCount: [],
    };
    const result = await pool.query<{
      matches_linked: string;
      matches_finished: string;
      wins: string;
      rank_wins: string;
      score_wins: string;
      stalled_matches: string;
      bot_matches_finished: string;
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
        COALESCE(SUM(CASE WHEN r.winner_player_id = l.player_id AND r.end_reason = 'winner' THEN 1 ELSE 0 END), 0)::text AS rank_wins,
        COALESCE(SUM(CASE WHEN r.winner_player_id = l.player_id AND COALESCE(r.end_reason, '') <> 'winner' THEN 1 ELSE 0 END), 0)::text AS score_wins,
        COALESCE(SUM(CASE WHEN r.end_reason = 'stalled-no-cards' THEN 1 ELSE 0 END), 0)::text AS stalled_matches,
        COALESCE(SUM(CASE WHEN COALESCE(r.bot_count, 0) > 0 THEN 1 ELSE 0 END), 0)::text AS bot_matches_finished,
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
    const byModeResult = await pool.query<{
      mode: 'standard' | 'standard_plus' | 'simplified';
      matches_finished: string;
      wins: string;
    }>(`
      SELECT
        COALESCE(r.game_mode, 'standard') AS mode,
        COUNT(*)::text AS matches_finished,
        COALESCE(SUM(CASE WHEN r.winner_player_id = l.player_id THEN 1 ELSE 0 END), 0)::text AS wins
      FROM user_match_links l
      JOIN persisted_match_results r ON r.match_id = l.match_id
      WHERE l.user_id = $1
      GROUP BY COALESCE(r.game_mode, 'standard')
      ORDER BY mode ASC
    `, [userId]);
    const byPlayerCountResult = await pool.query<{
      player_count: number;
      matches_finished: string;
      wins: string;
    }>(`
      SELECT
        COALESCE(r.player_count, 0) AS player_count,
        COUNT(*)::text AS matches_finished,
        COALESCE(SUM(CASE WHEN r.winner_player_id = l.player_id THEN 1 ELSE 0 END), 0)::text AS wins
      FROM user_match_links l
      JOIN persisted_match_results r ON r.match_id = l.match_id
      WHERE l.user_id = $1
      GROUP BY COALESCE(r.player_count, 0)
      ORDER BY player_count ASC
    `, [userId]);
    const bestRankId = bestRank.rows[0]?.final_rank_id ?? 'recruit';
    return {
      matchesLinked,
      matchesFinished,
      wins,
      rankWins: Number(row?.rank_wins ?? 0),
      scoreWins: Number(row?.score_wins ?? 0),
      stalledMatches: Number(row?.stalled_matches ?? 0),
      botMatchesFinished: Number(row?.bot_matches_finished ?? 0),
      winRatePct: matchesFinished > 0 ? Number(((wins / matchesFinished) * 100).toFixed(2)) : 0,
      avgTurns: Number(row?.avg_turns ?? 0),
      bestRankId,
      bestRankName: bestRankId.replace(/_/g, ' '),
      resourcesGainedTotal: Number(row?.resources_gained_total ?? 0),
      resourcesLostTotal: Number(row?.resources_lost_total ?? 0),
      lyapsPlayedOnOthers: Number(row?.lyaps_played_on_others ?? 0),
      scandalsPlayedOnOthers: Number(row?.scandals_played_on_others ?? 0),
      lastMatchAt: row?.last_match_at instanceof Date ? row.last_match_at.toISOString() : row?.last_match_at ?? null,
      byMode: byModeResult.rows.map((entry) => {
        const modeWins = Number(entry.wins ?? 0);
        const modeMatchesFinished = Number(entry.matches_finished ?? 0);
        return {
          mode: entry.mode,
          matchesFinished: modeMatchesFinished,
          wins: modeWins,
          winRatePct: modeMatchesFinished > 0 ? Number(((modeWins / modeMatchesFinished) * 100).toFixed(2)) : 0,
        };
      }),
      byPlayerCount: byPlayerCountResult.rows
        .filter((entry) => Number(entry.player_count ?? 0) > 0)
        .map((entry) => {
          const playerCountWins = Number(entry.wins ?? 0);
          const playerCountMatchesFinished = Number(entry.matches_finished ?? 0);
          return {
            playerCount: Number(entry.player_count),
            matchesFinished: playerCountMatchesFinished,
            wins: playerCountWins,
            winRatePct: playerCountMatchesFinished > 0 ? Number(((playerCountWins / playerCountMatchesFinished) * 100).toFixed(2)) : 0,
          };
        }),
    };
  };

  const listUserMatchHistory = async (userId: string, limit = 25): Promise<UserMatchHistoryItem[]> => {
    const result = await pool.query<{
      matchId: string;
      playerId: string;
      playerName: string | null;
      winnerPlayerId: string | null;
      winnerPlayerName: string | null;
      endReason: string | null;
      turnsCompleted: number;
      gameMode: 'standard' | 'standard_plus' | 'simplified';
      playerCount: number;
      botCount: number;
      botDifficulty: 'easy' | 'normal' | 'hard' | null;
      finalRankId: string;
      finalResources: Record<string, number> | null;
      resourcesGainedTotal: number;
      resourcesLostTotal: number;
      lyapsPlayedOnOthers: number;
      scandalsPlayedOnOthers: number;
      linkedAt: string;
      persistedAt: string;
    }>(`
      SELECT
        l.match_id AS "matchId",
        l.player_id AS "playerId",
        l.player_name AS "playerName",
        r.winner_player_id AS "winnerPlayerId",
        r.winner_player_name AS "winnerPlayerName",
        r.end_reason AS "endReason",
        r.turns_completed AS "turnsCompleted",
        COALESCE(r.game_mode, 'standard') AS "gameMode",
        COALESCE(r.player_count, 0) AS "playerCount",
        COALESCE(r.bot_count, 0) AS "botCount",
        r.bot_difficulty AS "botDifficulty",
        p.final_rank_id AS "finalRankId",
        p.final_resources AS "finalResources",
        p.resources_gained_total AS "resourcesGainedTotal",
        p.resources_lost_total AS "resourcesLostTotal",
        p.lyaps_played_on_others AS "lyapsPlayedOnOthers",
        p.scandals_played_on_others AS "scandalsPlayedOnOthers",
        l.linked_at AS "linkedAt",
        r.persisted_at AS "persistedAt"
      FROM user_match_links l
      JOIN persisted_match_results r ON r.match_id = l.match_id
      JOIN persisted_match_participants p ON p.match_id = l.match_id AND p.player_id = l.player_id
      WHERE l.user_id = $1
      ORDER BY l.linked_at DESC
      LIMIT $2
    `, [userId, Math.max(1, Math.min(limit, 100))]);
    return result.rows.map((row) => ({
      ...row,
      finalResources: row.finalResources ?? {},
    }));
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

  const getAdminAnalytics = async (): Promise<AdminAnalyticsSummary> => {
    const rankOrderSql = `
      CASE p.final_rank_id
        WHEN 'recruit' THEN 1
        WHEN 'soldier' THEN 2
        WHEN 'senior_soldier' THEN 3
        WHEN 'junior_sergeant' THEN 4
        WHEN 'sergeant' THEN 5
        WHEN 'senior_sergeant' THEN 6
        WHEN 'ensign' THEN 7
        WHEN 'junior_lieutenant' THEN 8
        WHEN 'lieutenant' THEN 9
        WHEN 'senior_lieutenant' THEN 10
        WHEN 'captain' THEN 11
        WHEN 'major' THEN 12
        WHEN 'lieutenant_colonel' THEN 13
        WHEN 'colonel' THEN 14
        WHEN 'brigadier_general' THEN 15
        WHEN 'general' THEN 16
        ELSE 0
      END
    `;
    const summaryResult = await pool.query<{
      matches_finished: string;
      rank_wins: string;
      score_wins: string;
      stalled_matches: string;
      avg_turns: string | null;
      avg_player_count: string | null;
      avg_bot_count: string | null;
      avg_winner_rank_order: string | null;
    }>(`
      SELECT
        COUNT(DISTINCT r.match_id)::text AS matches_finished,
        COALESCE(SUM(CASE WHEN r.end_reason = 'winner' THEN 1 ELSE 0 END), 0)::text AS rank_wins,
        COALESCE(SUM(CASE WHEN COALESCE(r.end_reason, '') <> 'winner' THEN 1 ELSE 0 END), 0)::text AS score_wins,
        COALESCE(SUM(CASE WHEN r.end_reason = 'stalled-no-cards' THEN 1 ELSE 0 END), 0)::text AS stalled_matches,
        ROUND(AVG(r.turns_completed)::numeric, 2)::text AS avg_turns,
        ROUND(AVG(r.player_count)::numeric, 2)::text AS avg_player_count,
        ROUND(AVG(r.bot_count)::numeric, 2)::text AS avg_bot_count,
        ROUND(AVG(${rankOrderSql})::numeric, 2)::text AS avg_winner_rank_order
      FROM persisted_match_results r
      LEFT JOIN persisted_match_participants p ON p.match_id = r.match_id AND p.player_id = r.winner_player_id
    `);
    const byModeResult = await pool.query<{
      mode: 'standard' | 'standard_plus' | 'simplified';
      matches_finished: string;
      avg_turns: string | null;
      stalled_matches: string;
      rank_win_rate_pct: string | null;
      score_win_rate_pct: string | null;
      stalled_rate_pct: string | null;
      avg_winner_rank_order: string | null;
    }>(`
      SELECT
        COALESCE(r.game_mode, 'standard') AS mode,
        COUNT(DISTINCT r.match_id)::text AS matches_finished,
        ROUND(AVG(r.turns_completed)::numeric, 2)::text AS avg_turns,
        COALESCE(SUM(CASE WHEN r.end_reason = 'stalled-no-cards' THEN 1 ELSE 0 END), 0)::text AS stalled_matches,
        ROUND((COALESCE(SUM(CASE WHEN r.end_reason = 'winner' THEN 1 ELSE 0 END), 0)::numeric / NULLIF(COUNT(DISTINCT r.match_id), 0)) * 100, 2)::text AS rank_win_rate_pct,
        ROUND((COALESCE(SUM(CASE WHEN COALESCE(r.end_reason, '') <> 'winner' THEN 1 ELSE 0 END), 0)::numeric / NULLIF(COUNT(DISTINCT r.match_id), 0)) * 100, 2)::text AS score_win_rate_pct,
        ROUND((COALESCE(SUM(CASE WHEN r.end_reason = 'stalled-no-cards' THEN 1 ELSE 0 END), 0)::numeric / NULLIF(COUNT(DISTINCT r.match_id), 0)) * 100, 2)::text AS stalled_rate_pct,
        ROUND(AVG(${rankOrderSql})::numeric, 2)::text AS avg_winner_rank_order
      FROM persisted_match_results r
      LEFT JOIN persisted_match_participants p ON p.match_id = r.match_id AND p.player_id = r.winner_player_id
      GROUP BY COALESCE(r.game_mode, 'standard')
      ORDER BY mode ASC
    `);
    const byPlayerCountResult = await pool.query<{
      player_count: number;
      matches_finished: string;
      avg_turns: string | null;
      stalled_matches: string;
      rank_win_rate_pct: string | null;
      score_win_rate_pct: string | null;
      stalled_rate_pct: string | null;
      avg_winner_rank_order: string | null;
    }>(`
      SELECT
        r.player_count,
        COUNT(DISTINCT r.match_id)::text AS matches_finished,
        ROUND(AVG(r.turns_completed)::numeric, 2)::text AS avg_turns,
        COALESCE(SUM(CASE WHEN r.end_reason = 'stalled-no-cards' THEN 1 ELSE 0 END), 0)::text AS stalled_matches,
        ROUND((COALESCE(SUM(CASE WHEN r.end_reason = 'winner' THEN 1 ELSE 0 END), 0)::numeric / NULLIF(COUNT(DISTINCT r.match_id), 0)) * 100, 2)::text AS rank_win_rate_pct,
        ROUND((COALESCE(SUM(CASE WHEN COALESCE(r.end_reason, '') <> 'winner' THEN 1 ELSE 0 END), 0)::numeric / NULLIF(COUNT(DISTINCT r.match_id), 0)) * 100, 2)::text AS score_win_rate_pct,
        ROUND((COALESCE(SUM(CASE WHEN r.end_reason = 'stalled-no-cards' THEN 1 ELSE 0 END), 0)::numeric / NULLIF(COUNT(DISTINCT r.match_id), 0)) * 100, 2)::text AS stalled_rate_pct,
        ROUND(AVG(${rankOrderSql})::numeric, 2)::text AS avg_winner_rank_order
      FROM persisted_match_results r
      LEFT JOIN persisted_match_participants p ON p.match_id = r.match_id AND p.player_id = r.winner_player_id
      GROUP BY r.player_count
      ORDER BY player_count ASC
    `);
    const topRanksResult = await pool.query<{ rank_id: string; count: string }>(`
      SELECT p.final_rank_id AS rank_id, COUNT(*)::text AS count
      FROM persisted_match_participants p
      GROUP BY p.final_rank_id
      ORDER BY COUNT(*) DESC, p.final_rank_id ASC
      LIMIT 10
    `);
    const topWinningRanksResult = await pool.query<{ rank_id: string; count: string }>(`
      SELECT p.final_rank_id AS rank_id, COUNT(*)::text AS count
      FROM persisted_match_results r
      JOIN persisted_match_participants p ON p.match_id = r.match_id AND p.player_id = r.winner_player_id
      GROUP BY p.final_rank_id
      ORDER BY COUNT(*) DESC, p.final_rank_id ASC
      LIMIT 10
    `);
    const row = summaryResult.rows[0];
    return {
      matchesFinished: Number(row?.matches_finished ?? 0),
      rankWins: Number(row?.rank_wins ?? 0),
      scoreWins: Number(row?.score_wins ?? 0),
      stalledMatches: Number(row?.stalled_matches ?? 0),
      avgTurns: Number(row?.avg_turns ?? 0),
      avgPlayerCount: Number(row?.avg_player_count ?? 0),
      avgBotCount: Number(row?.avg_bot_count ?? 0),
      avgWinnerRankOrder: Number(row?.avg_winner_rank_order ?? 0),
      byMode: byModeResult.rows.map((entry) => ({
        mode: entry.mode,
        matchesFinished: Number(entry.matches_finished ?? 0),
        avgTurns: Number(entry.avg_turns ?? 0),
        stalledMatches: Number(entry.stalled_matches ?? 0),
        rankWinRatePct: Number(entry.rank_win_rate_pct ?? 0),
        scoreWinRatePct: Number(entry.score_win_rate_pct ?? 0),
        stalledRatePct: Number(entry.stalled_rate_pct ?? 0),
        avgWinnerRankOrder: Number(entry.avg_winner_rank_order ?? 0),
      })),
      byPlayerCount: byPlayerCountResult.rows.map((entry) => ({
        playerCount: Number(entry.player_count ?? 0),
        matchesFinished: Number(entry.matches_finished ?? 0),
        avgTurns: Number(entry.avg_turns ?? 0),
        stalledMatches: Number(entry.stalled_matches ?? 0),
        rankWinRatePct: Number(entry.rank_win_rate_pct ?? 0),
        scoreWinRatePct: Number(entry.score_win_rate_pct ?? 0),
        stalledRatePct: Number(entry.stalled_rate_pct ?? 0),
        avgWinnerRankOrder: Number(entry.avg_winner_rank_order ?? 0),
      })),
      topRanks: topRanksResult.rows.map((entry) => ({
        rankId: entry.rank_id,
        count: Number(entry.count ?? 0),
      })),
      topWinningRanks: topWinningRanksResult.rows.map((entry) => ({
        rankId: entry.rank_id,
        count: Number(entry.count ?? 0),
      })),
    };
  };

  return {
    linkUserToMatch,
    listUserMatchLinks,
    listUserSessions,
    deleteSessionByIdForUser,
    deleteSessionById,
    persistMatchResultIfFinished,
    getUserStatsSummary,
    listUserMatchHistory,
    listPendingPersistMatchIds,
    getAdminAnalytics,
  };
};
