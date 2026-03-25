const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const gitDir = path.join(repoRoot, '.git');
const hooksDir = path.join(repoRoot, '.githooks');

const main = () => {
  if (!fs.existsSync(gitDir)) {
    console.log('[git-hooks] skip: .git not found');
    return 0;
  }
  if (!fs.existsSync(hooksDir)) {
    console.log('[git-hooks] skip: .githooks not found');
    return 0;
  }
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: repoRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
  console.log('[git-hooks] configured core.hooksPath=.githooks');
  return 0;
};

process.exitCode = main();
