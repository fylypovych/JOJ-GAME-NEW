import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

export type UploadedAssetRecord = {
  path: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  kind: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

const inferMime = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/webp';
};

export const createAssetStore = (pool: Pool) => {
  const listRelativeFiles = async (rootDir: string, prefix = ''): Promise<string[]> => {
    const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await listRelativeFiles(absPath, relativePath));
        continue;
      }
      if (!entry.isFile()) continue;
      const fileStat = await stat(absPath).catch(() => null);
      if (!fileStat?.isFile()) continue;
      files.push(relativePath.replace(/\\/g, '/'));
    }
    return files;
  };

  const ensureSchema = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS uploaded_assets (
        path text PRIMARY KEY,
        file_name text NOT NULL,
        mime text NOT NULL,
        size_bytes bigint NOT NULL DEFAULT 0,
        kind text NOT NULL DEFAULT 'card-image',
        source text NOT NULL DEFAULT 'upload',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS idx_uploaded_assets_kind ON uploaded_assets (kind);
      CREATE INDEX IF NOT EXISTS idx_uploaded_assets_deleted_at ON uploaded_assets (deleted_at);
    `);
  };

  const upsertAsset = async (input: {
    assetPath: string;
    fileName: string;
    mime: string;
    sizeBytes: number;
    kind?: string;
    source?: string;
  }) => {
    await pool.query(
      `INSERT INTO uploaded_assets (path, file_name, mime, size_bytes, kind, source, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), null)
       ON CONFLICT (path) DO UPDATE
       SET file_name = EXCLUDED.file_name,
           mime = EXCLUDED.mime,
           size_bytes = EXCLUDED.size_bytes,
           kind = EXCLUDED.kind,
           source = EXCLUDED.source,
           updated_at = now(),
           deleted_at = null`,
      [
        input.assetPath,
        input.fileName,
        input.mime,
        input.sizeBytes,
        input.kind ?? 'card-image',
        input.source ?? 'upload',
      ],
    );
  };

  const markDeleted = async (assetPath: string) => {
    await pool.query(
      `UPDATE uploaded_assets
       SET deleted_at = now(),
           updated_at = now()
       WHERE path = $1`,
      [assetPath],
    );
  };

  const getByPath = async (assetPath: string): Promise<UploadedAssetRecord | null> => {
    const result = await pool.query<{
      path: string;
      file_name: string;
      mime: string;
      size_bytes: string;
      kind: string;
      source: string;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    }>(
      `SELECT
        path,
        file_name,
        mime,
        size_bytes::text,
        kind,
        source,
        created_at::text,
        updated_at::text,
        deleted_at::text
       FROM uploaded_assets
       WHERE path = $1
       LIMIT 1`,
      [assetPath],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      path: row.path,
      fileName: row.file_name,
      mime: row.mime,
      sizeBytes: Number(row.size_bytes),
      kind: row.kind,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  };

  const listAssets = async (args?: {
    kind?: string;
    includeDeleted?: boolean;
    limit?: number;
  }): Promise<UploadedAssetRecord[]> => {
    const values: unknown[] = [];
    const where: string[] = [];
    if (args?.kind) {
      values.push(args.kind);
      where.push(`kind = $${values.length}`);
    }
    if (!args?.includeDeleted) {
      where.push('deleted_at IS NULL');
    }
    const limit = Math.max(1, Math.min(500, Number(args?.limit ?? 100)));
    values.push(limit);
    const result = await pool.query<{
      path: string;
      file_name: string;
      mime: string;
      size_bytes: string;
      kind: string;
      source: string;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    }>(
      `SELECT
        path,
        file_name,
        mime,
        size_bytes::text,
        kind,
        source,
        created_at::text,
        updated_at::text,
        deleted_at::text
       FROM uploaded_assets
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY updated_at DESC, path ASC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) => ({
      path: row.path,
      fileName: row.file_name,
      mime: row.mime,
      sizeBytes: Number(row.size_bytes),
      kind: row.kind,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    }));
  };

  const purgeMissingFiles = async (existingAssetPaths: Set<string>, kind?: string) => {
    const values: unknown[] = [];
    const where: string[] = ['deleted_at IS NULL'];
    if (kind) {
      values.push(kind);
      where.push(`kind = $${values.length}`);
    }
    const result = await pool.query<{ path: string }>(
      `SELECT path
       FROM uploaded_assets
       WHERE ${where.join(' AND ')}`,
      values,
    );
    let cleaned = 0;
    for (const row of result.rows) {
      if (existingAssetPaths.has(row.path)) continue;
      await markDeleted(row.path);
      cleaned += 1;
    }
    return cleaned;
  };

  const listKnownPaths = async (kind?: string) => {
    const values: unknown[] = [];
    const where: string[] = ['deleted_at IS NULL'];
    if (kind) {
      values.push(kind);
      where.push(`kind = $${values.length}`);
    }
    const result = await pool.query<{ path: string }>(
      `SELECT path
       FROM uploaded_assets
       WHERE ${where.join(' AND ')}`,
      values,
    );
    return new Set(result.rows.map((row) => row.path));
  };

  const syncDirectory = async (uploadsDir: string, kind = 'card-image', basePath = '/card-assets') => {
    const relativeFiles = await listRelativeFiles(uploadsDir);
    for (const relativeFile of relativeFiles) {
      const absPath = path.join(uploadsDir, relativeFile);
      const fileStat = await stat(absPath).catch(() => null);
      if (!fileStat?.isFile()) continue;
      const normalizedRelative = relativeFile.replace(/\\/g, '/');
      await upsertAsset({
        assetPath: `${basePath.replace(/\/+$/, '')}/${normalizedRelative}`,
        fileName: path.basename(normalizedRelative),
        mime: inferMime(normalizedRelative),
        sizeBytes: fileStat.size,
        kind,
        source: 'filesystem-sync',
      });
    }
  };

  return {
    ensureSchema,
    upsertAsset,
    markDeleted,
    getByPath,
    listAssets,
    purgeMissingFiles,
    listKnownPaths,
    syncDirectory,
  };
};
