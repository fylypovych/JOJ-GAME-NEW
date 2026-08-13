import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlayHandCardAtStage } from '../src/game/turnRules';
import { cardNeedsResourceSelection } from '../src/game/cardRules';
import type { CardDefinition } from '../src/game/types';

test('canPlayHandCardAtStage allows normal play only on PLAY stage', () => {
  assert.equal(
    canPlayHandCardAtStage({
      isCurrentPlayer: true,
      stage: 'play',
      extraHandPlayTokens: 0,
    }),
    true,
  );
  assert.equal(
    canPlayHandCardAtStage({
      isCurrentPlayer: true,
      stage: 'end',
      extraHandPlayTokens: 0,
    }),
    false,
  );
  assert.equal(
    canPlayHandCardAtStage({
      isCurrentPlayer: false,
      stage: 'play',
      extraHandPlayTokens: 99,
    }),
    false,
  );
});

test('canPlayHandCardAtStage allows END stage only with extra token', () => {
  assert.equal(
    canPlayHandCardAtStage({
      isCurrentPlayer: true,
      stage: 'end',
      extraHandPlayTokens: 1,
    }),
    true,
  );
  assert.equal(
    canPlayHandCardAtStage({
      isCurrentPlayer: true,
      stage: 'end',
      extraHandPlayTokens: 2,
    }),
    true,
  );
});

test('all resource-selecting legendary cards request a resource', () => {
  for (const id of ['legendary-06', 'legendary-09', 'legendary-17']) {
    assert.equal(
      cardNeedsResourceSelection({
        id,
        title: id,
        category: 'LEGENDARY',
        effects: [],
      } as CardDefinition),
      true,
    );
  }
});

test('VVNZ uses its fixed time cost without opening resource selection', () => {
  assert.equal(
    cardNeedsResourceSelection({
      id: 'vvnz-fixed-cost',
      title: 'VVNZ',
      category: 'VVNZ',
      grantRank: 'soldier',
      effects: [],
    }),
    false,
  );
});
