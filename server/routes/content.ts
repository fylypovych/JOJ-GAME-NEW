import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DownloadMaterial, DownloadMaterialsDocument, ProjectNews } from '../../src/content/types';
import type { EnforceRateLimit, LogLine, ReadJsonBodySafe, RequireAdminAuth, RouterLike } from './types';
import { requireAdminMutationAuth } from '../admin-auth';

type PoolLike = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

type ContentRouteDeps = {
  router: RouterLike;
  pool: PoolLike | null;
  requireAdminAuth: RequireAdminAuth;
  enforceRateLimit: EnforceRateLimit;
  readJsonBodySafe: ReadJsonBodySafe;
  logLine: LogLine;
  jsonBodyLimit: number;
  uploadBodyLimit: number;
  newsAssetsDir: string;
  downloadsDir: string;
  materialsConfigPath: string;
};

const text = (value: unknown, max = 50_000) => String(value ?? '').trim().slice(0, max);
const int = (value: unknown) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
const bool = (value: unknown) => value === true;
const safeId = (value: unknown) => text(value, 100).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const safeSlug = (value: unknown) => safeId(value).toLowerCase() || `news-${Date.now()}`;

const emptyMaterials = (): DownloadMaterialsDocument => ({ kind: 'joj-download-materials', version: 1, materials: [] });

const readMaterials = async (filePath: string): Promise<DownloadMaterialsDocument> => {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<DownloadMaterialsDocument>;
    return { kind: 'joj-download-materials', version: 1, materials: Array.isArray(parsed.materials) ? parsed.materials : [] };
  } catch {
    return emptyMaterials();
  }
};

const writeMaterials = async (filePath: string, document: DownloadMaterialsDocument) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
  await rename(temporary, filePath);
};

const mapNews = (row: Record<string, unknown>): ProjectNews => ({
  id: String(row.id ?? ''), slug: String(row.slug ?? ''), title: String(row.title ?? ''), titleEn: String(row.title_en ?? ''),
  summary: String(row.summary ?? ''), summaryEn: String(row.summary_en ?? ''), body: String(row.body ?? ''), bodyEn: String(row.body_en ?? ''),
  coverImagePath: String(row.cover_image_path ?? ''), status: row.status === 'published' ? 'published' : 'draft', pinned: row.pinned === true,
  publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null,
  sortOrder: int(row.sort_order), updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : '',
});

const parseDataUrl = (value: unknown, allowed: Record<string, string>) => {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(value ?? ''));
  if (!match || !allowed[match[1].toLowerCase()]) throw new Error('Unsupported or invalid file');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new Error('Empty file');
  return { buffer, mimeType: match[1].toLowerCase(), extension: allowed[match[1].toLowerCase()] };
};

const saveUpload = async (dir: string, publicPrefix: string, body: Record<string, unknown>, allowed: Record<string, string>) => {
  const parsed = parseDataUrl(body.dataUrl, allowed);
  await mkdir(dir, { recursive: true });
  const base = safeId(path.parse(text(body.fileName, 180)).name) || 'file';
  const fileName = `${base}-${Date.now()}-${randomUUID().slice(0, 8)}.${parsed.extension}`;
  await writeFile(path.join(dir, fileName), parsed.buffer, { mode: 0o644 });
  // Production uses `vite preview`, which serves dist rather than public. Keep
  // the runtime copy immediately available; the canonical source stays public.
  let publicDir = path.resolve(dir);
  while (path.basename(publicDir) !== 'public' && path.dirname(publicDir) !== publicDir) publicDir = path.dirname(publicDir);
  if (path.basename(publicDir) !== 'public') throw new Error('Upload directory must be inside public');
  const appRoot = path.dirname(publicDir);
  const distDir = path.join(appRoot, 'dist', path.relative(publicDir, dir));
  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, fileName), parsed.buffer, { mode: 0o644 });
  return { path: `${publicPrefix}/${fileName}`, fileName, mimeType: parsed.mimeType, sizeBytes: parsed.buffer.length };
};

const removeUpload = async (dir: string, publicPath: string, prefix: string) => {
  if (!publicPath.startsWith(`${prefix}/`)) return;
  const relative = publicPath.slice(prefix.length + 1).replace(/\\/g, '/');
  if (!relative || relative.split('/').some((part) => part === '..')) return;
  await unlink(path.join(dir, ...relative.split('/'))).catch(() => undefined);
  const publicDir = path.dirname(dir);
  const appRoot = path.dirname(publicDir);
  await unlink(path.join(appRoot, 'dist', path.basename(dir), ...relative.split('/'))).catch(() => undefined);
};

const newsSelect = `SELECT id, slug, title, title_en, summary, summary_en, body, body_en, cover_image_path,
  status, pinned, published_at, sort_order, updated_at FROM project_news`;

export const registerContentRoutes = (deps: ContentRouteDeps) => {
  const { router, pool } = deps;
  const requireWrite = (ctx: Parameters<RequireAdminAuth>[0], label: string) =>
    requireAdminMutationAuth(ctx, label, deps.requireAdminAuth);

  router.get('/api/content/news', async (ctx) => {
    if (!pool) { ctx.status = 503; ctx.body = { ok: false, error: 'Database unavailable' }; return; }
    const result = await pool.query(`${newsSelect} WHERE status = 'published' ORDER BY pinned DESC, sort_order ASC, published_at DESC NULLS LAST, updated_at DESC`);
    ctx.body = { ok: true, news: result.rows.map(mapNews) };
  });

  router.get('/api/content/downloads', async (ctx) => {
    const document = await readMaterials(deps.materialsConfigPath);
    ctx.body = { ok: true, materials: document.materials.filter((item) => item.published).sort((a, b) => a.sortOrder - b.sortOrder) };
  });

  router.get('/api/admin/content/news', async (ctx) => {
    if (!await deps.requireAdminAuth(ctx, 'admin-content-news-list')) return;
    if (!pool) { ctx.status = 503; ctx.body = { ok: false, error: 'Database unavailable' }; return; }
    const result = await pool.query(`${newsSelect} ORDER BY pinned DESC, sort_order ASC, updated_at DESC`);
    ctx.body = { ok: true, news: result.rows.map(mapNews) };
  });

  router.post('/api/admin/content/news/save', async (ctx) => {
    if (!await requireWrite(ctx, 'admin-content-news-save')) return;
    if (!await deps.enforceRateLimit(ctx, 'admin-content-news-save', 60, 60_000)) return;
    const body = await deps.readJsonBodySafe({ ctx, routeLabel: 'admin-content-news-save', maxBytes: deps.jsonBodyLimit, logLine: deps.logLine });
    if (!body || !pool) return;
    const id = text(body.id, 100) || randomUUID();
    const status = body.status === 'published' ? 'published' : 'draft';
    const values = [id, safeSlug(body.slug || body.title), text(body.title, 300), text(body.titleEn, 300), text(body.summary), text(body.summaryEn), text(body.body), text(body.bodyEn), text(body.coverImagePath, 500), status, bool(body.pinned), int(body.sortOrder)];
    if (!values[2]) { ctx.status = 400; ctx.body = { ok: false, error: 'Title is required' }; return; }
    const result = await pool.query(`INSERT INTO project_news
      (id, slug, title, title_en, summary, summary_en, body, body_en, cover_image_path, status, pinned, sort_order, published_at)
      VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $10='published' THEN now() ELSE NULL END)
      ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug,title=EXCLUDED.title,title_en=EXCLUDED.title_en,summary=EXCLUDED.summary,
      summary_en=EXCLUDED.summary_en,body=EXCLUDED.body,body_en=EXCLUDED.body_en,cover_image_path=EXCLUDED.cover_image_path,
      status=EXCLUDED.status,pinned=EXCLUDED.pinned,sort_order=EXCLUDED.sort_order,
      published_at=CASE WHEN EXCLUDED.status='published' THEN COALESCE(project_news.published_at,now()) ELSE NULL END,updated_at=now()
      RETURNING *`, values);
    ctx.body = { ok: true, item: mapNews(result.rows[0]) };
  });

  router.post('/api/admin/content/news/delete', async (ctx) => {
    if (!await requireWrite(ctx, 'admin-content-news-delete')) return;
    const body = await deps.readJsonBodySafe({ ctx, routeLabel: 'admin-content-news-delete', maxBytes: deps.jsonBodyLimit, logLine: deps.logLine });
    if (!body || !pool) return;
    const deleted = await pool.query('DELETE FROM project_news WHERE id=$1::uuid RETURNING cover_image_path', [text(body.id, 100)]);
    const coverPath = String(deleted.rows[0]?.cover_image_path ?? '');
    await removeUpload(deps.newsAssetsDir, coverPath, '/news-assets');
    ctx.body = { ok: true };
  });

  router.post('/api/admin/content/news/image-upload', async (ctx) => {
    if (!await requireWrite(ctx, 'admin-content-news-image')) return;
    const body = await deps.readJsonBodySafe({ ctx, routeLabel: 'admin-content-news-image', maxBytes: deps.uploadBodyLimit, logLine: deps.logLine });
    if (!body) return;
    try { ctx.body = { ok: true, ...(await saveUpload(deps.newsAssetsDir, '/news-assets', body, { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })) }; }
    catch (error) { ctx.status = 400; ctx.body = { ok: false, error: error instanceof Error ? error.message : 'Upload failed' }; }
  });

  router.get('/api/admin/content/downloads', async (ctx) => {
    if (!await deps.requireAdminAuth(ctx, 'admin-content-downloads-list')) return;
    ctx.body = { ok: true, materials: (await readMaterials(deps.materialsConfigPath)).materials };
  });

  router.post('/api/admin/content/downloads/upload', async (ctx) => {
    if (!await requireWrite(ctx, 'admin-content-download-upload')) return;
    const body = await deps.readJsonBodySafe({ ctx, routeLabel: 'admin-content-download-upload', maxBytes: deps.uploadBodyLimit, logLine: deps.logLine });
    if (!body) return;
    try { ctx.body = { ok: true, ...(await saveUpload(deps.downloadsDir, '/downloads', body, { 'application/pdf': 'pdf', 'application/zip': 'zip', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })) }; }
    catch (error) { ctx.status = 400; ctx.body = { ok: false, error: error instanceof Error ? error.message : 'Upload failed' }; }
  });

  router.post('/api/admin/content/downloads/cover-upload', async (ctx) => {
    if (!await requireWrite(ctx, 'admin-content-download-cover-upload')) return;
    const body = await deps.readJsonBodySafe({ ctx, routeLabel: 'admin-content-download-cover-upload', maxBytes: deps.uploadBodyLimit, logLine: deps.logLine });
    if (!body) return;
    try { ctx.body = { ok: true, ...(await saveUpload(path.join(deps.downloadsDir, 'covers'), '/downloads/covers', body, { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })) }; }
    catch (error) { ctx.status = 400; ctx.body = { ok: false, error: error instanceof Error ? error.message : 'Upload failed' }; }
  });

  router.post('/api/admin/content/downloads/save', async (ctx) => {
    if (!await requireWrite(ctx, 'admin-content-download-save')) return;
    const body = await deps.readJsonBodySafe({ ctx, routeLabel: 'admin-content-download-save', maxBytes: deps.jsonBodyLimit, logLine: deps.logLine });
    if (!body) return;
    const document = await readMaterials(deps.materialsConfigPath);
    const now = new Date().toISOString();
    const item: DownloadMaterial = { id: safeId(body.id) || randomUUID(), title: text(body.title, 300), titleEn: text(body.titleEn, 300), description: text(body.description), descriptionEn: text(body.descriptionEn), category: text(body.category, 100), version: text(body.version, 60), filePath: text(body.filePath, 500), fileName: text(body.fileName, 200), mimeType: text(body.mimeType, 100), sizeBytes: Math.max(0, int(body.sizeBytes)), coverImagePath: text(body.coverImagePath, 500), published: bool(body.published), sortOrder: int(body.sortOrder), updatedAt: now };
    if (!item.title || !item.filePath.startsWith('/downloads/')) { ctx.status = 400; ctx.body = { ok: false, error: 'Title and uploaded file are required' }; return; }
    const index = document.materials.findIndex((row) => row.id === item.id);
    if (index >= 0) document.materials[index] = item; else document.materials.push(item);
    await writeMaterials(deps.materialsConfigPath, document);
    ctx.body = { ok: true, item };
  });

  router.post('/api/admin/content/downloads/delete', async (ctx) => {
    if (!await requireWrite(ctx, 'admin-content-download-delete')) return;
    const body = await deps.readJsonBodySafe({ ctx, routeLabel: 'admin-content-download-delete', maxBytes: deps.jsonBodyLimit, logLine: deps.logLine });
    if (!body) return;
    const document = await readMaterials(deps.materialsConfigPath);
    const item = document.materials.find((row) => row.id === safeId(body.id));
    document.materials = document.materials.filter((row) => row.id !== safeId(body.id));
    await writeMaterials(deps.materialsConfigPath, document);
    if (item) {
      await removeUpload(deps.downloadsDir, item.filePath, '/downloads');
      await removeUpload(deps.downloadsDir, item.coverImagePath, '/downloads');
    }
    ctx.body = { ok: true };
  });
};
