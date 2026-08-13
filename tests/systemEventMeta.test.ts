import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySystemEvent } from '../src/ui/board/systemEventMeta';

test('structured event kind wins over misleading words in system text', () => {
  const meta = classifySystemEvent(
    'Грамота захищає від ЛЯП/СКАНДАЛ і згадує звання.',
    'uk',
    'legendary',
  );

  assert.deepEqual(meta, { label: 'Легендарне', tone: 'legendary' });
});

test('legacy system messages still use text classification', () => {
  assert.deepEqual(classifySystemEvent('Гравець розіграв СКАНДАЛ.', 'uk'), {
    label: 'SCANDAL',
    tone: 'warn',
  });
});

test('legacy legendary icon is not misclassified by SCANDAL mentioned in its text', () => {
  assert.deepEqual(
    classifySystemEvent('🃏 [6] Грамота захищає від ЛЯП/СКАНДАЛ.', 'uk'),
    { label: 'Легендарне', tone: 'legendary' },
  );
});
