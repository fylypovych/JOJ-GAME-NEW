import type { Pool } from 'pg';
import {
  type AwardDefinition,
  type AwardMetric,
  type UserAwardRecord,
  type UserStatsSummary,
  getRankOrder,
  normalizeAwardCategory,
  normalizeAwardMetric,
  normalizeBadgeVariant,
} from './user-store-shared';

type AwardGrantRow = {
  award_id: string;
  awarded_at: string;
  progress_value: number;
};

export const createUserAwardsStore = (args: {
  pool: Pool;
  getUserStatsSummary: (userId: string) => Promise<UserStatsSummary>;
}) => {
  const { pool, getUserStatsSummary } = args;

  const listAwardDefinitions = async (): Promise<AwardDefinition[]> => {
    const result = await pool.query<{
      id: string;
      key: string;
      title: string;
      description: string;
      category: AwardDefinition['category'];
      metric: AwardMetric;
      threshold: string | number;
      badgeLabel: string;
      badgeVariant: AwardDefinition['badgeVariant'];
      iconPath: string | null;
      active: boolean;
      sortOrder: number;
      createdAt: string;
      updatedAt: string;
    }>(`
      SELECT
        id,
        award_key AS key,
        title,
        description,
        category,
        metric,
        threshold::text AS threshold,
        badge_label AS "badgeLabel",
        badge_variant AS "badgeVariant",
        icon_path AS "iconPath",
        active,
        sort_order AS "sortOrder",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM award_definitions
      ORDER BY sort_order ASC, title ASC
    `);
    return result.rows.map((row) => ({
      ...row,
      threshold: Number(row.threshold),
    }));
  };

  const evaluateUserAwards = async (userId: string, statsArg?: UserStatsSummary): Promise<UserAwardRecord[]> => {
    const [definitions, stats] = await Promise.all([
      listAwardDefinitions(),
      statsArg ? Promise.resolve(statsArg) : getUserStatsSummary(userId),
    ]);
    const metricValue = (metric: AwardMetric): number => {
      switch (metric) {
        case 'matches_linked': return stats.matchesLinked;
        case 'matches_finished': return stats.matchesFinished;
        case 'wins': return stats.wins;
        case 'win_rate_pct': return stats.winRatePct;
        case 'avg_turns': return stats.avgTurns;
        case 'best_rank_order': return getRankOrder(stats.bestRankId);
        case 'resources_gained_total': return stats.resourcesGainedTotal;
        case 'resources_lost_total': return stats.resourcesLostTotal;
        case 'lyaps_played_on_others': return stats.lyapsPlayedOnOthers;
        case 'scandals_played_on_others': return stats.scandalsPlayedOnOthers;
      }
    };
    const activeDefinitions = definitions.filter((definition) => definition.active);
    for (const definition of activeDefinitions) {
      const progressValue = metricValue(definition.metric);
      if (progressValue >= definition.threshold) {
        await pool.query(`
          INSERT INTO user_awards (user_id, award_id, progress_value)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, award_id)
          DO UPDATE SET progress_value = GREATEST(user_awards.progress_value, EXCLUDED.progress_value)
        `, [userId, definition.id, progressValue]);
      }
    }
    const granted = await pool.query<AwardGrantRow>(`
      SELECT award_id, awarded_at, progress_value
      FROM user_awards
      WHERE user_id = $1
    `, [userId]);
    const grantedById = new Map<string, AwardGrantRow>(granted.rows.map((row) => [row.award_id, row]));
    return definitions.map((definition) => {
      const progressValue = metricValue(definition.metric);
      const grantedRow = grantedById.get(definition.id);
      return {
        awardId: definition.id,
        key: definition.key,
        title: definition.title,
        description: definition.description,
        category: definition.category,
        metric: definition.metric,
        threshold: definition.threshold,
        badgeLabel: definition.badgeLabel,
        badgeVariant: definition.badgeVariant,
        iconPath: definition.iconPath,
        progressValue,
        awarded: Boolean(grantedRow),
        awardedAt: grantedRow?.awarded_at ?? null,
      };
    });
  };

  const saveAwardDefinition = async (args: {
    id?: string;
    key: string;
    title: string;
    description: string;
    category?: AwardDefinition['category'];
    metric?: AwardMetric;
    threshold: number;
    badgeLabel: string;
    badgeVariant?: AwardDefinition['badgeVariant'];
    iconPath?: string | null;
    active?: boolean;
    sortOrder?: number;
  }) => {
    const key = String(args.key ?? '').trim().toLowerCase();
    const title = String(args.title ?? '').trim();
    if (!key || !title) throw new Error('Award key and title are required.');
    if (!Number.isFinite(args.threshold) || Number(args.threshold) <= 0) throw new Error('Award threshold must be positive.');
    const metric = normalizeAwardMetric(args.metric);
    const category = normalizeAwardCategory(args.category);
    const badgeVariant = normalizeBadgeVariant(args.badgeVariant);
    const threshold = Number(args.threshold);
    const sortOrder = Number.isFinite(args.sortOrder) ? Number(args.sortOrder) : 0;
    if (args.id) {
      await pool.query(`
        UPDATE award_definitions
        SET award_key = $2,
            title = $3,
            description = $4,
            category = $5,
            metric = $6,
            threshold = $7,
            badge_label = $8,
            badge_variant = $9,
            icon_path = $10,
            active = $11,
            sort_order = $12,
            updated_at = now()
        WHERE id = $1
      `, [
        args.id,
        key,
        title,
        String(args.description ?? '').trim(),
        category,
        metric,
        threshold,
        String(args.badgeLabel ?? '').trim() || title,
        badgeVariant,
        args.iconPath?.trim() || null,
        args.active !== false,
        sortOrder,
      ]);
    } else {
      await pool.query(`
        INSERT INTO award_definitions (
          award_key, title, description, category, metric, threshold, badge_label, badge_variant, icon_path, active, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [
        key,
        title,
        String(args.description ?? '').trim(),
        category,
        metric,
        threshold,
        String(args.badgeLabel ?? '').trim() || title,
        badgeVariant,
        args.iconPath?.trim() || null,
        args.active !== false,
        sortOrder,
      ]);
    }
    return listAwardDefinitions();
  };

  const deleteAwardDefinition = async (awardId: string) => {
    await pool.query('DELETE FROM award_definitions WHERE id = $1', [awardId]);
    return listAwardDefinitions();
  };

  return {
    listAwardDefinitions,
    evaluateUserAwards,
    saveAwardDefinition,
    deleteAwardDefinition,
  };
};
