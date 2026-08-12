import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('service worker clears legacy caches without intercepting application requests', async () => {
  const source = await readFile('public/sw.js', 'utf8');

  assert.match(source, /joj-game-/);
  assert.match(source, /joj-card-images-/);
  assert.match(source, /joj-api-/);
  assert.match(source, /caches\.delete/);
  assert.equal(source.includes("addEventListener('fetch'"), false);
  assert.equal(source.includes('respondWith'), false);
});

test('client bypasses HTTP cache when checking for a cleanup worker update', async () => {
  const source = await readFile('src/main.tsx', 'utf8');

  assert.match(source, /updateViaCache:\s*'none'/);
  assert.match(source, /registration\.update\(\)/);
  assert.match(source, /CLEAR_JOJ_CACHES/);
});

test('production proxy keeps the app shell fresh and fingerprints assets', async () => {
  const sources = await Promise.all([
    readFile('deploy/Caddyfile.production.example', 'utf8'),
    readFile('scripts/install-ubuntu.sh', 'utf8'),
  ]);

  for (const source of sources) {
    assert.match(source, /@app_shell path \/ \/index\.html \/sw\.js/);
    assert.match(source, /no-cache, no-store, must-revalidate/);
    assert.match(source, /@versioned_assets path \/assets\/\*/);
    assert.match(source, /public, max-age=31536000, immutable/);
  }
});
