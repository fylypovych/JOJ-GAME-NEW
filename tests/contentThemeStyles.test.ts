import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('public content pages define explicit contrasting palettes for light and dark themes', async () => {
  const source = await readFile(
    new URL('../src/ui/styles/content.css', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /\.content-page\s*\{[\s\S]*--content-bg:\s*#ffffff;[\s\S]*--content-text:\s*#172133;/,
  );
  assert.match(
    source,
    /\.app\.app-v2 \.content-page,[\s\S]*\.is-dark-theme \.content-page\s*\{[\s\S]*--content-bg:\s*#1c2424;[\s\S]*--content-text:\s*#f2f4ed;/,
  );
  assert.match(
    source,
    /\.content-empty h2\s*\{[^}]*color:\s*var\(--content-text\)/,
  );
});
