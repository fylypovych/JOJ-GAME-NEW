const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseVersionFromCommitMessage } = require('./version-from-commit.cjs');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageLockPath = path.join(repoRoot, 'package-lock.json');

const readJson = (targetPath) => JSON.parse(fs.readFileSync(targetPath, 'utf8'));
const writeJson = (targetPath, value) => {
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
};
const runGit = (args) => execFileSync('git', args, {
  cwd: repoRoot,
  encoding: 'utf8',
  windowsHide: true,
});

const updateVersionFields = (targetPath, version, mutator) => {
  if (!fs.existsSync(targetPath)) return false;
  const current = readJson(targetPath);
  const changed = mutator(current, version);
  if (!changed) return false;
  writeJson(targetPath, current);
  return true;
};

const syncVersionInPackageJson = (version) => updateVersionFields(packageJsonPath, version, (pkg, nextVersion) => {
  if (pkg.version === nextVersion) return false;
  pkg.version = nextVersion;
  return true;
});

const syncVersionInPackageLock = (version) => updateVersionFields(packageLockPath, version, (lock, nextVersion) => {
  let changed = false;
  if (lock.version !== nextVersion) {
    lock.version = nextVersion;
    changed = true;
  }
  if (lock.packages && lock.packages[''] && lock.packages[''].version !== nextVersion) {
    lock.packages[''].version = nextVersion;
    changed = true;
  }
  return changed;
});

const getGitChangedFiles = (args) => runGit(args)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const readJsonFromGitIndex = (repoPath) => {
  try {
    return JSON.parse(runGit(['show', `:${repoPath}`]));
  } catch {
    return null;
  }
};

const readPackageVersion = (targetPath) => {
  if (!fs.existsSync(targetPath)) return '';
  const payload = readJson(targetPath);
  if (targetPath === packageLockPath) {
    const rootVersion = typeof payload.version === 'string' ? payload.version : '';
    const packageVersion = typeof payload?.packages?.['']?.version === 'string' ? payload.packages[''].version : '';
    return rootVersion && packageVersion && rootVersion === packageVersion ? rootVersion : '';
  }
  return typeof payload.version === 'string' ? payload.version : '';
};

const readIndexedPackageVersion = (repoPath) => {
  const payload = readJsonFromGitIndex(repoPath);
  if (!payload || typeof payload !== 'object') return '';
  if (repoPath === 'package-lock.json') {
    const rootVersion = typeof payload.version === 'string' ? payload.version : '';
    const packageVersion = typeof payload?.packages?.['']?.version === 'string' ? payload.packages[''].version : '';
    return rootVersion && packageVersion && rootVersion === packageVersion ? rootVersion : '';
  }
  return typeof payload.version === 'string' ? payload.version : '';
};

const getConflictingVersionFiles = () => {
  const trackedFiles = ['package.json', 'package-lock.json'];
  const unstaged = new Set(getGitChangedFiles(['diff', '--name-only', '--', ...trackedFiles]));
  return trackedFiles.filter((file) => unstaged.has(file));
};

const getConflictAbortText = (files, version) => [
  `[version-sync] aborted: ${files.join(', ')} contain unstaged changes.`,
  `[version-sync] set version ${version} in those files manually, then retry the commit.`,
];

const stageFiles = (files) => {
  const existingFiles = files.filter((targetPath) => fs.existsSync(targetPath));
  if (existingFiles.length === 0) return;
  runGit(['add', ...existingFiles]);
};

const getVersionInputArg = () => process.argv.slice(2).join(' ').trim();

const resolveVersionFromInput = () => {
  const candidate = getVersionInputArg();
  if (!candidate) return '';
  const resolvedPath = path.resolve(process.cwd(), candidate);
  if (fs.existsSync(resolvedPath)) {
    return parseVersionFromCommitMessage(fs.readFileSync(resolvedPath, 'utf8'));
  }
  return parseVersionFromCommitMessage(candidate);
};

const main = () => {
  const version = resolveVersionFromInput();
  if (!version) return 0;

  const conflictingFiles = getConflictingVersionFiles();
  if (conflictingFiles.length > 0) {
    const matchingVersions = [
      readIndexedPackageVersion('package.json') || readPackageVersion(packageJsonPath),
      readIndexedPackageVersion('package-lock.json') || readPackageVersion(packageLockPath),
    ].every((currentVersion) => currentVersion === version);
    if (matchingVersions) {
      return 0;
    }
    for (const line of getConflictAbortText(conflictingFiles, version)) {
      process.stderr.write(`${line}\n`);
    }
    return 1;
  }

  const changedFiles = [];
  if (syncVersionInPackageJson(version)) changedFiles.push(packageJsonPath);
  if (syncVersionInPackageLock(version)) changedFiles.push(packageLockPath);
  if (changedFiles.length === 0) return 0;

  stageFiles(changedFiles);
  process.stdout.write(`[version-sync] synced version ${version}\n`);
  return 0;
};

module.exports = {
  getConflictAbortText,
  readPackageVersion,
  readIndexedPackageVersion,
  resolveVersionFromInput,
};

if (require.main === module) {
  process.exitCode = main();
}
