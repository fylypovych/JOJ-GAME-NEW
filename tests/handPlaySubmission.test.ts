import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('hand play submission stays locked until authoritative state changes', async () => {
  const hookSource = await readFile(
    new URL('../src/ui/board/usePendingSelection.ts', import.meta.url),
    'utf8',
  );
  const boardSource = await readFile(
    new URL('../src/ui/GameBoardV2.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    hookSource,
    /if \(handPlaySubmissionRef\.current\) return false;[\s\S]*handPlaySubmissionRef\.current = true;[\s\S]*moves\.playCard/,
  );
  assert.match(
    hookSource,
    /submittedHandSnapshotRef\.current === handSnapshot[\s\S]*releaseHandPlaySubmission\(\)/,
  );
  assert.match(
    boardSource,
    /primaryActionDisabled=\{primaryActionDisabled \|\| isHandPlaySubmitting\}/,
  );
  assert.match(
    boardSource,
    /actionDisabled=\{\(card\) => isHandPlaySubmitting \|\|/,
  );
});
