import { readdir } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const databaseDir = path.join(repoRoot, 'database');
const matchesDir = path.join(databaseDir, 'matches');
const topLevelAllowlist = new Set([
  'admin-db-ui-config.json',
  'bug-report-ui-config.json',
  'download-materials.json',
  'game-ui-config.json',
  'shared-deck-template.json',
  'shared-ranks.json',
  'simulation-baselines.json',
  'matches',
]);
const mirrorFileRe = /^[a-z0-9-]+\.json$/;
const matchMirrorNameRe = /^(?:\.gitkeep|[a-f0-9]{64})$/;

const topLevelEntries = await readdir(databaseDir, { withFileTypes: true });
const unexpectedTopLevel = topLevelEntries
  .map((entry) => entry.name)
  .filter((name) => !topLevelAllowlist.has(name));
if (unexpectedTopLevel.length > 0) {
  throw new Error(
    `Unexpected files in database/: ${unexpectedTopLevel.join(', ')}`,
  );
}

const invalidMirrorNames = topLevelEntries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => !mirrorFileRe.test(name));
if (invalidMirrorNames.length > 0) {
  throw new Error(
    `Database mirror files must stay kebab-case .json: ${invalidMirrorNames.join(', ')}`,
  );
}

const matchEntries = await readdir(matchesDir, { withFileTypes: true });
const invalidMatchMirrorNames = matchEntries
  .map((entry) => entry.name)
  .filter((name) => !matchMirrorNameRe.test(name));
if (invalidMatchMirrorNames.length > 0) {
  throw new Error(
    `database/matches contains unexpected filenames: ${invalidMatchMirrorNames.join(', ')}`,
  );
}

console.log(
  `runtime-data ok: ${topLevelEntries.length} database entries, ${matchEntries.length} match mirror files`,
);
