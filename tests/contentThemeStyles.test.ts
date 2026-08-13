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

test('news and downloads share a centered responsive page panel', async () => {
  const source = await readFile(
    new URL('../src/ui/styles/content.css', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /\.content-page\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*1120px;[\s\S]*box-sizing:\s*border-box;/,
  );
  assert.match(
    source,
    /\.content-page\s*\{[\s\S]*border:\s*1px solid var\(--content-border\);[\s\S]*border-radius:\s*28px;[\s\S]*background:\s*var\(--content-bg\);/,
  );
  assert.match(
    source,
    /@media \(max-width:\s*720px\)\s*\{[\s\S]*\.content-page\s*\{[\s\S]*padding:\s*12px;[\s\S]*border-radius:\s*20px;/,
  );
});

test('V2 game panels keep a readable dark palette', async () => {
  const source = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  const darkPalette = source.slice(
    source.indexOf('/* Keep the V2 game palette dark'),
  );

  for (const selector of [
    '.game-ui-v2-hand-section',
    '.game-ui-v2-events',
    '.board-chat',
    '.board-status',
    '.chat-log',
    '.hand .game-card',
  ]) {
    assert.ok(
      darkPalette.includes(selector),
      `${selector} needs a V2 dark override`,
    );
  }
  assert.match(
    darkPalette,
    /background:\s*linear-gradient\(180deg, rgba\(38, 43, 45, 0\.98\), rgba\(20, 24, 26, 0\.98\)\);[\s\S]*color:\s*#eef2ec;/,
  );
  assert.match(
    darkPalette,
    /background:\s*linear-gradient\(180deg, rgba\(48, 54, 57, 0\.96\), rgba\(27, 32, 34, 0\.98\)\);[\s\S]*color:\s*#eef2ec;/,
  );
  assert.match(
    darkPalette,
    /\.app\.app-v2 \.game-ui-layout-shell input,[\s\S]*\.app\.app-v2 \.game-ui-layout-shell textarea\s*\{[\s\S]*background:\s*#171b1d;[\s\S]*color:\s*#eef2ec;/,
  );
});

test('active game receives the selected theme and V1 panels stay readable', async () => {
  const featureSource = await readFile(
    new URL('../src/ui/app/AppFeatureContainers.tsx', import.meta.url),
    'utf8',
  );
  const lightStyles = await readFile(
    new URL('../src/ui/styles/v1.css', import.meta.url),
    'utf8',
  );
  const lightPalette = lightStyles.slice(
    lightStyles.indexOf('/* The light application theme must also win'),
  );

  assert.match(
    featureSource,
    /<ClientComponent[\s\S]*uiTheme=\{gameUiVariant\}/,
  );
  for (const selector of [
    '.game-ui-v2-hand-section',
    '.game-ui-v2-events',
    '.board-chat',
    '.board-status',
    '.chat-log',
    '.game-card-body.is-v1',
  ]) {
    assert.ok(
      lightPalette.includes(selector),
      `${selector} needs a V1 light override`,
    );
  }
  assert.match(
    lightPalette,
    /background:\s*linear-gradient\(180deg, rgba\(251, 248, 242, 0\.98\), rgba\(233, 225, 212, 0\.98\)\);[\s\S]*color:\s*#504538;/,
  );
  assert.match(lightPalette, /background:\s*#fffdf9;[\s\S]*color:\s*#3e372f;/);
});
