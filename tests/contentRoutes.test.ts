import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { registerContentRoutes } from '../server/routes/content';
import type { RouteCtx } from '../server/routes/types';

const setup = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'joj-content-'));
  const getHandlers = new Map<string, (ctx: RouteCtx) => unknown>();
  const postHandlers = new Map<string, (ctx: RouteCtx) => unknown>();
  const materialsConfigPath = path.join(root, 'database', 'download-materials.json');
  await mkdir(path.dirname(materialsConfigPath), { recursive: true });
  await writeFile(materialsConfigPath, JSON.stringify({ kind: 'joj-download-materials', version: 1, materials: [
    { id: 'public', title: 'Rules', titleEn: '', description: '', descriptionEn: '', category: 'PDF', version: '1', filePath: '/downloads/rules.pdf', fileName: 'rules.pdf', mimeType: 'application/pdf', sizeBytes: 10, coverImagePath: '', published: true, sortOrder: 2, updatedAt: '' },
    { id: 'draft', title: 'Draft', titleEn: '', description: '', descriptionEn: '', category: 'PDF', version: '', filePath: '/downloads/draft.pdf', fileName: 'draft.pdf', mimeType: 'application/pdf', sizeBytes: 10, coverImagePath: '', published: false, sortOrder: 1, updatedAt: '' },
  ] }));
  registerContentRoutes({
    router: { get: (route, handler) => { getHandlers.set(route, handler); }, post: (route, handler) => { postHandlers.set(route, handler); } },
    pool: { query: async () => ({ rows: [{ id: '1', slug: 'hello', title: 'Привіт', title_en: 'Hello', summary: '', summary_en: '', body: 'Body', body_en: '', cover_image_path: '', status: 'published', pinned: true, published_at: '2026-08-12T00:00:00Z', sort_order: 0, updated_at: '2026-08-12T00:00:00Z' }] }) },
    requireAdminAuth: async () => true,
    enforceRateLimit: async () => true,
    readJsonBodySafe: async ({ ctx }) => (ctx.request?.body ?? {}) as Record<string, unknown>,
    logLine: async () => undefined,
    jsonBodyLimit: 1024 * 1024,
    uploadBodyLimit: 1024 * 1024,
    newsAssetsDir: path.join(root, 'public', 'news-assets'),
    downloadsDir: path.join(root, 'public', 'downloads'),
    materialsConfigPath,
  });
  return { root, getHandlers };
};

test('public content routes expose published news and downloads only', async () => {
  const { root, getHandlers } = await setup();
  try {
    const newsCtx: RouteCtx = {};
    await getHandlers.get('/api/content/news')?.(newsCtx);
    assert.equal((newsCtx.body as { news: unknown[] }).news.length, 1);
    const downloadsCtx: RouteCtx = {};
    await getHandlers.get('/api/content/downloads')?.(downloadsCtx);
    const materials = (downloadsCtx.body as { materials: Array<{ id: string }> }).materials;
    assert.deepEqual(materials.map((item) => item.id), ['public']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
