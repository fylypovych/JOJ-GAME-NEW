import { execFile, spawn } from 'node:child_process';
import type { Pool } from 'pg';
import type { LogLine } from './file-logger';

type CmdResult = { ok: true; stdout: string; stderr: string } | { ok: false; error: string };
type GitPorcelainEntry = { xy: string; path: string };
type GitAuthStatus = {
  helper: string;
  helperConfigured: boolean;
  hasGithubCredentials: boolean;
  savedUsername: string;
  credentialsPath: string;
  remoteAuthMode: 'https' | 'ssh' | 'other';
};
type StoredGitCredentials = { username: string; token: string };
type GitCredentialStore = {
  load: () => Promise<StoredGitCredentials | null>;
  save: (credentials: StoredGitCredentials) => Promise<void>;
  clear: () => Promise<void>;
  getCredentialsPath: () => string;
};

const formatCommandFailure = (command: string, args: string[], error: unknown, stdout: string, stderr: string) => {
  const err = error as { message?: string; code?: string | number };
  const parts = [`$ ${command} ${args.join(' ')}`];
  if (err?.message) parts.push(`message: ${String(err.message)}`);
  if (err?.code !== undefined) parts.push(`code: ${String(err.code)}`);
  if (stdout.trim()) parts.push(`stdout:\n${stdout.trim()}`);
  if (stderr.trim()) parts.push(`stderr:\n${stderr.trim()}`);
  if (String(err?.code ?? '') === 'ENOENT') parts.push('hint: executable not found in PATH of the server process');
  return parts.join('\n');
};

const normalizeGitCredential = (value: string) => String(value ?? '').trim();

const buildGitProcessEnv = (credentials: StoredGitCredentials | null) => {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  } as NodeJS.ProcessEnv;
  if (!credentials) return env;
  const username = normalizeGitCredential(credentials.username);
  const token = normalizeGitCredential(credentials.token);
  if (!username || !token) return env;
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = `url.https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@github.com/.insteadof`;
  env.GIT_CONFIG_VALUE_0 = 'https://github.com/';
  return env;
};

export const createGitCredentialStore = (
  args: {
    getPool: () => Pool | null | undefined;
    settingKey?: string;
  },
): GitCredentialStore => {
  const { getPool, settingKey = 'admin_git_credentials' } = args;
  const credentialsPath = `app_settings:${settingKey}`;
  return {
    load: async () => {
      const pool = getPool();
      if (!pool) return null;
      try {
        const result = await pool.query<{ value: unknown }>(
          'SELECT value FROM app_settings WHERE key = $1 LIMIT 1',
          [settingKey],
        );
        const payload = (result.rows[0]?.value ?? null) as Partial<StoredGitCredentials> | null;
        if (!payload || typeof payload !== 'object') return null;
        const username = normalizeGitCredential(payload.username ?? '');
        const token = normalizeGitCredential(payload.token ?? '');
        if (!username || !token) return null;
        return { username, token };
      } catch {
        return null;
      }
    },
    save: async (credentials) => {
      const pool = getPool();
      if (!pool) throw new Error('PostgreSQL pool is required for Git credentials.');
      const username = normalizeGitCredential(credentials.username);
      const token = normalizeGitCredential(credentials.token);
      if (!username || !token) throw new Error('GitHub username and token are required.');
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_by)
         VALUES ($1, $2::jsonb, 'admin-git')
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [settingKey, JSON.stringify({ username, token })],
      );
    },
    clear: async () => {
      const pool = getPool();
      if (!pool) return;
      await pool.query('DELETE FROM app_settings WHERE key = $1', [settingKey]);
    },
    getCredentialsPath: () => credentialsPath,
  };
};

const resolveGithubCredentials = async (gitCredentialStore?: GitCredentialStore | null) => {
  const envToken = normalizeGitCredential(String(process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? ''));
  const envUsername = normalizeGitCredential(String(process.env.GITHUB_USER ?? process.env.GH_USER ?? ''));
  if (envToken && envUsername) return { credentials: { username: envUsername, token: envToken }, source: 'env' as const };
  const stored = await gitCredentialStore?.load();
  if (stored) return { credentials: stored, source: 'stored' as const };
  return { credentials: null, source: 'none' as const };
};

export const createCommandRunners = (repoDir: string, gitCredentialStore?: GitCredentialStore | null) => {
  const runGit = async (args: string[]): Promise<CmdResult> => {
    const { credentials } = await resolveGithubCredentials(gitCredentialStore);
    return new Promise((resolve) => {
      execFile('git', args, { cwd: repoDir, env: buildGitProcessEnv(credentials), windowsHide: true, timeout: 30_000 }, (error, stdout, stderr) => {
        if (error) return resolve({ ok: false, error: formatCommandFailure('git', args, error, String(stdout ?? ''), String(stderr ?? '')) });
        return resolve({ ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      });
    });
  };

  const runShellCommand = async (command: string, timeoutMs = 15 * 60_000): Promise<CmdResult> => new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const file = isWin ? 'cmd.exe' : 'sh';
    const args = isWin ? ['/d', '/s', '/c', command] : ['-lc', command];
    execFile(file, args, { cwd: repoDir, windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, error: formatCommandFailure(file, args, error, String(stdout ?? ''), String(stderr ?? '')) });
      return resolve({ ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });

  const spawnDetachedShell = (command: string) => {
    const isWin = process.platform === 'win32';
    const file = isWin ? 'cmd.exe' : 'sh';
    const args = isWin ? ['/d', '/s', '/c', command] : ['-lc', command];
    const child = spawn(file, args, { cwd: repoDir, windowsHide: true, detached: true, stdio: 'ignore' });
    child.unref();
  };

  return { runGit, runShellCommand, spawnDetachedShell };
};

const runtimeGitIgnorePatterns = [/^logs\/.*\.log$/i, /^database\/matches(\/|$)/i, /^caddy-local-root\.crt$/i];
const isRuntimeGitNoise = (filePath: string): boolean => runtimeGitIgnorePatterns.some((p) => p.test(filePath.replace(/\\/g, '/')));
const parseGitPorcelain = (stdout: string): GitPorcelainEntry[] => stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean).map((line) => {
  const xy = line.slice(0, 2);
  let rest = line.slice(3).trim();
  if (rest.includes(' -> ')) rest = rest.split(' -> ').pop() ?? rest;
  return { xy, path: rest };
});

export const autoStashRuntimeNoise = async ({ status, runGit, logLine }: { status: { ignoredRuntimeDirtyFiles?: string[] }; runGit: (args: string[]) => Promise<CmdResult>; logLine: LogLine; }) => {
  if (!Array.isArray(status.ignoredRuntimeDirtyFiles) || status.ignoredRuntimeDirtyFiles.length === 0) return { ok: true as const };
  const stashRes = await runGit(['stash', 'push', '-u', '-m', 'admin-auto-stash-runtime']);
  if (!stashRes.ok) return { ok: false as const, error: stashRes.error };
  await logLine('INFO', `git runtime auto-stash created (${status.ignoredRuntimeDirtyFiles.length} files)`);
  return { ok: true as const };
};

export const getGitUpdateStatus = async (runGit: (args: string[]) => Promise<CmdResult>) => {
  const branchRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branchRes.ok) return { ok: false as const, error: branchRes.error };
  const branch = branchRes.stdout.trim();
  const remoteRes = await runGit(['remote', 'get-url', 'origin']);
  const remote = remoteRes.ok ? remoteRes.stdout.trim() : '';
  const fetchRes = await runGit(['fetch', '--prune', 'origin']);
  if (!fetchRes.ok) return { ok: false as const, error: fetchRes.error };
  const statusRes = await runGit(['status', '--porcelain', '--untracked-files=all']);
  if (!statusRes.ok) return { ok: false as const, error: statusRes.error };
  const statusEntries = parseGitPorcelain(statusRes.stdout);
  const meaningfulDirtyEntries = statusEntries.filter((row) => !isRuntimeGitNoise(row.path));
  const runtimeOnlyDirtyEntries = statusEntries.filter((row) => isRuntimeGitNoise(row.path));
  const dirty = meaningfulDirtyEntries.length > 0;
  const headRes = await runGit(['rev-parse', 'HEAD']);
  if (!headRes.ok) return { ok: false as const, error: headRes.error };
  const head = headRes.stdout.trim();
  const upstreamRes = await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!upstreamRes.ok) {
    return { ok: true as const, branch, remote, upstream: '', ahead: 0, behind: 0, dirty, dirtyFiles: meaningfulDirtyEntries.map((r) => r.path), ignoredRuntimeDirtyFiles: runtimeOnlyDirtyEntries.map((r) => r.path), canUpdate: false, head, note: 'No upstream branch configured' };
  }
  const upstream = upstreamRes.stdout.trim();
  const countsRes = await runGit(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
  if (!countsRes.ok) return { ok: false as const, error: countsRes.error };
  const [aheadStr, behindStr] = countsRes.stdout.trim().split(/\s+/);
  const ahead = Number(aheadStr || 0);
  const behind = Number(behindStr || 0);
  return { ok: true as const, branch, remote, upstream, ahead: Number.isFinite(ahead) ? ahead : 0, behind: Number.isFinite(behind) ? behind : 0, dirty, dirtyFiles: meaningfulDirtyEntries.map((r) => r.path), ignoredRuntimeDirtyFiles: runtimeOnlyDirtyEntries.map((r) => r.path), canUpdate: !dirty && (Number.isFinite(behind) ? behind : 0) > 0, head, note: dirty ? 'Working tree has local changes' : undefined };
};

const detectRemoteAuthMode = (remote: string): GitAuthStatus['remoteAuthMode'] => {
  if (/^https:\/\//i.test(remote)) return 'https';
  if (/^(ssh:\/\/|git@)/i.test(remote)) return 'ssh';
  return 'other';
};

export const getGitAuthStatus = async (
  runGit: (args: string[]) => Promise<CmdResult>,
  gitCredentialStore?: GitCredentialStore | null,
): Promise<GitAuthStatus> => {
  const helperRes = await runGit(['config', '--global', '--get', 'credential.helper']);
  const remoteRes = await runGit(['remote', 'get-url', 'origin']);
  const helper = helperRes.ok ? helperRes.stdout.trim() : '';
  const remoteAuthMode = detectRemoteAuthMode(remoteRes.ok ? remoteRes.stdout.trim() : '');
  const { credentials, source } = await resolveGithubCredentials(gitCredentialStore);
  
  // Спробуємо виконати git ls-remote для перевірки доступу до remote
  let canAccessRemote = false;
  if (remoteRes.ok && remoteRes.stdout.trim()) {
    try {
      const lsRemoteRes = await runGit(['ls-remote', '--heads', 'origin']);
      canAccessRemote = lsRemoteRes.ok;
    } catch {
      canAccessRemote = false;
    }
  }
  
  return {
    helper,
    helperConfigured: Boolean(helper) && helper !== 'store',
    hasGithubCredentials: Boolean(credentials) || remoteAuthMode === 'ssh' || canAccessRemote,
    savedUsername: credentials?.username ?? '',
    credentialsPath: source === 'stored' ? gitCredentialStore?.getCredentialsPath() ?? '' : '',
    remoteAuthMode,
  };
};
