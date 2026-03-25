import net from 'node:net';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
export const appRootDir = path.resolve(serverDir, '..');

export const logsPath = path.resolve(appRootDir, 'logs', 'server.log');
export const matchesDbDir = path.resolve(appRootDir, 'database', 'matches');
export const envPath = path.resolve(appRootDir, '.env');
export const templatePath = path.resolve(appRootDir, 'database', 'shared-deck-template.json');
export const ranksPath = path.resolve(appRootDir, 'database', 'shared-ranks.json');
export const uploadsDir = path.resolve(appRootDir, 'public', 'cards');
export const repoDir = appRootDir;
export const devRestartTouchPath = path.resolve(appRootDir, 'server', 'restart.touch');
export const dbSchemaPath = path.resolve(appRootDir, 'db', 'schema', 'db.sql');
export const dbMigrationsDir = path.resolve(appRootDir, 'db', 'migrations');
export const adminDbUiConfigPath = path.resolve(appRootDir, 'database', 'admin-db-ui-config.json');

export const JSON_BODY_LIMIT = 2 * 1024 * 1024;
export const LARGE_JSON_BODY_LIMIT = 8 * 1024 * 1024;
export const IMAGE_UPLOAD_BODY_LIMIT = 16 * 1024 * 1024;

loadEnvFile(envPath);

export const adminToken = (process.env.ADMIN_TOKEN ?? '').trim();
export const isAdminAuthEnabled = adminToken.length > 0;
const storageModeEnv = (process.env.STORAGE_MODE ?? 'file').trim().toLowerCase();
export const requestedSharedConfigStorageMode = (storageModeEnv === 'postgres' || storageModeEnv === 'db') ? 'postgres' : 'file';
export const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
export const nodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();
export const allowInMemoryUserStore = /^(1|true|yes)$/i.test((process.env.ALLOW_IN_MEMORY_USER_STORE ?? '').trim());
export const port = Number(process.env.PORT ?? 8000);

export const allowedFrontendOrigins = Array.from(new Set([
  process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]));

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
