import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidVvnzPayment,
  selectVvnzPaymentResources,
} from '../src/game/vvnzCost';

const resources = {
  time: 2,
  reputation: 5,
  discipline: 9,
  documents: 1,
  tech: 4,
};

test('VVNZ automatically selects its fixed two-time payment', () => {
  assert.deepEqual(selectVvnzPaymentResources(resources), ['time', 'time']);
  assert.equal(isValidVvnzPayment(resources, ['time', 'time']), true);
});

test('VVNZ rejects unrelated resource pairs', () => {
  assert.equal(isValidVvnzPayment(resources, ['documents', 'tech']), false);
});
