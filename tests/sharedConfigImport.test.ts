import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSharedDeckTemplate,
  importSharedDeckTemplateJson,
  resetSharedDeckTemplate,
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
