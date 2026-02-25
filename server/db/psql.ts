import { spawn } from 'node:child_process';

export type PostgresConnDraft = {
  host: string;
  port: string;
  database: string;
  user: string;
  password?: string;
  sslMode?: 'disable' | 'require';
};

export const buildPostgresUrlFromDraft = (draft: PostgresConnDraft) => {
  const protocol = 'postgresql://';
  const user = encodeURIComponent(draft.user.trim());
  const password = draft.password ? `:${encodeURIComponent(draft.password)}` : '';
  const host = draft.host.trim();
  const port = draft.port.trim();
  const database = encodeURIComponent(draft.database.trim());
  const sslMode = draft.sslMode === 'require' ? 'require' : 'disable';
  return `${protocol}${user}${password}@${host}:${port}/${database}?sslmode=${sslMode}`;
};

export const runPsqlSql = async (
  databaseUrl: string,
  sql: string,
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> => (
  new Promise((resolve) => {
    const child = spawn('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => resolve({ ok: false, error: String(error) }));
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, stdout });
      else resolve({ ok: false, error: (stderr || stdout || `psql exit code ${code}`).trim() });
    });
  })
);

