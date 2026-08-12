import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('installer keeps the private backup directory writable by web deployments', async () => {
  const installer = await readFile('scripts/install-ubuntu.sh', 'utf8');

  assert.match(
    installer,
    /install -d -m 0700 -o "\$APP_USER" -g "\$APP_USER" "\$BACKUP_DIR"/,
  );
  assert.match(
    installer,
    /chown "\$APP_USER:\$APP_USER" "\$\{PROJECT_DIR\}\/backup"/,
  );
  assert.doesNotMatch(installer, /chown root:root "\$\{PROJECT_DIR\}\/backup"/);
  assert.match(
    installer,
    /if \[\[ -r "\$\{PROJECT_DIR\}\/scripts\/backup-production\.sh" \]\]; then/,
  );
  assert.doesNotMatch(
    installer,
    /if \[\[ -x "\$\{PROJECT_DIR\}\/scripts\/backup-production\.sh" \]\]; then/,
  );
  assert.match(
    installer,
    /bash "\$\{PROJECT_DIR\}\/scripts\/backup-production\.sh"/,
  );
});

test('production backup retention defaults to seven days in every entry point', async () => {
  const [installer, backupScript, cli, adminGitOps, configExample] =
    await Promise.all([
      readFile('scripts/install-ubuntu.sh', 'utf8'),
      readFile('scripts/backup-production.sh', 'utf8'),
      readFile('scripts/joj-cli.sh', 'utf8'),
      readFile('server/services/admin-git-ops.ts', 'utf8'),
      readFile('deploy/install-ubuntu.conf.example', 'utf8'),
    ]);

  assert.match(
    installer,
    /BACKUP_RETENTION_DAYS="\$\{BACKUP_RETENTION_DAYS:-7\}"/,
  );
  assert.match(backupScript, /JOJ_BACKUP_RETENTION_DAYS:-7/);
  assert.match(cli, /JOJ_BACKUP_RETENTION_DAYS:-7/);
  assert.match(adminGitOps, /JOJ_BACKUP_RETENTION_DAYS:-7/);
  assert.match(configExample, /^BACKUP_RETENTION_DAYS=7$/m);
});
