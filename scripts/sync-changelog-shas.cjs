const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const headingPattern = /^## (\d+\.\d+\.\d+\.\d+) — /gm;
const shaLinePattern = /^- \*\*Оригінальний SHA коміту:\*\* `([0-9a-f]{40})`$/m;

const formatPositionVersion = (position) => {
  const major = Math.floor(position / 1_000_000);
  const minor = Math.floor(position / 10_000) % 100;
  const patch = Math.floor(position / 100) % 100;
  const build = position % 100;
  return `${major}.${minor}.${patch}.${build}`;
};

const readVersionCommits = () => {
  const output = execFileSync('git', ['rev-list', '--reverse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  const commits = new Map();
  output.split(/\r?\n/).filter(Boolean).forEach((sha, index) => {
    if (/^[0-9a-f]{40}$/.test(sha)) commits.set(formatPositionVersion(index + 1), sha);
  });
  return commits;
};

const splitEntries = (source) => {
  const headings = [...source.matchAll(headingPattern)];
  return headings.map((match, index) => ({
    version: match[1],
    start: match.index,
    end: headings[index + 1]?.index ?? source.length,
  }));
};

const synchronize = (source, commits) => {
  const entries = splitEntries(source);
  let output = source;
  for (const entry of [...entries].reverse()) {
    const expectedSha = commits.get(entry.version);
    if (!expectedSha) continue;
    const block = output.slice(entry.start, entry.end);
    const shaLine = `- **Оригінальний SHA коміту:** \`${expectedSha}\``;
    const nextBlock = shaLinePattern.test(block)
      ? block.replace(shaLinePattern, shaLine)
      : block.replace(
        /^(- \*\*Правильний номер коміту:\*\* .*\r?\n)/m,
        `$1${shaLine}\n`,
      );
    output = output.slice(0, entry.start) + nextBlock + output.slice(entry.end);
  }
  return output;
};

const validate = (source, commits) => {
  const errors = [];
  if (/Оригінальний SHA коміту:.*поточний коміт/i.test(source)) {
    errors.push('знайдено текстову заглушку «поточний коміт»');
  }
  const entries = splitEntries(source);
  entries.forEach((entry, index) => {
    const block = source.slice(entry.start, entry.end);
    const actualSha = block.match(shaLinePattern)?.[1] ?? '';
    const expectedSha = commits.get(entry.version) ?? '';
    if (expectedSha && actualSha && actualSha !== expectedSha) {
      errors.push(`${entry.version}: вказано ${actualSha}, очікується ${expectedSha}`);
    }
    if (expectedSha && !actualSha && index !== 0) {
      errors.push(`${entry.version}: відсутній SHA вже створеного коміту`);
    }
    if (actualSha && !expectedSha) {
      errors.push(`${entry.version}: SHA вказано, але коміт цієї версії не знайдено`);
    }
  });
  return errors;
};

const main = () => {
  const checkOnly = process.argv.includes('--check');
  const source = fs.readFileSync(changelogPath, 'utf8');
  const commits = readVersionCommits();
  const synchronized = synchronize(source, commits);
  const errors = validate(checkOnly ? source : synchronized, commits);
  if (errors.length) {
    errors.forEach((error) => process.stderr.write(`[changelog-shas] ${error}\n`));
    return 1;
  }
  if (checkOnly) {
    process.stdout.write('[changelog-shas] ok\n');
    return 0;
  }
  if (synchronized !== source) fs.writeFileSync(changelogPath, synchronized, 'utf8');
  process.stdout.write('[changelog-shas] synchronized\n');
  return 0;
};

if (require.main === module) process.exitCode = main();

module.exports = { formatPositionVersion, readVersionCommits, splitEntries, synchronize, validate };
