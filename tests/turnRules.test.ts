import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlayHandCardAtStage } from '../src/game/turnRules';

test('canPlayHandCardAtStage allows normal play only on PLAY stage', () => {
  assert.equal(canPlayHandCardAtStage({ isCurrentPlayer: true, stage: 'play', extraHandPlayTokens: 0 }), true);
  assert.equal(canPlayHandCardAtStage({ isCurrentPlayer: true, stage: 'end', extraHandPlayTokens: 0 }), false);
  assert.equal(canPlayHandCardAtStage({ isCurrentPlayer: false, stage: 'play', extraHandPlayTokens: 99 }), false);
});

test('canPlayHandCardAtStage allows END stage only with extra token', () => {
  assert.equal(canPlayHandCardAtStage({ isCurrentPlayer: true, stage: 'end', extraHandPlayTokens: 1 }), true);
  assert.equal(canPlayHandCardAtStage({ isCurrentPlayer: true, stage: 'end', extraHandPlayTokens: 2 }), true);
});

