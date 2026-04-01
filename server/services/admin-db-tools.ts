import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Pool } from 'pg';
import { requireAdminMutationAuth } from '../admin-auth';
import { loadAppSettingJson, saveAppSettingJson } from './app-settings-store';
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
  importJsonConfigToDb: (draft?: DbConnInput) => Promise<void>;
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
  adminDbUiConfigPath: string,
  pool?: Pool | null,
): Promise<StoredAdminDbUiConfig | null> => {
  const stored = await loadAppSettingJson<StoredAdminDbUiConfig>(pool, ADMIN_DB_UI_CONFIG_KEY);
  if (stored) return stored;
  try {
    const raw = await readFile(adminDbUiConfigPath, 'utf8');
    const parsed = JSON.parse(raw) as StoredAdminDbUiConfig;
    if (!(parsed && typeof parsed === 'object')) return null;
    if (pool) {
      await saveAppSettingJson(pool, ADMIN_DB_UI_CONFIG_KEY, parsed, 'migration-admin-db-ui');
    }
    return parsed;
  } catch {
    return null;
  }
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
  importJsonConfigToDb,
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
      await mkdir(new URL('.', `file://${adminDbUiConfigPath.replace(/\\/g, '/')}`).pathname, { recursive: true }).catch(() => {});
    } catch { /* noop */ }
    try {
      const storedPayload = {
        storageMode: 'db',
        dbConfig: normalizedDbConfig,
        updatedAt: Date.now(),
      };
      if (pool) {
        await saveAppSettingJson(pool, ADMIN_DB_UI_CONFIG_KEY, storedPayload, 'admin-db-ui');
      } else {
        const dir = adminDbUiConfigPath.replace(/[\\/][^\\/]+$/, '');
        await mkdir(dir, { recursive: true });
        await writeFile(
          adminDbUiConfigPath,
          JSON.stringify(storedPayload, null, 2),
          'utf8',
        );
      }
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
    if (!(await enforceRateLimit(ctx, 'admin-db-import-json-config', 5, 60_000))) return;
    const body = await readJsonBodySafe({ ctx, routeLabel: '/api/admin/db/import-json-config', maxBytes: JSON_BODY_LIMIT, logLine });
    if (!body) return;
    const parsed = await buildDbConnInputForExecution(body, adminDbUiConfigPath, pool);
    if ('error' in parsed) return fail(ctx, 400, parsed.error);
    try {
      await importJsonConfigToDb(parsed);
      await logLine('INFO', 'admin imported shared JSON config into postgres');
      ctx.body = { ok: true, message: 'Shared JSON config imported into database' };
    } catch (error) {
      fail(ctx, 400, 'Failed to import shared JSON config into database', String(error));
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
      ['-h', parsed.host, '-p', parsed.port, '-U', parsed.user, '-d', parsed.database, '--no-owner', '--no-privileges'],
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
};

export { parseDbConnInput };
