import { readdir } from 'node:fs/promises';
import path from 'node:path';
import bugReportUiConfig from '../database/bug-report-ui-config.json';
import gameUiConfig from '../database/game-ui-config.json';
import sharedDeckTemplateJson from '../database/shared-deck-template.json';
import sharedRanksJson from '../database/shared-ranks.json';

const repoRoot = path.resolve(import.meta.dirname, '..');
const assetDir = path.join(repoRoot, 'public', 'card-assets');
const CARD_ASSET_PREFIX = '/card-assets/';
const canonicalAssetNameRe =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\.(png|jpg|jpeg|gif|svg|webp)$/;
const sharedRanks = Array.isArray(sharedRanksJson)
  ? sharedRanksJson
  : Array.isArray((sharedRanksJson as { ranks?: unknown[] }).ranks)
    ? (sharedRanksJson as { ranks: Array<Record<string, unknown>> }).ranks
    : [];

const readAssetNames = async () => {
  const entries = await readdir(assetDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
    .map((entry) => entry.name)
    .sort();
};

const collectAssetRefs = () => {
  const refs = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    if (!value.startsWith(CARD_ASSET_PREFIX)) return;
    refs.add(value.slice(CARD_ASSET_PREFIX.length));
  };

  add(sharedDeckTemplateJson.deckBackImage);
  for (const card of [
    ...sharedDeckTemplateJson.deck,
    ...sharedDeckTemplateJson.legendaryDeck,
    ...sharedDeckTemplateJson.rankTrack,
  ]) {
    add(card.image);
  }
  for (const rank of sharedRanks) {
    add(rank.image);
    if (Array.isArray(rank.imageVariants)) {
      for (const variant of rank.imageVariants) add(variant);
    }
  }
  add(bugReportUiConfig.imagePath);
  add((gameUiConfig as Record<string, unknown>).logoImagePath);

  return refs;
};

const assetNames = await readAssetNames();
const nonCanonical = assetNames.filter(
  (name) => !canonicalAssetNameRe.test(name),
);
if (nonCanonical.length > 0) {
  throw new Error(
    `Found non-canonical asset names outside the approved legacy baseline: ${nonCanonical.join(', ')}`,
  );
}

const assetNameSet = new Set(assetNames);
const referencedAssets = collectAssetRefs();
const missingAssets = Array.from(referencedAssets).filter(
  (name) => !assetNameSet.has(name),
);
if (missingAssets.length > 0) {
  throw new Error(
    `Referenced asset files are missing from public/card-assets: ${missingAssets.join(', ')}`,
  );
}

console.log(
  `assets ok: ${assetNames.length} files, ${referencedAssets.size} referenced assets, 0 legacy-name exceptions`,
);
