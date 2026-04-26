import net from 'node:net';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from './env';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
export const appRootDir = path.resolve(serverDir, '..');
const parseCsvEnv = (value: string | undefined, fallback: string[]) => {
  const items = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(items.length > 0 ? items : fallback));
};

export const logsPath = path.resolve(appRootDir, 'logs', 'server.log');
export const envPath = path.resolve(appRootDir, '.env');
export const uploadsDir = path.resolve(appRootDir, 'public', 'card-assets');
export const repoDir = appRootDir;
export const devRestartTouchPath = path.resolve(appRootDir, 'server', 'restart.touch');
export const dbSchemaPath = path.resolve(appRootDir, 'db', 'schema', 'db.sql');
export const dbMigrationsDir = path.resolve(appRootDir, 'db', 'migrations');
export const adminDbUiConfigPath = path.resolve(appRootDir, 'database', 'admin-db-ui-config.json');
export const passwordResetHealthPath = path.resolve(appRootDir, 'database', 'password-reset-health.json');
export const bugReportUiConfigPath = path.resolve(appRootDir, 'database', 'bug-report-ui-config.json');
export const gameUiConfigPath = path.resolve(appRootDir, 'database', 'game-ui-config.json');

export const JSON_BODY_LIMIT = 2 * 1024 * 1024;
export const LARGE_JSON_BODY_LIMIT = 8 * 1024 * 1024;
export const IMAGE_UPLOAD_BODY_LIMIT = 16 * 1024 * 1024;

// Check if .env file exists before loading
if (!existsSync(envPath)) {
  console.warn(`[bootstrap-config] .env file not found at ${envPath}. Using default environment variables.`);
}

loadEnvFile(envPath);

export const isAdminAuthEnabled = true;
export const sharedConfigPrimarySource = 'postgres' as const;
export const requestedSharedConfigStorageMode = sharedConfigPrimarySource;
export const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
export const nodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();
export const matchDbCutoverMode = 'auto' as const;
export const port = Number(process.env.PORT ?? 8000);

// Validate critical environment variables
if (port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${port}. Must be between 1 and 65535.`);
}

if (nodeEnv && !['development', 'production', 'test'].includes(nodeEnv)) {
  throw new Error(`Invalid NODE_ENV: ${nodeEnv}. Must be 'development', 'production', or 'test'.`);
}

export const allowedFrontendOrigins = parseCsvEnv(process.env.FRONTEND_ORIGIN, [
  process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);
export const corsAllowedMethods = parseCsvEnv(process.env.CORS_ALLOWED_METHODS, [
  'GET',
  'HEAD',
  'PUT',
  'POST',
  'DELETE',
  'PATCH',
  'OPTIONS',
]);
export const corsAllowedHeaders = parseCsvEnv(process.env.CORS_ALLOWED_HEADERS, [
  'content-type',
  'x-csrf-token',
  'authorization',
]);
export const cspConnectSrcExtras = parseCsvEnv(process.env.CSP_CONNECT_SRC_EXTRA, []);
export const cspScriptSrc = parseCsvEnv(process.env.CSP_SCRIPT_SRC, ["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
export const cspStyleSrc = parseCsvEnv(process.env.CSP_STYLE_SRC, ["'self'", "'unsafe-inline'"]);
export const cspImgSrc = parseCsvEnv(process.env.CSP_IMG_SRC, ["'self'", 'data:', 'blob:']);
export const cspFontSrc = parseCsvEnv(process.env.CSP_FONT_SRC, ["'self'"]);

export const hasPsqlCli = () => {
  const probe = spawnSync('psql', ['--version'], { stdio: 'ignore', windowsHide: true });
  return !probe.error;
};

export const isPortAvailable = (targetPort: number) => new Promise<boolean>((resolve) => {
  const probe = net.createServer();
  probe.once('error', () => resolve(false));
  probe.once('listening', () => {
    probe.close(() => resolve(true));
  });
  probe.listen(targetPort);
});
