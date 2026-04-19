import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type BugReportStatus = 'new' | 'resolved' | 'closed';

export type BugReportRecord = {
  id: string;
  status: BugReportStatus;
  description: string;
  screenshotFileName: string | null;
  screenshotMime: string | null;
  pageUrl: string;
  matchID: string | null;
  playerID: string | null;
  playerName: string | null;
  spectator: boolean;
  uiVariant: 'v1' | 'v2' | 'unknown';
  lang: 'uk' | 'en';
  userAgent: string;
  sourceIp: string;
  createdAt: string;
  updatedAt: string;
  submittedBy: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
  };
};

const isBugReportStatus = (value: string): value is BugReportStatus =>
  value === 'new' || value === 'resolved' || value === 'closed';

const normalizeUiVariant = (value: string | null | undefined): BugReportRecord['uiVariant'] => {
  return value === 'v1' || value === 'v2' ? value : 'unknown';
};

const normalizeLang = (value: string | null | undefined): BugReportRecord['lang'] =>
  value === 'en' ? 'en' : 'uk';

const normalizeString = (value: unknown, maxLen = 5000): string =>
  String(typeof value === 'string' ? value : '').trim().slice(0, maxLen);

const normalizeNullableString = (value: unknown, maxLen = 5000): string | null => {
  const next = normalizeString(value, maxLen);
  return next ? next : null;
};

const mimeToExt = (mime: string) => {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  throw new Error('Unsupported screenshot format.');
};

const mapPgRowToRecord = (row: Record<string, unknown>): BugReportRecord => ({
  id: String(row.id ?? ''),
  status: isBugReportStatus(String(row.status ?? '')) ? String(row.status) as BugReportStatus : 'new',
  description: String(row.description ?? ''),
  screenshotFileName: normalizeNullableString(row.screenshotFileName, 500),
  screenshotMime: normalizeNullableString(row.screenshotMime, 200),
  pageUrl: String(row.pageUrl ?? ''),
  matchID: normalizeNullableString(row.matchID, 200),
  playerID: normalizeNullableString(row.playerID, 200),
  playerName: normalizeNullableString(row.playerName, 200),
  spectator: row.spectator === true,
  uiVariant: normalizeUiVariant(typeof row.uiVariant === 'string' ? row.uiVariant : null),
  lang: normalizeLang(typeof row.lang === 'string' ? row.lang : null),
  userAgent: String(row.userAgent ?? ''),
  sourceIp: String(row.sourceIp ?? ''),
  createdAt: String(row.createdAt ?? ''),
  updatedAt: String(row.updatedAt ?? ''),
  submittedBy: {
    userId: normalizeNullableString(row.submittedUserId, 200),
    username: normalizeNullableString(row.submittedUsername, 200),
    displayName: normalizeNullableString(row.submittedDisplayName, 200),
  },
});

export const createBugReportStore = (args: {
  pool: Pool;
}) => {
  const { pool } = args;
  if (!pool) {
    throw new Error('PostgreSQL pool is required for bug report store.');
  }

  const ensureSchema = async () => {
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id uuid PRIMARY KEY,
        status text NOT NULL CHECK (status IN ('new', 'resolved', 'closed')),
        description text NOT NULL,
        screenshot_file_name text,
        screenshot_mime text,
        screenshot_data bytea,
        page_url text NOT NULL DEFAULT '',
        match_id text,
        player_id text,
        player_name text,
        spectator boolean NOT NULL DEFAULT false,
        ui_variant text NOT NULL DEFAULT 'unknown',
        lang text NOT NULL DEFAULT 'uk',
        user_agent text NOT NULL DEFAULT '',
        source_ip text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        submitted_user_id text,
        submitted_username text,
        submitted_display_name text
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports (created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports (status)');
  };

  return {
    ensureSchema,
    create: async (input: {
      description: string;
      screenshot?: { mime: string; buffer: Buffer } | null;
      pageUrl?: string;
      matchID?: string | null;
      playerID?: string | null;
      playerName?: string | null;
      spectator?: boolean;
      uiVariant?: string | null;
      lang?: string | null;
      userAgent?: string | null;
      sourceIp?: string | null;
      submittedBy?: { userId?: string | null; username?: string | null; displayName?: string | null } | null;
    }) => {
      const now = new Date().toISOString();
      let screenshotFileName: string | null = null;
      let screenshotMime: string | null = null;
      let screenshotData: Buffer | null = null;
      if (input.screenshot) {
        const ext = mimeToExt(input.screenshot.mime);
        screenshotFileName = `${Date.now()}-${randomUUID()}.${ext}`;
        screenshotMime = input.screenshot.mime;
        screenshotData = input.screenshot.buffer;
      }
      const record: BugReportRecord = {
        id: randomUUID(),
        status: 'new',
        description: normalizeString(input.description, 10_000),
        screenshotFileName,
        screenshotMime,
        pageUrl: normalizeString(input.pageUrl, 1000),
        matchID: normalizeNullableString(input.matchID, 200),
        playerID: normalizeNullableString(input.playerID, 200),
        playerName: normalizeNullableString(input.playerName, 200),
        spectator: input.spectator === true,
        uiVariant: normalizeUiVariant(input.uiVariant),
        lang: normalizeLang(input.lang),
        userAgent: normalizeString(input.userAgent, 1000),
        sourceIp: normalizeString(input.sourceIp, 200),
        createdAt: now,
        updatedAt: now,
        submittedBy: {
          userId: normalizeNullableString(input.submittedBy?.userId, 200),
          username: normalizeNullableString(input.submittedBy?.username, 200),
          displayName: normalizeNullableString(input.submittedBy?.displayName, 200),
        },
      };

      await pool.query(
        `INSERT INTO bug_reports (
          id, status, description, screenshot_file_name, screenshot_mime, screenshot_data,
          page_url, match_id, player_id, player_name, spectator, ui_variant, lang,
          user_agent, source_ip, created_at, updated_at,
          submitted_user_id, submitted_username, submitted_display_name
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,$12,$13,
          $14,$15,$16,$17,
          $18,$19,$20
        )`,
        [
          record.id,
          record.status,
          record.description,
          record.screenshotFileName,
          record.screenshotMime,
          screenshotData,
          record.pageUrl,
          record.matchID,
          record.playerID,
          record.playerName,
          record.spectator,
          record.uiVariant,
          record.lang,
          record.userAgent,
          record.sourceIp,
          record.createdAt,
          record.updatedAt,
          record.submittedBy.userId,
          record.submittedBy.username,
          record.submittedBy.displayName,
        ],
      );
      return record;
    },
    list: async () => {
      const result = await pool.query(`
        SELECT
          id::text AS id,
          status,
          description,
          screenshot_file_name AS "screenshotFileName",
          screenshot_mime AS "screenshotMime",
          page_url AS "pageUrl",
          match_id AS "matchID",
          player_id AS "playerID",
          player_name AS "playerName",
          spectator,
          ui_variant AS "uiVariant",
          lang,
          user_agent AS "userAgent",
          source_ip AS "sourceIp",
          created_at::text AS "createdAt",
          updated_at::text AS "updatedAt",
          submitted_user_id AS "submittedUserId",
          submitted_username AS "submittedUsername",
          submitted_display_name AS "submittedDisplayName"
        FROM bug_reports
        ORDER BY created_at DESC
      `);
      return result.rows.map((row) => mapPgRowToRecord(row));
    },
    getById: async (id: string) => {
      const result = await pool.query(`
        SELECT
          id::text AS id,
          status,
          description,
          screenshot_file_name AS "screenshotFileName",
          screenshot_mime AS "screenshotMime",
          page_url AS "pageUrl",
          match_id AS "matchID",
          player_id AS "playerID",
          player_name AS "playerName",
          spectator,
          ui_variant AS "uiVariant",
          lang,
          user_agent AS "userAgent",
          source_ip AS "sourceIp",
          created_at::text AS "createdAt",
          updated_at::text AS "updatedAt",
          submitted_user_id AS "submittedUserId",
          submitted_username AS "submittedUsername",
          submitted_display_name AS "submittedDisplayName"
        FROM bug_reports
        WHERE id = $1
        LIMIT 1
      `, [id]);
      return result.rows[0] ? mapPgRowToRecord(result.rows[0]) : null;
    },
    updateStatus: async (id: string, status: BugReportStatus) => {
      const result = await pool.query(`
        UPDATE bug_reports
        SET status = $2, updated_at = now()
        WHERE id = $1
        RETURNING
          id::text AS id,
          status,
          description,
          screenshot_file_name AS "screenshotFileName",
          screenshot_mime AS "screenshotMime",
          page_url AS "pageUrl",
          match_id AS "matchID",
          player_id AS "playerID",
          player_name AS "playerName",
          spectator,
          ui_variant AS "uiVariant",
          lang,
          user_agent AS "userAgent",
          source_ip AS "sourceIp",
          created_at::text AS "createdAt",
          updated_at::text AS "updatedAt",
          submitted_user_id AS "submittedUserId",
          submitted_username AS "submittedUsername",
          submitted_display_name AS "submittedDisplayName"
      `, [id, status]);
      return result.rows[0] ? mapPgRowToRecord(result.rows[0]) : null;
    },
    getImagePathById: async (id: string) => {
      const result = await pool.query<{ screenshot_mime: string | null; screenshot_data: Buffer | null }>(
        'SELECT screenshot_mime, screenshot_data FROM bug_reports WHERE id = $1 LIMIT 1',
        [id],
      );
      const row = result.rows[0];
      if (!row?.screenshot_data || !row.screenshot_mime) return null;
      return {
        buffer: row.screenshot_data,
        mime: row.screenshot_mime,
      };
    },
  };
};
