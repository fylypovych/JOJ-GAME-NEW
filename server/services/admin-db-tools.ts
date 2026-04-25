import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Pool } from 'pg';
import { requireAdminMutationAuth } from '../admin-auth';
import { loadAppSettingJson, saveAppSettingJson } from './app-settings-store';
import { buildPostgresUrlFromDraft } from '../db/psql';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike, RouteCtx } from '../routes/types';

export type DbConnInput = {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  sslMode: 'disable' | 'require';
};

type AdminDbToolsDeps = {
  router: RouterLike;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  JSON_BODY_LIMIT: number;
  dbSchemaPath: string;
  adminDbUiConfigPath: string;
  migrationsPath: string;
  importJsonConfigToDb: (draft?: DbConnInput) => Promise<void>;
  syncJsonToPostgresIncremental: (draft?: DbConnInput) => Promise<void>;
  loadSharedConfigFromDb?: () => Promise<void>;
  pool?: Pool | null;
  prepareBackupSnapshot?: () => Promise<void>;
  backupRootDir?: string;
  backupAssetDirs?: string[];
};

type CmdExecResult = { ok: boolean; stdout: string; stderr: string; error?: string };

type StoredAdminDbUiConfig = {
  storageMode?: 'db';
  dbConfig?: Partial<DbConnInput>;
  updatedAt?: number;
};

type BackupAssetFile = {
  path: string;
  data: string;
};

type BackupAssetBundle = {
  version: 1;
  generatedAt: string;
  files: BackupAssetFile[];
};

const ADMIN_DB_UI_CONFIG_KEY = 'admin_db_ui_config';
const ASSET_BUNDLE_BEGIN = '/* JOJ_BACKUP_ASSET_BUNDLE_BEGIN';
const ASSET_BUNDLE_END = 'JOJ_BACKUP_ASSET_BUNDLE_END */';

const fail = (ctx: RouteCtx, status: number, error: string, details?: string) => {
  ctx.status = status;
  ctx.body = { ok: false, error, ...(details ? { details } : {}) };
};

const parseDbConnInput = (body: Record<string, unknown>): DbConnInput | { error: string } => {
  const host = typeof body.host === 'string' ? body.host.trim() : '';
  const port = typeof body.port === 'string' ? body.port.trim() : '';
  const database = typeof body.database === 'string' ? body.database.trim() : '';
  const user = typeof body.user === 'string' ? body.user.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const sslMode = body.sslMode === 'require' ? 'require' : 'disable';
  if (!host || !port || !database || !user) {
    return { error: 'Missing required DB connection fields' };
  }
  return { host, port, database, user, password, sslMode };
};

const loadStoredAdminDbUiConfig = async (
  _adminDbUiConfigPath: string,
  pool?: Pool | null,
): Promise<StoredAdminDbUiConfig | null> => {
  void _adminDbUiConfigPath;
  if (!pool) return null;
  const stored = await loadAppSettingJson<StoredAdminDbUiConfig>(pool, ADMIN_DB_UI_CONFIG_KEY);
  return stored ?? null;
};

const buildDbConnInputForExecution = async (
  body: Record<string, unknown>,
  adminDbUiConfigPath: string,
  pool?: Pool | null,
): Promise<DbConnInput | { error: string }> => {
  const parsed = parseDbConnInput(body);
  if ('error' in parsed) return parsed;
  if (parsed.password) return parsed;
  const stored = await loadStoredAdminDbUiConfig(adminDbUiConfigPath, pool);
  const storedPassword = typeof stored?.dbConfig?.password === 'string' ? stored.dbConfig.password : '';
  return { ...parsed, password: storedPassword };
};

const runDbCommand = async (
  bin: 'psql' | 'pg_dump',
  args: string[],
  conn: DbConnInput,
  timeoutMs: number,
  stdinText?: string,
): Promise<CmdExecResult> => (
  new Promise((resolve) => {
    const child = spawn(bin, args, {
      env: {
        ...process.env,
        PGPASSWORD: conn.password,
        PGSSLMODE: conn.sslMode,
      },
      stdio: stdinText === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, stdout, stderr, error: String(error) });
    });
    if (stdinText !== undefined) {
      child.stdin?.on('error', () => {});
      child.stdin?.write(stdinText, 'utf8', () => {
        try { child.stdin?.end(); } catch { /* noop */ }
      });
    }
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, stdout, stderr });
    });
  })
);

const runPsqlScalar = async (conn: DbConnInput, sql: string): Promise<{ ok: true; value: string } | { ok: false; error: string }> => {
  const result = await runDbCommand(
    'psql',
    ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-d', conn.database, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql],
    conn,
    15_000,
  );
  if (!result.ok) {
    return { ok: false, error: (result.stderr || result.error || result.stdout || '').trim() || 'psql scalar query failed' };
  }
  const value = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? '';
  return { ok: true, value };
};

const collectFilesRecursive = async (dirPath: string): Promise<string[]> => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return collectFilesRecursive(absPath);
    if (entry.isFile()) return [absPath];
    return [];
  }));
  return nested.flat();
};

const buildBackupAssetBundle = async (rootDir: string, assetDirs: string[]): Promise<BackupAssetBundle | null> => {
  const files: BackupAssetFile[] = [];
  for (const assetDir of assetDirs) {
    try {
      const dirStats = await stat(assetDir);
      if (!dirStats.isDirectory()) continue;
    } catch {
      continue;
    }
    const dirFiles = await collectFilesRecursive(assetDir);
    for (const absFilePath of dirFiles) {
      const relPath = path.relative(rootDir, absFilePath).replace(/\\/g, '/');
      if (!relPath || relPath.startsWith('..')) continue;
      const buffer = await readFile(absFilePath);
      files.push({
        path: relPath,
        data: buffer.toString('base64'),
      });
    }
  }
  if (files.length === 0) return null;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    files,
  };
};

const appendAssetBundleToSql = (sql: string, bundle: BackupAssetBundle | null) => {
  if (!bundle) return sql;
  return `${sql.trimEnd()}\n\n${ASSET_BUNDLE_BEGIN}\n${JSON.stringify(bundle)}\n${ASSET_BUNDLE_END}\n`;
};

const extractAssetBundleFromSql = (sql: string): { sql: string; bundle: BackupAssetBundle | null } => {
  const startIndex = sql.indexOf(ASSET_BUNDLE_BEGIN);
  const endIndex = sql.indexOf(ASSET_BUNDLE_END);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    return { sql, bundle: null };
  }
  const jsonStart = startIndex + ASSET_BUNDLE_BEGIN.length;
  const bundleText = sql.slice(jsonStart, endIndex).trim();
  const cleanSql = `${sql.slice(0, startIndex).trimEnd()}\n`;
  try {
    const parsed = JSON.parse(bundleText) as BackupAssetBundle;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.files)) {
      return { sql: cleanSql, bundle: null };
    }
    return { sql: cleanSql, bundle: parsed };
  } catch {
    return { sql: cleanSql, bundle: null };
  }
};

const restoreBackupAssetBundle = async (rootDir: string, bundle: BackupAssetBundle | null) => {
  if (!bundle) return 0;
  let restored = 0;
  for (const file of bundle.files) {
    if (!file || typeof file.path !== 'string' || typeof file.data !== 'string') continue;
    const normalizedRel = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalizedRel || normalizedRel.startsWith('..')) continue;
    const absTarget = path.resolve(rootDir, normalizedRel);
    const absRoot = path.resolve(rootDir);
    if (absTarget !== absRoot && !absTarget.startsWith(`${absRoot}${path.sep}`)) continue;
    await mkdir(path.dirname(absTarget), { recursive: true });
    await writeFile(absTarget, Buffer.from(file.data, 'base64'));
    restored += 1;
  }
  return restored;
};

export const registerAdminDbToolRoutes = ({
  router,
  requireAdminAuth,
  enforceRateLimit,
  readJsonBodySafe,
  logLine,
  JSON_BODY_LIMIT,
  dbSchemaPath,
  adminDbUiConfigPath,
  migrationsPath,
  importJsonConfigToDb,
  syncJsonToPostgresIncremental,
  loadSharedConfigFromDb,
  pool,
  prepareBackupSnapshot,
  backupRootDir,
  backupAssetDirs = [],
}: AdminDbToolsDeps) => {
  const ADMIN_DB_SQL_BODY_LIMIT = Math.max(JSON_BODY_LIMIT, 32 * 1024 * 1024);
  const requireAdminWriteAccess = (ctx: RouteCtx, routeLabel: string) =>
    requireAdminMutationAuth(ctx, routeLabel, requireAdminAuth);

  router.post('/api/admin/db/test-connection', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/test-connection'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-test-connection', 20, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/test-connection', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);

    const result = await runDbCommand(
      'psql',
      ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database, '-tA', '-c', 'SELECT 1;'],
      parsed,
      8_000,
    );
    if (!(result.ok && result.stdout.trim() === '1')) {
      return fail(ctx, 400, 'Failed to connect to PostgreSQL', (result.stderr || result.error || result.stdout || '').trim());
    }
    ctx.body = { ok: true, message: 'PostgreSQL connection successful' };
  });

  router.get('/api/admin/db/ui-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/db/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-ui-config-get', 30, 60_000))) return;
    try {
      const parsed = await loadStoredAdminDbUiConfig(adminDbUiConfigPath, pool);
      if (!parsed) throw new Error('missing config');
      ctx.body = {
        ok: true,
        storageMode: 'db',
        dbConfig: parsed.dbConfig
          ? {
            ...parsed.dbConfig,
            password: '',
          }
          : null,
        hasSavedPassword: Boolean(parsed.dbConfig?.password),
      };
    } catch {
      ctx.body = { ok: true, storageMode: 'db', dbConfig: null, hasSavedPassword: false };
    }
  });

  router.post('/api/admin/db/ui-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/ui-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-ui-config-post', 20, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/ui-config', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const rawDbConfig = (body.dbConfig && typeof body.dbConfig === 'object') ? (body.dbConfig as Record<string, unknown>) : {};
    const existingConfig = await loadStoredAdminDbUiConfig(adminDbUiConfigPath, pool);
    const storedPassword = typeof existingConfig?.dbConfig?.password === 'string' ? existingConfig.dbConfig.password : '';
    const normalizedDbConfig = {
      host: typeof rawDbConfig.host === 'string' ? rawDbConfig.host : '127.0.0.1',
      port: typeof rawDbConfig.port === 'string' ? rawDbConfig.port : '5432',
      database: typeof rawDbConfig.database === 'string' ? rawDbConfig.database : 'joj_game',
      user: typeof rawDbConfig.user === 'string' ? rawDbConfig.user : 'joj_user',
      password: typeof rawDbConfig.password === 'string' && rawDbConfig.password.length > 0 ? rawDbConfig.password : storedPassword,
      sslMode: rawDbConfig.sslMode === 'require' ? 'require' : 'disable',
    } satisfies DbConnInput;
    try {
      if (!pool) {
        throw new Error('PostgreSQL pool is required for admin DB UI config.');
      }
      const storedPayload = {
        storageMode: 'db',
        dbConfig: normalizedDbConfig,
        updatedAt: Date.now(),
      };
      await saveAppSettingJson(pool, ADMIN_DB_UI_CONFIG_KEY, storedPayload, 'admin-db-ui');
      ctx.body = { ok: true, message: 'Admin DB UI config saved', hasSavedPassword: Boolean(normalizedDbConfig.password) };
    } catch (error) {
      fail(ctx, 500, 'Failed to save admin DB UI config', String(error));
    }
  });

  router.get('/api/admin/db/schema', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/db/schema'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-schema', 20, 60_000))) return;
    try {
      const content = await readFile(dbSchemaPath, 'utf8');
      ctx.body = { ok: true, filename: 'db.sql', content };
    } catch (error) {
      fail(ctx, 500, 'Failed to read db.sql', String(error));
    }
  });

  router.post('/api/admin/db/import-schema', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/import-schema'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-import-schema', 5, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/import-schema', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);

    const result = await runDbCommand(
      'psql',
      ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database, '-v', 'ON_ERROR_STOP=1', '-f', dbSchemaPath],
      parsed,
      60_000,
    );
    if (!result.ok) return fail(ctx, 400, 'Failed to import db.sql', (result.stderr || result.error || result.stdout || '').trim());
    ctx.body = { ok: true, message: 'db.sql imported successfully' };
  });

  router.post('/api/admin/db/import-json-config', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/import-json-config'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-import-json-config', 20, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/import-json-config', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);

    try {
      await importJsonConfigToDb(parsed);
      ctx.body = { ok: true, message: 'JSON config imported to PostgreSQL successfully' };
    } catch (error) {
      fail(ctx, 500, 'Failed to import JSON config to PostgreSQL', String(error));
    }
  });

  router.post('/api/admin/db/sync-incremental', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/sync-incremental'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-sync-incremental', 20, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/sync-incremental', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);

    try {
      await syncJsonToPostgresIncremental(parsed);
      ctx.body = { ok: true, message: 'JSON config synced incrementally to PostgreSQL successfully' };
    } catch (error) {
      fail(ctx, 500, 'Failed to sync JSON config incrementally to PostgreSQL', String(error));
    }
  });

  router.post('/api/admin/db/load-from-postgres', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/load-from-postgres'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-load-from-postgres', 5, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/load-from-postgres', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);

    try {
      const targetUrl = buildPostgresUrlFromDraft(parsed);
      if (!targetUrl) return fail(ctx, 400, 'PostgreSQL connection is not configured');
      await loadSharedConfigFromDb?.();

      ctx.body = {
        ok: true,
        message: 'Shared config reloaded from PostgreSQL successfully',
      };
    } catch (error) {
      const details = String(error instanceof Error ? error.message : error);
      await logLine('ERROR', `Failed to load data from PostgreSQL: ${details}`);
      return fail(ctx, 500, 'Failed to load data from PostgreSQL', details);
    }
  });

  router.post('/api/admin/db/save-template-to-postgres', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/save-template-to-postgres'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-save-template-to-postgres', 10, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/save-template-to-postgres', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);

    try {
      const templateJson = typeof body.templateJson === 'string' ? body.templateJson : '';
      const ranksJson = typeof body.ranksJson === 'string' ? body.ranksJson : '';

      if (!templateJson || !ranksJson) return fail(ctx, 400, 'Missing templateJson or ranksJson');

      // Save template to PostgreSQL
      const templateResult = await runDbCommand(
        'psql',
        ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database],
        parsed,
        15_000,
        `INSERT INTO app_settings (key, value) VALUES ('shared_deck_template', '${templateJson.replace(/'/g, "''")}'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`
      );
      if (!templateResult.ok) return fail(ctx, 400, 'Failed to save template to PostgreSQL', (templateResult.stderr || templateResult.error || templateResult.stdout || '').trim());

      // Save ranks to PostgreSQL
      const ranksResult = await runDbCommand(
        'psql',
        ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database],
        parsed,
        15_000,
        `INSERT INTO app_settings (key, value) VALUES ('shared_ranks', '${ranksJson.replace(/'/g, "''")}'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`
      );
      if (!ranksResult.ok) return fail(ctx, 400, 'Failed to save ranks to PostgreSQL', (ranksResult.stderr || ranksResult.error || ranksResult.stdout || '').trim());

      // Update sync hash
      const combinedHash = Buffer.from(`${templateJson}:${ranksJson}`).toString('base64');
      const updateHashResult = await runDbCommand(
        'psql',
        ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database],
        parsed,
        15_000,
        `INSERT INTO app_settings (key, value) VALUES ('shared_config_sync_hash', '${combinedHash.replace(/'/g, "''")}'::text) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`
      );
      if (!updateHashResult.ok) return fail(ctx, 400, 'Failed to update sync hash', (updateHashResult.stderr || updateHashResult.error || updateHashResult.stdout || '').trim());

      // Reload runtime shared config from PostgreSQL
      await loadSharedConfigFromDb?.();

      // Sync to normalized tables (card_catalog, deck_template_entries)
      await syncJsonToPostgresIncremental?.(parsed);

      ctx.body = {
        ok: true,
        message: 'Data saved to PostgreSQL and normalized tables updated successfully',
      };
    } catch (error) {
      const details = String(error instanceof Error ? error.message : error);
      await logLine('ERROR', `Failed to save data to PostgreSQL: ${details}`);
      return fail(ctx, 500, 'Failed to save data to PostgreSQL', details);
    }
  });

  router.post('/api/admin/db/check-config-sync', async (ctx: RouteCtx) => {
    if (!(await requireAdminAuth(ctx, '/api/admin/db/check-config-sync'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-check-config-sync', 20, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/check-config-sync', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);

    const compareJson = body.compareJson !== false;
    const mismatches: string[] = [];
    try {
      const activeTemplateCountRaw = await runPsqlScalar(parsed, "SELECT count(*) FROM deck_templates WHERE is_active = true;");
      if (!activeTemplateCountRaw.ok) return fail(ctx, 400, 'Failed to read active deck template count', activeTemplateCountRaw.error);
      const activeRankSetCountRaw = await runPsqlScalar(parsed, "SELECT count(*) FROM rank_sets WHERE is_active = true;");
      if (!activeRankSetCountRaw.ok) return fail(ctx, 400, 'Failed to read active rank set count', activeRankSetCountRaw.error);
      const templateKeyRaw = await runPsqlScalar(parsed, "SELECT template_key FROM deck_templates WHERE is_active = true ORDER BY updated_at DESC LIMIT 1;");
      if (!templateKeyRaw.ok) return fail(ctx, 400, 'Failed to read active template key', templateKeyRaw.error);
      const rankSetKeyRaw = await runPsqlScalar(parsed, "SELECT rank_set_key FROM rank_sets WHERE is_active = true ORDER BY updated_at DESC LIMIT 1;");
      if (!rankSetKeyRaw.ok) return fail(ctx, 400, 'Failed to read active rank set key', rankSetKeyRaw.error);

      const dbDeckCountRaw = await runPsqlScalar(parsed, `
SELECT count(*)
FROM deck_template_entries e
JOIN deck_templates t ON t.id = e.deck_template_id
WHERE t.is_active = true AND e.deck_target = 'deck';`);
      if (!dbDeckCountRaw.ok) return fail(ctx, 400, 'Failed to read deck entry count', dbDeckCountRaw.error);
      const dbLegendaryCountRaw = await runPsqlScalar(parsed, `
SELECT count(*)
FROM deck_template_entries e
JOIN deck_templates t ON t.id = e.deck_template_id
WHERE t.is_active = true AND e.deck_target = 'legendaryDeck';`);
      if (!dbLegendaryCountRaw.ok) return fail(ctx, 400, 'Failed to read legendaryDeck entry count', dbLegendaryCountRaw.error);
      const dbRankTrackCountRaw = await runPsqlScalar(parsed, `
SELECT count(*)
FROM deck_template_entries e
JOIN deck_templates t ON t.id = e.deck_template_id
WHERE t.is_active = true AND e.deck_target = 'rankTrack';`);
      if (!dbRankTrackCountRaw.ok) return fail(ctx, 400, 'Failed to read rankTrack entry count', dbRankTrackCountRaw.error);
      const dbRankDefinitionsCountRaw = await runPsqlScalar(parsed, `
SELECT count(*)
FROM rank_definitions d
JOIN rank_sets r ON r.id = d.rank_set_id
WHERE r.is_active = true;`);
      if (!dbRankDefinitionsCountRaw.ok) return fail(ctx, 400, 'Failed to read rank definitions count', dbRankDefinitionsCountRaw.error);

      const activeTemplateCount = Number.parseInt(activeTemplateCountRaw.value, 10) || 0;
      const activeRankSetCount = Number.parseInt(activeRankSetCountRaw.value, 10) || 0;
      const dbDeckCount = Number.parseInt(dbDeckCountRaw.value, 10) || 0;
      const dbLegendaryCount = Number.parseInt(dbLegendaryCountRaw.value, 10) || 0;
      const dbRankTrackCount = Number.parseInt(dbRankTrackCountRaw.value, 10) || 0;
      const dbRankDefinitionsCount = Number.parseInt(dbRankDefinitionsCountRaw.value, 10) || 0;
      const templateKey = templateKeyRaw.value;
      const rankSetKey = rankSetKeyRaw.value;

      if (activeTemplateCount !== 1) {
        mismatches.push(`Expected exactly 1 active deck template, got ${activeTemplateCount}.`);
      }
      if (activeRankSetCount !== 1) {
        mismatches.push(`Expected exactly 1 active rank set, got ${activeRankSetCount}.`);
      }

      let jsonCounts: null | {
        deck: number;
        legendaryDeck: number;
        rankTrack: number;
        rankDefinitions: number;
      } = null;

      if (compareJson) {
        try {
          const templateDocRaw = await runPsqlScalar(
            parsed,
            "SELECT COALESCE(value::text, '{}') FROM app_settings WHERE key = 'shared_deck_template' LIMIT 1;",
          );
          if (!templateDocRaw.ok) return fail(ctx, 400, 'Failed to read shared_deck_template from app_settings', templateDocRaw.error);
          const ranksDocRaw = await runPsqlScalar(
            parsed,
            "SELECT COALESCE(value::text, '[]') FROM app_settings WHERE key = 'shared_ranks' LIMIT 1;",
          );
          if (!ranksDocRaw.ok) return fail(ctx, 400, 'Failed to read shared_ranks from app_settings', ranksDocRaw.error);

          const deckJson = JSON.parse(templateDocRaw.value) as {
            deck?: unknown[];
            legendaryDeck?: unknown[];
            rankTrack?: unknown[];
            deckIds?: unknown[];
            legendaryDeckIds?: unknown[];
            rankTrackIds?: unknown[];
          };
          const ranksJson = JSON.parse(ranksDocRaw.value) as unknown;
          const deckCount = Array.isArray(deckJson.deck) ? deckJson.deck.length : (Array.isArray(deckJson.deckIds) ? deckJson.deckIds.length : 0);
          const legendaryDeckCount = Array.isArray(deckJson.legendaryDeck)
            ? deckJson.legendaryDeck.length
            : (Array.isArray(deckJson.legendaryDeckIds) ? deckJson.legendaryDeckIds.length : 0);
          const rankTrackCount = Array.isArray(deckJson.rankTrack)
            ? deckJson.rankTrack.length
            : (Array.isArray(deckJson.rankTrackIds) ? deckJson.rankTrackIds.length : 0);
          const rankDefinitionsCount = Array.isArray(ranksJson)
            ? ranksJson.length
            : (ranksJson && typeof ranksJson === 'object' && Array.isArray((ranksJson as { ranks?: unknown[] }).ranks)
              ? ((ranksJson as { ranks: unknown[] }).ranks.length)
              : 0);

          jsonCounts = {
            deck: deckCount,
            legendaryDeck: legendaryDeckCount,
            rankTrack: rankTrackCount,
            rankDefinitions: rankDefinitionsCount,
          };

          if (dbDeckCount !== deckCount) mismatches.push(`deck count mismatch: db=${dbDeckCount} app_settings=${deckCount}`);
          if (dbLegendaryCount !== legendaryDeckCount) mismatches.push(`legendaryDeck count mismatch: db=${dbLegendaryCount} app_settings=${legendaryDeckCount}`);
          if (dbRankTrackCount !== rankTrackCount) mismatches.push(`rankTrack count mismatch: db=${dbRankTrackCount} app_settings=${rankTrackCount}`);
          if (dbRankDefinitionsCount !== rankDefinitionsCount) mismatches.push(`rank definitions mismatch: db=${dbRankDefinitionsCount} app_settings=${rankDefinitionsCount}`);
        } catch (error) {
          mismatches.push(`Failed to compare with app_settings mirror: ${String(error instanceof Error ? error.message : error)}`);
        }
      }

      const ok = mismatches.length === 0;
      ctx.body = {
        ok,
        message: ok ? 'Shared config sync check passed.' : 'Shared config sync check failed.',
        details: {
          activeTemplateKey: templateKey,
          activeRankSetKey: rankSetKey,
          dbCounts: {
            deck: dbDeckCount,
            legendaryDeck: dbLegendaryCount,
            rankTrack: dbRankTrackCount,
            rankDefinitions: dbRankDefinitionsCount,
          },
          jsonCounts,
          compareJson,
          mismatches,
        },
      };
    } catch (error) {
      fail(ctx, 500, 'Failed to run shared config sync check', String(error instanceof Error ? error.message : error));
    }
  });

  router.post('/api/admin/db/export-backup', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/export-backup'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-export-backup', 5, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/export-backup', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);
    if (prepareBackupSnapshot) {
      try {
        await prepareBackupSnapshot();
      } catch (error) {
        return fail(ctx, 500, 'Failed to prepare database backup snapshot', String(error instanceof Error ? error.message : error));
      }
    }

    const result = await runDbCommand(
      'pg_dump',
      ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database, '--no-owner', '--no-privileges', '--inserts'],
      parsed,
      30_000,
    );
    if (!(result.ok && result.stdout.trim().length > 0)) {
      return fail(ctx, 400, 'Failed to export PostgreSQL backup', (result.stderr || result.error || result.stdout || '').trim());
    }
    const assetBundle = backupRootDir ? await buildBackupAssetBundle(backupRootDir, backupAssetDirs) : null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ctx.body = {
      ok: true,
      filename: `joj-backup-${parsed.database}-${stamp}.sql`,
      content: appendAssetBundleToSql(result.stdout, assetBundle),
      assetCount: assetBundle?.files.length ?? 0,
    };
  });

  router.post('/api/admin/db/restore-backup', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/restore-backup'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-restore-backup', 3, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/restore-backup', maxBytes: ADMIN_DB_SQL_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);
    const sql = typeof body.sql === 'string' ? body.sql : '';
    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    if (!sql.trim()) return fail(ctx, 400, 'Missing SQL content for restore');
    const parsedBackup = extractAssetBundleFromSql(sql);

    const result = await runDbCommand(
      'psql',
      ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database, '-v', 'ON_ERROR_STOP=1'],
      parsed,
      180_000,
      parsedBackup.sql,
    );
    if (!result.ok) return fail(ctx, 400, 'Failed to restore PostgreSQL backup', (result.stderr || result.error || result.stdout || '').trim());
    const restoredAssetCount = backupRootDir ? await restoreBackupAssetBundle(backupRootDir, parsedBackup.bundle) : 0;
    ctx.body = {
      ok: true,
      message: `Backup restored successfully${filename ? ` (${filename})` : ''}`,
      restoredAssetCount,
    };
  });

  router.post('/api/admin/db/sync-migrations', async (ctx: RouteCtx) => {
    if (!(await requireAdminWriteAccess(ctx, '/api/admin/db/sync-migrations'))) return;
    if (!(await enforceRateLimit(ctx, 'admin-db-sync-migrations', 5, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/sync-migrations', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    try {
      const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
      if ('error' in parsed) return fail(ctx, 400, parsed.error);

      // Ensure schema_migrations table exists
      await runDbCommand(
        'psql',
        ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database],
        parsed,
        15_000,
        `CREATE TABLE IF NOT EXISTS schema_migrations (migration_name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW());`,
      );

      // Get already applied migrations
      const appliedResult = await runDbCommand(
        'psql',
        ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database, '-tA', '-c', 'SELECT migration_name FROM schema_migrations ORDER BY migration_name;'],
        parsed,
        15_000,
      );
      const appliedMigrationsSet = new Set(
        appliedResult.ok ? appliedResult.stdout.split('\n').filter(Boolean) : []
      );

      const migrationsDir = migrationsPath;
      const migrationFiles = await readdir(migrationsDir);
      const sqlFiles = migrationFiles
        .filter((f) => f.endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b));

      const newlyAppliedMigrations: string[] = [];
      const skippedMigrations: string[] = [];
      const errors: string[] = [];

      for (const file of sqlFiles) {
        if (appliedMigrationsSet.has(file)) {
          skippedMigrations.push(file);
          continue;
        }

        const filePath = path.join(migrationsDir, file);
        const sql = await readFile(filePath, 'utf-8');

        const result = await runDbCommand(
          'psql',
          ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database, '-v', 'ON_ERROR_STOP=1'],
          parsed,
          30_000,
          sql,
        );

        if (result.ok) {
          // Record migration as applied
          const escapedFile = file.replace(/'/g, "''");
          await runDbCommand(
            'psql',
            ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database, '-c', `INSERT INTO schema_migrations (migration_name) VALUES ('${escapedFile}') ON CONFLICT (migration_name) DO NOTHING;`],
            parsed,
            15_000,
          );
          newlyAppliedMigrations.push(file);
        } else {
          errors.push(`${file}: ${result.stderr || result.error || result.stdout || ''}`);
        }
      }

      if (errors.length > 0) {
        return fail(ctx, 500, 'Some migrations failed', errors.join('; '));
      }

      ctx.body = {
        ok: true,
        message: newlyAppliedMigrations.length > 0
          ? `Successfully applied ${newlyAppliedMigrations.length} new migration${newlyAppliedMigrations.length === 1 ? '' : 's'}`
          : 'No new migrations to apply',
        newlyAppliedMigrations,
        skippedMigrations,
      };
    } catch (error) {
      const details = String(error instanceof Error ? error.message : error);
      await logLine('ERROR', `Failed to sync migrations: ${details}`);
      return fail(ctx, 500, 'Failed to sync migrations', details);
    }
  });
};

export { parseDbConnInput };
