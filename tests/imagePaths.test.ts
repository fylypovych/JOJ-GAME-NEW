import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeImagePath,
  RUNTIME_CARD_ASSET_BASE_PATH,
} from '../src/game/imagePaths';

test('runtime card uploads use the backend asset route', () => {
  assert.equal(
    normalizeImagePath('/public/card-assets/asset-123.webp'),
    `${RUNTIME_CARD_ASSET_BASE_PATH}asset-123.webp`,
  );
  assert.equal(
    normalizeImagePath('/api/card-assets/module/asset-123.webp'),
    '/api/card-assets/module/asset-123.webp',
  );
  assert.equal(
    normalizeImagePath('/card-assets/asset-123.webp'),
    '/api/card-assets/asset-123.webp',
  );
});
