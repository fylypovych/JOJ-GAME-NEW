import { execFile, spawn } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

export const createCommandRunners = (repoDir: string) => {
  const runGit = async (args: string[]): Promise<CmdResult> => new Promise((resolve) => {
    execFile('git', args, { cwd: repoDir, windowsHide: true, timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, error: formatCommandFailure('git', args, error, String(stdout ?? ''), String(stderr ?? '')) });
      return resolve({ ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });

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

const getCredentialsPath = () => path.join(os.homedir(), '.git-credentials');

const parseGithubCredentialEntry = (line: string): { username: string } | null => {
  try {
    const parsed = new URL(line.trim());
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return null;
    return { username: decodeURIComponent(parsed.username || '') };
  } catch {
    return null;
  }
};

const detectRemoteAuthMode = (remote: string): GitAuthStatus['remoteAuthMode'] => {
  if (/^https:\/\//i.test(remote)) return 'https';
  if (/^(ssh:\/\/|git@)/i.test(remote)) return 'ssh';
  return 'other';
};

export const getGitAuthStatus = async (runGit: (args: string[]) => Promise<CmdResult>): Promise<GitAuthStatus> => {
  const helperRes = await runGit(['config', '--global', '--get', 'credential.helper']);
  const remoteRes = await runGit(['remote', 'get-url', 'origin']);
  const credentialsPath = getCredentialsPath();
  let fileContents = '';
  try {
    fileContents = await readFile(credentialsPath, 'utf8');
  } catch {
    fileContents = '';
  }
  const githubEntry = fileContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseGithubCredentialEntry)
    .find(Boolean) ?? null;
  const helper = helperRes.ok ? helperRes.stdout.trim() : '';
  return {
    helper,
    helperConfigured: helper === 'store',
    hasGithubCredentials: Boolean(githubEntry),
    savedUsername: githubEntry?.username ?? '',
    credentialsPath,
    remoteAuthMode: detectRemoteAuthMode(remoteRes.ok ? remoteRes.stdout.trim() : ''),
  };
};

export const saveGithubHttpsCredentials = async (args: {
  runGit: (input: string[]) => Promise<CmdResult>;
  username: string;
  token: string;
}) => {
  const username = args.username.trim();
  const token = args.token.trim();
  if (!username) return { ok: false as const, error: 'Missing GitHub username.' };
  if (!token) return { ok: false as const, error: 'Missing GitHub token.' };
  const helperRes = await args.runGit(['config', '--global', 'credential.helper', 'store']);
  if (!helperRes.ok) return { ok: false as const, error: helperRes.error };
  const credentialsPath = getCredentialsPath();
  let existingLines: string[] = [];
  try {
    existingLines = (await readFile(credentialsPath, 'utf8')).split(/\r?\n/);
  } catch {
    existingLines = [];
  }
  const preservedLines = existingLines.filter((line) => !parseGithubCredentialEntry(line));
  preservedLines.push(`https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@github.com`);
  await writeFile(credentialsPath, `${preservedLines.filter(Boolean).join('\n')}\n`, 'utf8');
  try {
    await chmod(credentialsPath, 0o600);
  } catch {
    // Best effort only; some platforms may not support POSIX file modes.
  }
  return { ok: true as const };
};

export const clearGithubHttpsCredentials = async () => {
  const credentialsPath = getCredentialsPath();
  let existingLines: string[] = [];
  try {
    existingLines = (await readFile(credentialsPath, 'utf8')).split(/\r?\n/);
  } catch {
    existingLines = [];
  }
  const nextLines = existingLines.filter((line) => !parseGithubCredentialEntry(line)).filter(Boolean);
  await writeFile(credentialsPath, nextLines.length > 0 ? `${nextLines.join('\n')}\n` : '', 'utf8');
  try {
    await chmod(credentialsPath, 0o600);
  } catch {
    // Best effort only; some platforms may not support POSIX file modes.
  }
  return { ok: true as const };
};

