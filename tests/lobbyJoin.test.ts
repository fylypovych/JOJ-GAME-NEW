import assert from 'node:assert/strict';
import test from 'node:test';
import { findFirstAvailableLobbySeat } from '../src/ui/app/lobbyJoin';

test('joining never reuses an occupied seat with the same player name', () => {
  const seat = findFirstAvailableLobbySeat([
    { id: 0, name: 'Player' },
    { id: 1, name: 'Player' },
    { id: 2 },
  ]);

  assert.deepEqual(seat, { id: 2 });
});

test('joining reports no seat when the room is full', () => {
  const seat = findFirstAvailableLobbySeat([
    { id: 0, name: 'Owner' },
    { id: 1, name: 'Guest' },
  ]);

  assert.equal(seat, undefined);
});
