import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyProductionPublishFiles,
  isProductionPublishPath,
} from '../server/services/admin-git-ops';

test('production publish allows only reviewed content configuration files', () => {
  assert.equal(isProductionPublishPath('database/shared-deck-template.json'), true);
  assert.equal(isProductionPublishPath('database/shared-ranks.json'), true);
  assert.equal(isProductionPublishPath('database/game-ui-config.json'), true);
  assert.equal(isProductionPublishPath('database/simulation-baselines.json'), true);

  assert.equal(isProductionPublishPath('database/admin-db-ui-config.json'), false);
  assert.equal(isProductionPublishPath('package.json'), false);
  assert.equal(isProductionPublishPath('.env'), false);
});

test('production publish accepts card images but rejects executable or unrelated uploads', () => {
  assert.equal(isProductionPublishPath('public/card-assets/2026.TEST/card.webp'), true);
  assert.equal(isProductionPublishPath('public\\card-assets\\2026.TEST\\card.PNG'), true);
  assert.equal(isProductionPublishPath('public/card-assets/card.gif'), true);

  assert.equal(isProductionPublishPath('public/card-assets/payload.js'), false);
  assert.equal(isProductionPublishPath('public/card-assets/page.html'), false);
  assert.equal(isProductionPublishPath('public/profile-image/avatar.webp'), false);
});

test('production publish classification keeps excluded files out of the commit', () => {
  const result = classifyProductionPublishFiles([
    'database/shared-deck-template.json',
    'database/shared-deck-template.json',
    'public/card-assets/module/card.webp',
    'database/admin-db-ui-config.json',
    'package-lock.json',
  ]);

  assert.deepEqual(result.publishable, [
    'database/shared-deck-template.json',
    'public/card-assets/module/card.webp',
  ]);
  assert.deepEqual(result.excluded, [
    'database/admin-db-ui-config.json',
    'package-lock.json',
  ]);
});
