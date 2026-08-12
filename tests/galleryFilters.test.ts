import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('public card gallery has no aggregate all-cards filter button', async () => {
  const source = await readFile(new URL('../src/ui/app/sections-gallery-rules.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('gallery-filter-all'), false);
  assert.equal(source.includes('t.allCategories'), false);
  assert.match(source, /availableGalleryCategories\.map/);
});
