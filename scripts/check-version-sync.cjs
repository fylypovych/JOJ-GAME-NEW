const path = require('node:path');
const {
  readIndexedPackageVersion,
  readPackageVersion,
  resolveVersionFromInput,
} = require('./sync-version-from-commit.cjs');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageLockPath = path.join(repoRoot, 'package-lock.json');

const getValidationErrorText = (version) => [
  `[version-check] aborted: staged package version does not match ${version}.`,
  `[version-check] hook auto-sync works only when package files are clean; otherwise run npm run set:version -- "v=${version}" and retry the commit.`,
];

const main = () => {
  const version = resolveVersionFromInput();
  if (!version) return 0;

  const versions = [
    readIndexedPackageVersion('package.json') || readPackageVersion(packageJsonPath),
    readIndexedPackageVersion('package-lock.json') || readPackageVersion(packageLockPath),
  ];
  const matchingVersions = versions.every((currentVersion) => currentVersion === version);
  if (matchingVersions) {
    return 0;
  }

  for (const line of getValidationErrorText(version)) {
    process.stderr.write(`${line}\n`);
  }
  return 1;
};

module.exports = {
  getValidationErrorText,
};

if (require.main === module) {
  process.exitCode = main();
}
