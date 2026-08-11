const { execFileSync } = require('node:child_process');
const path = require('node:path');

const VERSION_BASE = 100;
const RELEASE_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)\.(\d+)(?:\s|$)/;

const parseReleaseVersion = (value) => {
  const firstLine = String(value ?? '').trim().split(/\r?\n/, 1)[0];
  const match = firstLine.match(RELEASE_VERSION_PATTERN);
  if (!match) return null;
  const parts = match.slice(1, 5).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) return null;
  return parts;
};

const normalizeReleaseVersionParts = ([major, minor, patch, build]) => {
  patch += Math.floor(build / VERSION_BASE);
  build %= VERSION_BASE;
  minor += Math.floor(patch / VERSION_BASE);
  patch %= VERSION_BASE;
  major += Math.floor(minor / VERSION_BASE);
  minor %= VERSION_BASE;
  return [major, minor, patch, build];
};

const formatReleaseVersion = (parts) => normalizeReleaseVersionParts(parts).join('.');

const normalizeReleaseVersion = (value) => {
  const parts = parseReleaseVersion(value);
  return parts ? formatReleaseVersion(parts) : '';
};

const incrementReleaseVersion = (value) => {
  const parts = parseReleaseVersion(value);
  if (!parts) return '';
  const normalized = normalizeReleaseVersionParts(parts);
  normalized[3] += 1;
  return formatReleaseVersion(normalized);
};

const findLatestReleaseVersion = (subjects) => {
  for (const subject of subjects) {
    const parsed = parseReleaseVersion(subject);
    if (parsed) return formatReleaseVersion(parsed);
  }
  return '';
};

const readRecentGitSubjects = () => execFileSync(
  'git',
  ['log', '--format=%s', '-n', '500'],
  {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    windowsHide: true,
  },
).split(/\r?\n/).filter(Boolean);

const getNextReleaseVersion = (subjects = readRecentGitSubjects()) => {
  const latest = findLatestReleaseVersion(subjects);
  return latest ? incrementReleaseVersion(latest) : '0.0.0.1';
};

const main = () => {
  const explicitVersion = process.argv.slice(2).join(' ').trim();
  if (explicitVersion) {
    const normalized = normalizeReleaseVersion(explicitVersion);
    if (!normalized) {
      process.stderr.write('[release-version] invalid version; expected x.y.z.a\n');
      return 1;
    }
    process.stdout.write(`${incrementReleaseVersion(normalized)}\n`);
    return 0;
  }
  process.stdout.write(`${getNextReleaseVersion()}\n`);
  return 0;
};

module.exports = {
  VERSION_BASE,
  RELEASE_VERSION_PATTERN,
  parseReleaseVersion,
  normalizeReleaseVersionParts,
  normalizeReleaseVersion,
  incrementReleaseVersion,
  findLatestReleaseVersion,
  getNextReleaseVersion,
};

if (require.main === module) {
  process.exitCode = main();
}
