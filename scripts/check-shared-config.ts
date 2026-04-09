import assert from 'node:assert/strict';
import sharedDeckTemplateJson from '../database/shared-deck-template.json';
import sharedRanksJson from '../database/shared-ranks.json';
import {
  importSharedRanksJson,
  validateSharedDeckTemplateJson,
} from '../src/game/sharedConfig';
import {
  SHARED_RANKS_SCHEMA_KIND,
  SHARED_TEMPLATE_SCHEMA_KIND,
} from '../src/game/sharedConfigSchema';

const fail = (message: string): never => {
  throw new Error(message);
};

const templateText = JSON.stringify(sharedDeckTemplateJson);
const templateResult = validateSharedDeckTemplateJson(templateText);
if (!templateResult.ok) {
  fail(`Shared deck template validation failed: ${templateResult.error}`);
}

const template = sharedDeckTemplateJson as Record<string, unknown>;
if (
  template.kind !== undefined &&
  template.kind !== SHARED_TEMPLATE_SCHEMA_KIND
) {
  fail(
    `Expected template kind "${SHARED_TEMPLATE_SCHEMA_KIND}", got "${String(template.kind)}"`,
  );
}

const deck = Array.isArray(sharedDeckTemplateJson.deck)
  ? sharedDeckTemplateJson.deck
  : [];
const legendaryDeck = Array.isArray(sharedDeckTemplateJson.legendaryDeck)
  ? sharedDeckTemplateJson.legendaryDeck
  : [];
const rankTrack = Array.isArray(sharedDeckTemplateJson.rankTrack)
  ? sharedDeckTemplateJson.rankTrack
  : [];
const allCardIds = [...deck, ...legendaryDeck, ...rankTrack].map((card) =>
  String(card.id ?? ''),
);
const duplicateCardIds = allCardIds.filter(
  (id, index) => id && allCardIds.indexOf(id) !== index,
);
if (duplicateCardIds.length > 0) {
  fail(
    `Duplicate card ids found in shared template: ${Array.from(new Set(duplicateCardIds)).join(', ')}`,
  );
}

const ranksDocument = sharedRanksJson as Record<string, unknown>;
if (
  ranksDocument.kind !== undefined &&
  ranksDocument.kind !== SHARED_RANKS_SCHEMA_KIND
) {
  fail(
    `Expected ranks kind "${SHARED_RANKS_SCHEMA_KIND}", got "${String(ranksDocument.kind)}"`,
  );
}

const ranksText = JSON.stringify(sharedRanksJson);
const ranksResult = importSharedRanksJson(ranksText);
if (!ranksResult.ok) {
  fail(`Shared ranks validation failed: ${ranksResult.error}`);
}

const ranks = Array.isArray(sharedRanksJson)
  ? sharedRanksJson
  : Array.isArray((sharedRanksJson as { ranks?: unknown[] }).ranks)
    ? (sharedRanksJson as { ranks: unknown[] }).ranks
    : [];
const rankIds = ranks.map((rank) => String(rank.id ?? ''));
const duplicateRankIds = rankIds.filter(
  (id, index) => id && rankIds.indexOf(id) !== index,
);
if (duplicateRankIds.length > 0) {
  fail(
    `Duplicate rank ids found: ${Array.from(new Set(duplicateRankIds)).join(', ')}`,
  );
}

assert.ok(
  deck.length > 0,
  'Shared deck template must contain at least one main deck card',
);
assert.ok(
  ranks.length > 0,
  'Shared ranks document must contain at least one rank',
);

console.log(
  `shared-config ok: ${deck.length} deck cards, ${legendaryDeck.length} legendary cards, ${rankTrack.length} rank-track cards, ${ranks.length} ranks`,
);
