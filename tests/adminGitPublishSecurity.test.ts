import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProductionPublishChangelog,
  classifyProductionPublishFiles,
  getNextProductionPublishVersion,
  isProductionPublishPath,
} from '../server/services/admin-git-ops';

test('production publish allows only reviewed content configuration files', () => {
  assert.equal(isProductionPublishPath('database/shared-deck-template.json'), true);
  assert.equal(isProductionPublishPath('database/download-materials.json'), true);
  assert.equal(isProductionPublishPath('database/shared-ranks.json'), true);
  assert.equal(isProductionPublishPath('database/game-ui-config.json'), true);
  assert.equal(isProductionPublishPath('database/simulation-baselines.json'), true);

  assert.equal(isProductionPublishPath('database/admin-db-ui-config.json'), false);
  assert.equal(isProductionPublishPath('package.json'), false);
  assert.equal(isProductionPublishPath('.env'), false);
  assert.equal(isProductionPublishPath('backup/joj-backup-20260811T120000Z.tar.gz'), false);
});

test('production publish accepts card images and avatars but rejects executable uploads', () => {
  assert.equal(isProductionPublishPath('public/card-assets/2026.TEST/card.webp'), true);
  assert.equal(isProductionPublishPath('public\\card-assets\\2026.TEST\\card.PNG'), true);
  assert.equal(isProductionPublishPath('public/card-assets/card.gif'), true);

  assert.equal(isProductionPublishPath('public/card-assets/payload.js'), false);
  assert.equal(isProductionPublishPath('public/card-assets/page.html'), false);
  assert.equal(isProductionPublishPath('public/profile-image/avatar.webp'), true);
  assert.equal(isProductionPublishPath('public/profile-image/avatar.jpg'), true);
  assert.equal(isProductionPublishPath('public/profile-image/payload.html'), false);
});

test('production publish classification keeps excluded files out of the commit', () => {
  const result = classifyProductionPublishFiles([
    'database/shared-deck-template.json',
    'database/shared-deck-template.json',
    'public/card-assets/module/card.webp',
    'database/admin-db-ui-config.json',
    'package-lock.json',
    'backup/joj-backup-20260811T120000Z.tar.gz',
  ]);

  assert.deepEqual(result.publishable, [
    'database/shared-deck-template.json',
    'public/card-assets/module/card.webp',
  ]);
  assert.deepEqual(result.excluded, [
    'database/admin-db-ui-config.json',
    'package-lock.json',
    'backup/joj-backup-20260811T120000Z.tar.gz',
  ]);
});

test('production publish accepts printable materials but never local news assets', () => {
  assert.equal(isProductionPublishPath('public/downloads/rules.pdf'), true);
  assert.equal(isProductionPublishPath('public/downloads/print-pack.zip'), true);
  assert.equal(isProductionPublishPath('public/news-assets/announcement.webp'), false);
  assert.equal(isProductionPublishPath('public/downloads/install.js'), false);
});

test('production publish assigns the next version from Git history', () => {
  assert.equal(getNextProductionPublishVersion(['0.0.4.39', '0.0.4.38']), '0.0.4.40');
  assert.equal(getNextProductionPublishVersion(['maintenance', '0.0.4.99']), '0.0.5.0');
  assert.equal(getNextProductionPublishVersion([]), '0.0.0.1');
});

test('production publish adds changelog description and seals the previous SHA', () => {
  const changelog = [
    '# Історія оновлень',
    '',
    'Задокументовано комітів: **39**.',
    '',
    '## 0.0.4.39 — 2026-08-22',
    '',
    '- **Правильний номер коміту:** `0.0.4.39`',
    '- **Опис змін:**',
    '  - попередня зміна',
    '',
  ].join('\n');

  const next = buildProductionPublishChangelog({
    changelog,
    version: '0.0.4.40',
    description: 'додано нові карти',
    previousHead: '83701d487fc03f80e8d7b501ecf3013ffbeced4f',
  });

  assert.match(next, /Задокументовано комітів: \*\*40\*\*\./);
  assert.match(next, /## 0\.0\.4\.40/);
  assert.match(next, / {2}- додано нові карти/);
  assert.match(next, /Оригінальний SHA коміту.*83701d487fc03f80e8d7b501ecf3013ffbeced4f/);
  assert.ok(next.indexOf('## 0.0.4.40') < next.indexOf('## 0.0.4.39'));
});
