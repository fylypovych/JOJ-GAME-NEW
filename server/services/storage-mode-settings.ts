type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

export const STORAGE_MODE_POSTGRES_VALUE = { mode: 'postgres' } as const;
export const STORAGE_BACKEND_CAPABILITIES_POSTGRES_VALUE = {
  file: false,
  postgres: true,
  mysql: false,
} as const;

export const ensurePostgresStorageModeSettings = async (
  db: Queryable,
  updatedBy = 'server-postgres-init',
): Promise<void> => {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_by)
     VALUES
       ('storage_mode', $1::jsonb, $3),
       ('storage_backend_capabilities', $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [
      JSON.stringify(STORAGE_MODE_POSTGRES_VALUE),
      JSON.stringify(STORAGE_BACKEND_CAPABILITIES_POSTGRES_VALUE),
      updatedBy,
    ],
  );
};

