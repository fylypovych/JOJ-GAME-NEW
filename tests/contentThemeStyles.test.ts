import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const normalizeCss = (source: string) =>
  source
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();

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

test('public content page header and empty state do not create nested cards', async () => {
  const source = await readFile(
    new URL('../src/ui/styles/content.css', import.meta.url),
    'utf8',
  );
  const headerRule =
    source.match(/\.content-page__header\s*\{([^}]|\}(?!\s*\.))*\}/)?.[0] ?? '';
  const emptyRule = source.match(/\.content-empty\s*\{[^}]*\}/)?.[0] ?? '';

  assert.doesNotMatch(headerRule, /border:\s*1px|border-radius|box-shadow/);
  assert.doesNotMatch(emptyRule, /border-radius|box-shadow|background:/);
  assert.match(emptyRule, /border-top:\s*1px solid var\(--content-border\)/);
});

test('active admin menu tabs keep readable text and icons on category colors', async () => {
  const source = normalizeCss(
    await readFile(
      new URL('../src/ui/styles/admin.css', import.meta.url),
      'utf8',
    ),
  );

  for (const category of [
    'start',
    'operations',
    'content',
    'data',
    'integrations',
    'system',
  ]) {
    assert.match(
      source,
      new RegExp(
        `\\.admin-v2-tab-strip\\.is-${category} button\\.is-active \\{[^}]*background\\s*:\\s*linear-gradient`,
      ),
    );
  }
  assert.match(
    source,
    /\.admin-v2-tab-strip button\.is-active,[^}]*\.admin-v2-tab-strip button\.is-active \.admin-tab-label\s*\{[^}]*color:\s*#ffffff !important;[^}]*text-shadow:/,
  );
  assert.match(
    source,
    /\.admin-v2-tab-strip button\.is-active \.admin-tab-icon img\s*\{[^}]*opacity:\s*1;[^}]*filter:\s*brightness\(0\) invert\(1\) !important;/,
  );
});

test('admin workspaces do not show a decorative category card beside the heading', async () => {
  const navigationSource = await readFile(
    new URL('../src/ui/admin/components/AdminNavigation.tsx', import.meta.url),
    'utf8',
  );
  const pageSource = await readFile(
    new URL('../src/ui/AdminPage.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(navigationSource, /admin-v2-category-banner/);
  assert.doesNotMatch(navigationSource, /contextStatus/);
  assert.doesNotMatch(pageSource, /contextStatus/);
});

test('V2 game panels keep a readable dark palette', async () => {
  const source = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  const normalizedSource = normalizeCss(source);
  const darkPalette = normalizedSource.slice(
    normalizedSource.indexOf('/* Keep the V2 game palette dark'),
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

test('legendary hand uses one full-width frame', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const panelSource = await readFile(
    new URL('../src/ui/board/v2Panels.tsx', import.meta.url),
    'utf8',
  );
  const styles = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  const normalizedStyles = normalizeCss(styles);

  assert.match(
    boardSource,
    /<V2HandSection\s+className="game-ui-v2-legendary-frame game-ui-layout-legendary-frame"/,
  );
  assert.doesNotMatch(
    boardSource,
    /<section className="game-ui-v2-panel game-ui-layout-panel game-ui-v2-legendary-frame"/,
  );
  assert.match(
    panelSource,
    /game-ui-v2-hand-section game-ui-layout-hand-section\$\{className \? ` \$\{className\}` : ''\}/,
  );
  assert.match(
    normalizedStyles,
    /\.game-ui-layout-shell \.game-ui-layout-legendary-frame\s*\{[^}]*width:\s*100%;[^}]*box-sizing:\s*border-box;[^}]*overflow:\s*visible;/,
  );
});

test('main hand does not reserve an empty side column or duplicate its frame', async () => {
  const sectionSource = await readFile(
    new URL('../src/ui/board/v2Sections.tsx', import.meta.url),
    'utf8',
  );
  const styles = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  const normalizedStyles = normalizeCss(styles);

  assert.match(
    sectionSource,
    /sideContent \? ' has-side-content' : ' is-main-only'/,
  );
  assert.match(
    sectionSource,
    /\{sideContent \? \([\s\S]*<aside className="game-ui-v2-player-dock-side game-ui-layout-player-dock-side">[\s\S]*\) : null\}/,
  );
  assert.match(
    normalizedStyles,
    /\.game-ui-layout-shell \.game-ui-layout-player-dock\.is-main-only\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/,
  );
  assert.match(
    normalizedStyles,
    /\.game-ui-layout-player-dock-main > \.game-ui-layout-hand-section:not\(\.game-ui-layout-legendary-frame\)\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/,
  );
});

test('table pile preview opens in a bounded viewport modal', async () => {
  const componentSource = await readFile(
    new URL('../src/ui/board/components.tsx', import.meta.url),
    'utf8',
  );
  const styles = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );

  assert.match(
    componentSource,
    /createPortal\([\s\S]*className=\{`pile-preview-modal is-theme-\$\{theme\}`\}[\s\S]*document\.body/,
  );
  assert.doesNotMatch(
    componentSource.slice(
      componentSource.indexOf('export const PilePreview'),
      componentSource.indexOf('type GameCardTileProps'),
    ),
    /game-card-popover/,
  );
  assert.match(
    styles,
    /\.pile-preview-modal\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*place-items:\s*center;/,
  );
  assert.match(
    styles,
    /\.pile-preview-modal-card\s*\{[^}]*width:\s*min\(360px, calc\(100vw - 56px\)\);[^}]*max-height:\s*calc\(100dvh - 64px\);/,
  );
});

test('disabled opponent cards remain readable in the dark game theme', async () => {
  const tabStyles = await readFile(
    new URL('../src/ui/styles/user-tabs.css', import.meta.url),
    'utf8',
  );
  const gameStyles = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  const normalizedGameStyles = normalizeCss(gameStyles);

  assert.doesNotMatch(
    tabStyles,
    /\.app\[class\*="app-v"\]:not\(\[class\*="1"\]\) button:disabled/,
  );
  assert.match(
    tabStyles,
    /\.app\[class\*="app-v"\]:not\(\[class\*="1"\]\) \.user-tabs button:disabled/,
  );
  assert.match(
    normalizedGameStyles,
    /\.game-ui-layout-shell \.game-ui-layout-opponent-card\s*\{[^}]*background:\s*linear-gradient\(180deg, rgba\(59, 65, 70, 0\.96\), rgba\(31, 35, 39, 0\.98\)\);/,
  );
  assert.match(
    normalizedGameStyles,
    /\.game-ui-layout-shell \.game-ui-layout-opponent-card:disabled\s*\{[^}]*opacity:\s*1;/,
  );
  assert.match(
    normalizedGameStyles,
    /\.game-ui-layout-shell \.game-ui-layout-opponent-copy strong,[^}]*\{[^}]*color:\s*#f7f1de;/,
  );
});

test('an available end-turn action is distinct from a disabled promotion', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const sectionSource = await readFile(
    new URL('../src/ui/board/v2Sections.tsx', import.meta.url),
    'utf8',
  );
  const styles = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  const normalizedStyles = normalizeCss(styles);

  assert.match(boardSource, /className="is-promote-action"/);
  assert.match(
    boardSource,
    /is-end-turn-action\$\{canEndTurn && !blockPlayerTurnControls \? ' is-ready-action' : ''\}/,
  );
  assert.match(
    sectionSource,
    /is-secondary\$\{secondaryActionDisabled \? '' : ' is-ready-action'\}/,
  );
  assert.match(
    normalizedStyles,
    /\.game-ui-layout-footer-actions \.is-secondary\.is-ready-action,[\s\S]*\.game-ui-layout-mobile-bar \.is-end-turn-action\.is-ready-action\s*\{[^}]*background:\s*linear-gradient\(180deg, #d9b65f, #9b7128\);[^}]*color:\s*#211707;/,
  );
  assert.match(
    normalizedStyles,
    /\.game-ui-layout-mobile-bar button:disabled\s*\{[^}]*opacity:\s*0\.4;[^}]*filter:\s*saturate\(0\.3\);/,
  );
});

test('the center player badge does not repeat turn-stage guidance', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const sectionSource = await readFile(
    new URL('../src/ui/board/v2Sections.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(boardSource, /centerKicker=/);
  assert.doesNotMatch(sectionSource, /centerKicker/);
  assert.match(
    sectionSource,
    /game-ui-v2-center-badge-copy game-ui-layout-center-badge-copy">\s*<strong>\{centerTitle\}<\/strong>\s*<small>\{centerSubtitle\}<\/small>/,
  );
});

test('the hand section does not repeat stage and action summaries', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const styles = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(boardSource, /game-ui-v2-hand-rail/);
  assert.doesNotMatch(boardSource, /game-ui-layout-hand-rail/);
  assert.doesNotMatch(styles, /game-ui-layout-hand-rail/);
  assert.match(
    boardSource,
    /title=\{`\$\{t\.yourHand\} \(\$\{hand\.length\}\/8\)`\}/,
  );
});

test('the discard pile does not repeat the visible card title below its image', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const discardSection = boardSource.slice(
    boardSource.indexOf('game-ui-v2-zone-discard'),
    boardSource.indexOf(
      '</article>',
      boardSource.indexOf('game-ui-v2-zone-discard'),
    ),
  );

  assert.match(discardSection, /alt=\{actualDiscardTitle\}/);
  assert.doesNotMatch(discardSection, /game-ui-v2-zone-meta/);
});

test('the deck does not repeat turn-stage guidance below its image', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const deckSection = boardSource.slice(
    boardSource.indexOf('game-ui-v2-zone-deck'),
    boardSource.indexOf(
      '</article>',
      boardSource.indexOf('game-ui-v2-zone-deck'),
    ),
  );

  assert.match(deckSection, /previewKey="v2-pile-deck"/);
  assert.doesNotMatch(deckSection, /stageFocusDraw/);
  assert.doesNotMatch(deckSection, /game-ui-v2-zone-meta/);
});

test('bot playback uses one status and hides unavailable player actions', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const panelSource = await readFile(
    new URL('../src/ui/board/v2Panels.tsx', import.meta.url),
    'utf8',
  );
  const sectionSource = await readFile(
    new URL('../src/ui/board/v2Sections.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    boardSource,
    /stageFocus=\{blockPlayerTurnControls \? undefined : currentStageFocus\}/,
  );
  assert.match(boardSource, /actionsHidden=\{blockPlayerTurnControls\}/);
  assert.doesNotMatch(boardSource, /game-ui-v2-bot-thinking/);
  assert.doesNotMatch(panelSource, /JOJ V2 TCG/);
  assert.match(
    sectionSource,
    /\{!actionsHidden \? \([\s\S]*game-ui-layout-footer-actions[\s\S]*\) : null\}/,
  );
});

test('the current visual fixes have explicit light-theme treatment', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const componentSource = await readFile(
    new URL('../src/ui/board/components.tsx', import.meta.url),
    'utf8',
  );
  const lightStyles = await readFile(
    new URL('../src/ui/styles/v1.css', import.meta.url),
    'utf8',
  );

  assert.equal(boardSource.match(/theme=\{internalTheme\}/g)?.length, 3);
  assert.match(componentSource, /pile-preview-modal is-theme-\$\{theme\}/);
  assert.match(
    lightStyles,
    /\.game-ui-layout-shell\.is-theme-v1 \.game-ui-layout-legendary-frame\s*\{[^}]*background\s*:/,
  );
  assert.doesNotMatch(
    lightStyles,
    /\.game-ui-layout-player-dock-side \.game-ui-layout-legendary-frame/,
  );
  assert.match(
    lightStyles,
    /\.pile-preview-modal\.is-theme-v1\s*\{[^}]*background:\s*rgba\(72, 62, 49, 0\.42\);/,
  );
  assert.match(
    lightStyles,
    /\.pile-preview-modal\.is-theme-v1 \.pile-preview-modal-card\s*\{[^}]*background:\s*linear-gradient\(180deg, #fffdf8, #e9e0d2\);/,
  );
});

test('lobby filters stay compact and the room summary cannot widen the page', async () => {
  const styles = await readFile(
    new URL('../src/ui/styles/admin.css', import.meta.url),
    'utf8',
  );

  assert.match(
    styles,
    /\.lobby-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 3fr\) minmax\(320px, 2fr\);[^}]*max-width\s*:\s*100%;/,
  );
  assert.match(
    styles,
    /\.lobby-room-filters\s*\{[^}]*display\s*:\s*flex;[^}]*flex-wrap\s*:\s*wrap;/,
  );
  assert.match(
    styles,
    /\.lobby-room-filters button\s*\{[^}]*width\s*:\s*auto;[^}]*min-width\s*:\s*0;/,
  );
  assert.match(
    styles,
    /\.lobby-room-create-summary\s*\{[^}]*min-width\s*:\s*0;[^}]*max-width\s*:\s*100%;[^}]*overflow-wrap\s*:\s*anywhere;/,
  );
});

test('legendary hand cards omit the repeated deck label and keep a dark readable body', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const componentSource = await readFile(
    new URL('../src/ui/board/components.tsx', import.meta.url),
    'utf8',
  );
  const styles = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  const normalizedStyles = normalizeCss(styles);

  assert.match(
    boardSource,
    /className="game-ui-v2-legendary-frame[\s\S]*categoryText=\{\(\) => ''\}/,
  );
  assert.match(
    componentSource,
    /\{categoryText \? <small>\{categoryText\}<\/small> : null\}/,
  );
  assert.match(
    normalizedStyles,
    /\.game-ui-layout-shell\.is-theme-v2 \.game-ui-layout-legendary-frame \.game-card-body\.is-v1\s*\{[^}]*rgba\(55, 51, 72, 0\.98\)[^}]*rgba\(29, 28, 43, 0\.99\)/,
  );
});

test('side chat and help render as single panels without nested card frames', async () => {
  const panelSource = await readFile(
    new URL('../src/ui/board/v2Panels.tsx', import.meta.url),
    'utf8',
  );
  const componentSource = await readFile(
    new URL('../src/ui/board/components.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    componentSource,
    /className=\{`board-chat\$\{className \? ` \$\{className\}` : ''\}`\}/,
  );
  assert.match(
    panelSource,
    /<BoardChatPanel\s+className=\{sidePanelTab !== 'chat'/,
  );
  assert.doesNotMatch(
    panelSource,
    /<section className=\{sidePanelTab !== 'chat'[\s\S]*?<BoardChatPanel/,
  );
  assert.match(
    panelSource,
    /<section\s+className=\{`board-chat game-ui-v2-help-panel game-ui-layout-help-panel/,
  );
  assert.doesNotMatch(
    panelSource,
    /<section[^>]*>[\s\S]{0,120}<div className="board-chat game-ui-v2-help-panel/,
  );
});

test('draw system messages emphasize the drawing player in both themes', async () => {
  const componentSource = await readFile(
    new URL('../src/ui/board/components.tsx', import.meta.url),
    'utf8',
  );
  const panelSource = await readFile(
    new URL('../src/ui/board/v2Panels.tsx', import.meta.url),
    'utf8',
  );
  const drawSource = await readFile(
    new URL('../src/game/runtime/drawHandlers.ts', import.meta.url),
    'utf8',
  );
  const botSource = await readFile(
    new URL('../src/game/bot-engine/engine.ts', import.meta.url),
    'utf8',
  );
  const darkStyles = normalizeCss(
    await readFile(new URL('../src/ui/styles/v2.css', import.meta.url), 'utf8'),
  );
  const lightStyles = normalizeCss(
    await readFile(new URL('../src/ui/styles/v1.css', import.meta.url), 'utf8'),
  );

  assert.match(
    componentSource,
    /<SystemMessageText[\s\S]*playerName=\{\s*row\.playerID/,
  );
  assert.match(
    panelSource,
    /<SystemMessageText[\s\S]*playerName=\{\s*row\.playerID/,
  );
  assert.equal(
    drawSource.match(/type: 'system',\s*playerID,\s*eventKind:/g)?.length,
    6,
  );
  assert.equal(
    botSource.match(/type: 'system',\s*playerID,\s*eventKind:/g)?.length,
    2,
  );
  assert.match(
    darkStyles,
    /\.system-message-player[^}]*color: #72db94;[^}]*font-weight: 800;/,
  );
  assert.match(
    lightStyles,
    /\.system-message-player[^}]*color: #18733b;[^}]*font-weight: 800;/,
  );
});

test('opponents use a neutral hand-count label instead of the player hand label', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );

  const opponentsArea = boardSource.slice(
    boardSource.indexOf('<V2OpponentsArea'),
    boardSource.indexOf(
      'centerPortraitImage=',
      boardSource.indexOf('<V2OpponentsArea'),
    ),
  );
  assert.match(opponentsArea, /handLabel=\{board\.handCardsLabel\}/);
  assert.doesNotMatch(opponentsArea, /handLabel=\{t\.yourHand\}/);
});

test('bot controls use the shared compact panel layout in both themes', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const styles = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  const normalizedStyles = normalizeCss(styles);

  assert.match(
    boardSource,
    /game-ui-v2-header-tools-head game-ui-layout-header-tools-head/,
  );
  assert.match(
    boardSource,
    /game-ui-v2-header-tools-row game-ui-layout-header-tools-row/,
  );
  assert.match(
    boardSource,
    /game-ui-v2-bot-speed-slider game-ui-layout-bot-speed-slider/,
  );
  assert.match(
    boardSource,
    /game-ui-v2-bot-toggle game-ui-layout-bot-toggle\$\{botAutoplayEnabled \? ' is-active' : ' is-paused'\}/,
  );
  assert.match(
    normalizedStyles,
    /\.game-ui-layout-shell\.is-theme-v2 \.game-ui-layout-bot-toggle\.is-active\s*\{[^}]*background:\s*linear-gradient/,
  );
  assert.match(
    normalizedStyles,
    /\.game-ui-layout-shell\.is-theme-v1 \.game-ui-layout-bot-toggle\.is-active\s*\{[^}]*background:\s*linear-gradient/,
  );
  assert.match(
    styles,
    /\.game-ui-layout-shell \.game-ui-layout-bot-speed-value\s*\{[^}]*border-radius:\s*999px;/,
  );
});

test('hand cards keep a stable size and position on hover and selection', async () => {
  const styles = await readFile(
    new URL('../src/ui/styles/v2.css', import.meta.url),
    'utf8',
  );
  const normalizedStyles = normalizeCss(styles);

  assert.match(
    normalizedStyles,
    /\.game-ui-layout-shell \.hand \.game-card:hover,[\s\S]*?\.game-ui-layout-shell \.hand \.game-card:focus-visible\s*\{[^}]*transform:\s*none;/,
  );
  assert.match(
    normalizedStyles,
    /\.game-ui-layout-shell \.game-ui-layout-player-dock-main \.game-card\.is-v1\.is-selected\s*\{[^}]*transform:\s*none;/,
  );
  assert.match(
    normalizedStyles,
    /\.app\.app-v2\.is-immersive-v2-game \.game-ui-layout-player-dock-main \.game-card\.is-v1:hover,[\s\S]*?\.game-ui-layout-hand-grid > \.game-card:hover\s*\{[^}]*transform:\s*none;/,
  );
});

test('the hand is automatically ordered by playability without filter or sort controls', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const controllerSource = await readFile(
    new URL('../src/ui/board/useBoardUiController.ts', import.meta.url),
    'utf8',
  );
  const derivedSource = await readFile(
    new URL('../src/ui/board/useBoardDerivedState.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    boardSource,
    /game-ui-v2-hand-controls|handFilter|handSort/,
  );
  assert.doesNotMatch(controllerSource, /handFilter|handSort/);
  assert.doesNotMatch(derivedSource, /handFilter|handSort/);
  assert.match(
    derivedSource,
    /a\.playable === b\.playable \? a\.index - b\.index : a\.playable \? -1 : 1/,
  );
});

test('every pending card action opens one viewport-centered modal', async () => {
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );
  const panelSource = await readFile(
    new URL('../src/ui/board/v2Panels.tsx', import.meta.url),
    'utf8',
  );
  const styles = normalizeCss(
    await readFile(new URL('../src/ui/styles/v2.css', import.meta.url), 'utf8'),
  );

  assert.match(
    boardSource,
    /const selectionModalOpen = !isSpectator && Boolean\(pendingSelection\);/,
  );
  assert.equal(boardSource.match(/<V2SelectionPanel/g)?.length, 1);
  assert.match(boardSource, /role="dialog"\s+aria-modal="true"/);
  assert.doesNotMatch(panelSource, /game-ui-v2-selection-panel-inline/);
  assert.match(
    styles,
    /\.game-ui-v2-vote-popup\.game-ui-v2-selection-popup,[^}]*\{[^}]*position: fixed;[^}]*inset: 0;[^}]*z-index: 5000;[^}]*place-items: center;/,
  );
  assert.match(
    styles,
    /\.game-ui-layout-selection-popup \.game-ui-layout-vote-popup-card \{[^}]*width: min\(720px, calc\(100vw - 32px\)\);[^}]*max-height: calc\(100dvh - 32px\);[^}]*overflow: auto;/,
  );
});

test('VVNZ shows its fixed time cost and does not offer invalid resource payment choices', async () => {
  const pendingSource = await readFile(
    new URL('../src/ui/board/usePendingSelection.ts', import.meta.url),
    'utf8',
  );
  const panelSource = await readFile(
    new URL('../src/ui/board/v2Panels.tsx', import.meta.url),
    'utf8',
  );
  const derivedSource = await readFile(
    new URL('../src/ui/board/useBoardDerivedState.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    pendingSource,
    /getCardPlayBehavior\(card\) === 'vvnz'[\s\S]*selectVvnzPaymentResources\(playerResources\)[\s\S]*submitHandCard\(card\.id, payment, undefined\)/,
  );
  assert.doesNotMatch(
    `${pendingSource}\n${panelSource}`,
    /vvnz-payment|vvnzSelectedResources|confirmVvnzPayment/,
  );
  assert.match(
    derivedSource,
    /getCardPlayBehavior\(row\.card\) === 'vvnz'[\s\S]*board\.cost[\s\S]*resourceLabels\.time[\s\S]*× 2/,
  );
});
