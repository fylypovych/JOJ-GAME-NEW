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

const stageFiles = (files) => {
  const existingFiles = files.filter((targetPath) => fs.existsSync(targetPath));
  if (existingFiles.length === 0) return;
  execFileSync('git', ['add', ...existingFiles], {
    cwd: repoRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
};

const getCommitMessagePath = () => {
  const candidate = process.argv[2];
  return candidate ? path.resolve(process.cwd(), candidate) : '';
};

const main = () => {
  const commitMessagePath = getCommitMessagePath();
  if (!commitMessagePath || !fs.existsSync(commitMessagePath)) return 0;

  const commitMessage = fs.readFileSync(commitMessagePath, 'utf8');
  const version = parseVersionFromCommitMessage(commitMessage);
  if (!version) return 0;

  const changedFiles = [];
  if (syncVersionInPackageJson(version)) changedFiles.push(packageJsonPath);
  if (syncVersionInPackageLock(version)) changedFiles.push(packageLockPath);
  if (changedFiles.length === 0) return 0;

  stageFiles(changedFiles);
  process.stdout.write(`[version-sync] synced version ${version}\n`);
  return 0;
};

process.exitCode = main();
