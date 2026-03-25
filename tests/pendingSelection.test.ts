import test from 'node:test';
import assert from 'node:assert/strict';
import type { CardDefinition } from '../src/game/types';
import { getPendingReplacementTargetIds, targetNeedsReplacementSelection } from '../src/ui/board/usePendingSelection';

const scandalCard: CardDefinition = {
  id: 'scandal-1',
  title: 'Скандал',
  category: 'SCANDAL',
  effects: [{ resource: 'time', value: -1 }],
};

test('targetNeedsReplacementSelection is false when base resource is enough', () => {
  assert.equal(
    targetNeedsReplacementSelection(
      { time: 1, reputation: 0, discipline: 0, documents: 0, tech: 0 },
      scandalCard.effects,
    ),
    false,
  );
});

test('targetNeedsReplacementSelection is true when base resource is missing but replacement is feasible', () => {
  assert.equal(
    targetNeedsReplacementSelection(
      { time: 0, reputation: 2, discipline: 0, documents: 0, tech: 0 },
      scandalCard.effects,
    ),
    true,
  );
});

test('getPendingReplacementTargetIds returns only scandal targets with real deficit', () => {
  const replacementTargets = getPendingReplacementTargetIds({
    pendingSelection: { type: 'hand-scandal', cardId: scandalCard.id },
    currentPendingCard: scandalCard,
    selectedTargetId: null,
    shieldByPlayer: { '1': 0, '2': 0, '3': 99 },
    allPlayerIds: ['0', '1', '2', '3'],
    opponentIds: ['1', '2', '3'],
    resourcesByPlayer: {
      '0': { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
      '1': { time: 1, reputation: 0, discipline: 0, documents: 0, tech: 0 },
      '2': { time: 0, reputation: 2, discipline: 0, documents: 0, tech: 0 },
      '3': { time: 0, reputation: 2, discipline: 0, documents: 0, tech: 0 },
    },
    currentTurn: 5,
    selfPlayerId: '0',
  });

  assert.deepEqual(replacementTargets, ['2']);
});

test('getPendingReplacementTargetIds returns empty for lyap without deficit', () => {
  const replacementTargets = getPendingReplacementTargetIds({
    pendingSelection: { type: 'hand-lyap', cardId: scandalCard.id },
    currentPendingCard: scandalCard,
    selectedTargetId: '1',
    shieldByPlayer: { '1': 0 },
    allPlayerIds: ['0', '1'],
    opponentIds: ['1'],
    resourcesByPlayer: {
      '0': { time: 1, reputation: 1, discipline: 1, documents: 1, tech: 1 },
      '1': { time: 1, reputation: 0, discipline: 0, documents: 0, tech: 0 },
    },
    currentTurn: 1,
    selfPlayerId: '0',
  });

  assert.deepEqual(replacementTargets, []);
});
