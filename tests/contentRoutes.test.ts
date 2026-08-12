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
  const materialsConfigPath = path.join(
    root,
    'database',
    'download-materials.json',
  );
  await mkdir(path.dirname(materialsConfigPath), { recursive: true });
  await writeFile(
    materialsConfigPath,
    JSON.stringify({
      kind: 'joj-download-materials',
      version: 1,
      materials: [
        {
          id: 'public',
          title: 'Rules',
          titleEn: '',
          description: '',
          descriptionEn: '',
          category: 'PDF',
          version: '1',
          filePath: '/downloads/rules.pdf',
          fileName: 'rules.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          coverImagePath: '',
          published: true,
          sortOrder: 2,
          updatedAt: '',
        },
        {
          id: 'draft',
          title: 'Draft',
          titleEn: '',
          description: '',
          descriptionEn: '',
          category: 'PDF',
          version: '',
          filePath: '/downloads/draft.pdf',
          fileName: 'draft.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          coverImagePath: '',
          published: false,
          sortOrder: 1,
          updatedAt: '',
        },
      ],
    }),
  );
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  registerContentRoutes({
    router: {
      get: (route, handler) => {
        getHandlers.set(route, handler);
      },
      post: (route, handler) => {
        postHandlers.set(route, handler);
      },
    },
    pool: {
      query: async (sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        return {
          rows: sql.includes('INSERT INTO project_pages')
            ? [
                {
                  page_key: 'rules',
                  title: values?.[0],
                  title_en: values?.[1],
                  summary: values?.[2],
                  summary_en: values?.[3],
                  body: values?.[4],
                  body_en: values?.[5],
                  status: values?.[6],
                  updated_at: '2026-08-12T01:00:00Z',
                },
              ]
            : sql.includes('project_pages')
              ? [
                  {
                    page_key: 'rules',
                    title: 'Правила',
                    title_en: 'Rules',
                    summary: 'Вступ',
                    summary_en: 'Intro',
                    body: 'Перше правило\n\nДруге правило',
                    body_en: 'First rule\n\nSecond rule',
                    status: 'published',
                    updated_at: '2026-08-12T00:00:00Z',
                  },
                ]
              : [
                  {
                    id: '1',
                    slug: 'hello',
                    title: 'Привіт',
                    title_en: 'Hello',
                    summary: '',
                    summary_en: '',
                    body: 'Body',
                    body_en: '',
                    cover_image_path: '',
                    status: 'published',
                    pinned: true,
                    published_at: '2026-08-12T00:00:00Z',
                    sort_order: 0,
                    updated_at: '2026-08-12T00:00:00Z',
                  },
                ],
        };
      },
    },
    requireAdminAuth: async () => true,
    enforceRateLimit: async () => true,
    readJsonBodySafe: async ({ ctx }) =>
      (ctx.request?.body ?? {}) as Record<string, unknown>,
    logLine: async () => undefined,
    jsonBodyLimit: 1024 * 1024,
    uploadBodyLimit: 1024 * 1024,
    newsAssetsDir: path.join(root, 'public', 'news-assets'),
    downloadsDir: path.join(root, 'public', 'downloads'),
    materialsConfigPath,
  });
  return { root, getHandlers, postHandlers, queries };
};

test('public content routes expose published news and downloads only', async () => {
  const { root, getHandlers } = await setup();
  try {
    const newsCtx: RouteCtx = {};
    await getHandlers.get('/api/content/news')?.(newsCtx);
    assert.equal((newsCtx.body as { news: unknown[] }).news.length, 1);
    const downloadsCtx: RouteCtx = {};
    await getHandlers.get('/api/content/downloads')?.(downloadsCtx);
    const materials = (
      downloadsCtx.body as { materials: Array<{ id: string }> }
    ).materials;
    assert.deepEqual(
      materials.map((item) => item.id),
      ['public'],
    );
    const rulesCtx: RouteCtx = {};
    await getHandlers.get('/api/content/rules')?.(rulesCtx);
    const page = (
      rulesCtx.body as { page: { key: string; status: string; body: string } }
    ).page;
    assert.equal(page.key, 'rules');
    assert.equal(page.status, 'published');
    assert.match(page.body, /Друге правило/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('administrator can persist and publish the editable rules page', async () => {
  const { root, postHandlers, queries } = await setup();
  try {
    const ctx: RouteCtx = {
      request: {
        headers: {
          cookie: 'joj_user_csrf=rules-token',
          'x-csrf-token': 'rules-token',
        },
        body: {
          title: 'Правила гри',
          titleEn: 'Game rules',
          summary: 'Короткий вступ',
          body: 'Перше правило\n\nДруге правило',
          status: 'published',
        },
      },
    };

    await postHandlers.get('/api/admin/content/rules/save')?.(ctx);

    assert.equal(ctx.status, undefined);
    const page = (ctx.body as { page: { title: string; status: string } }).page;
    assert.equal(page.title, 'Правила гри');
    assert.equal(page.status, 'published');
    const saveQuery = queries.find(({ sql }) =>
      sql.includes('INSERT INTO project_pages'),
    );
    assert.ok(saveQuery);
    assert.equal(saveQuery.values?.[6], 'published');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
