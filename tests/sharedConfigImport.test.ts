import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportSharedRanksJson,
  getSharedDeckTemplate,
  getSharedRanks,
  importSharedRanksJson,
  importSharedDeckTemplateJson,
  resetSharedDeckTemplate,
  resetSharedRanks,
  validateSharedDeckTemplateJson,
} from '../src/game/sharedConfig';

test('validateSharedDeckTemplateJson checks payload without mutating current template', () => {
  resetSharedDeckTemplate();
  const before = getSharedDeckTemplate();
  const invalid = validateSharedDeckTemplateJson('{"deck":[{"id":"x"}],"legendaryDeck":[]}');
  assert.equal(invalid.ok, false);
  assert.deepEqual(getSharedDeckTemplate(), before);
});

test('importSharedDeckTemplateJson normalizes legacy DECISION category into COMMAND', () => {
  resetSharedDeckTemplate();
  const payload = JSON.stringify({
    deck: [{ id: 'card-1', title: 'Legacy decision', category: 'DECISION', effects: [] }],
    legendaryDeck: [],
    rankTrack: [],
  });
  const result = importSharedDeckTemplateJson(payload);
  assert.equal(result.ok, true);
  assert.equal(getSharedDeckTemplate().deck[0]?.category, 'COMMAND');
});

test('exportSharedRanksJson emits versioned ranks document', () => {
  resetSharedRanks();
  const payload = JSON.parse(exportSharedRanksJson()) as { kind?: string; version?: number; ranks?: unknown[] };
  assert.equal(payload.kind, 'joj-shared-ranks');
  assert.equal(payload.version, 1);
  assert.ok(Array.isArray(payload.ranks));
  assert.ok((payload.ranks?.length ?? 0) > 0);
});

test('importSharedRanksJson accepts versioned and legacy payloads', () => {
  resetSharedRanks();
  const versioned = exportSharedRanksJson();
  const versionedResult = importSharedRanksJson(versioned);
  assert.equal(versionedResult.ok, true);

  const legacy = JSON.stringify(getSharedRanks());
  const legacyResult = importSharedRanksJson(legacy);
  assert.equal(legacyResult.ok, true);
});

test('resetSharedDeckTemplate restores full shared template instead of legacy mini deck', () => {
  resetSharedDeckTemplate();
  const template = getSharedDeckTemplate();
  assert.equal(template.deck.length, 100);
  assert.equal(template.legendaryDeck.length, 16);
});
