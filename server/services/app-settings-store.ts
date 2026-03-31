import type { Pool } from 'pg';

export const loadAppSettingJson = async <T>(
  pool: Pool | null | undefined,
  key: string,
): Promise<T | null> => {
  if (!pool) return null;
  const result = await pool.query<{ value: unknown }>(
    'SELECT value FROM app_settings WHERE key = $1 LIMIT 1',
    [key],
  );
  if (!result.rowCount) return null;
  return (result.rows[0]?.value ?? null) as T | null;
};

export const saveAppSettingJson = async <T>(
  pool: Pool | null | undefined,
  key: string,
  value: T,
  updatedBy = 'server',
): Promise<T> => {
  if (!pool) return value;
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
    [key, JSON.stringify(value), updatedBy],
  );
  return value;
};
