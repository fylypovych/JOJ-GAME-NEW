const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const gitDir = path.join(repoRoot, '.git');
const hooksDir = path.join(repoRoot, '.githooks');
const isCiEnvironment = (env) => String(env.CI ?? '').trim().toLowerCase() === 'true';

const tryRunGit = (args) => {
  try {
    execFileSync('git', args, {
      cwd: repoRoot,
      stdio: 'ignore',
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
};

const getSkipReason = ({ env, gitDirExists, hooksDirExists }) => {
  if (isCiEnvironment(env)) return 'CI environment detected';
  if (!gitDirExists) return '.git not found';
  if (!hooksDirExists) return '.githooks not found';
  return '';
};

const main = () => {
  const skipReason = getSkipReason({
    env: process.env,
    gitDirExists: fs.existsSync(gitDir),
    hooksDirExists: fs.existsSync(hooksDir),
  });
  if (skipReason) {
    console.log(`[git-hooks] skip: ${skipReason}`);
    return 0;
  }
  if (!tryRunGit(['config', 'core.hooksPath', '.githooks'])) {
    console.log('[git-hooks] skip: git is unavailable or hooksPath could not be configured');
    return 0;
  }
  console.log('[git-hooks] configured core.hooksPath=.githooks');
  return 0;
};

module.exports = {
  getSkipReason,
  isCiEnvironment,
};

if (require.main === module) {
  process.exitCode = main();
}
