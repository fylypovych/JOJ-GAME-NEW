import { Pool } from 'pg';

let sharedPool: Pool | null = null;

export const createPostgresPool = (databaseUrl: string): Pool => {
  if (!databaseUrl.trim()) {
    throw new Error('DATABASE_URL is required for user module');
  }
  if (sharedPool) return sharedPool;
  sharedPool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return sharedPool;
};

export const closePostgresPool = async () => {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = null;
  await pool.end();
};
