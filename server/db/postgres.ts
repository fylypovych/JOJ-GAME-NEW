import { Pool } from 'pg';

let sharedPool: Pool | null = null;
let memoryPool: Pool | null = null;

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

export const createMemoryPostgresPool = async (): Promise<Pool> => {
  if (memoryPool) return memoryPool;
  const { newDb, DataType } = await import('pg-mem');
  const { randomUUID } = await import('node:crypto');
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID(),
  });
  db.public.registerFunction({
    name: 'round',
    args: [DataType.float, DataType.integer],
    returns: DataType.float,
    implementation: (value: number, precision: number) => {
      const factor = 10 ** precision;
      return Math.round(value * factor) / factor;
    },
  });
  const { Pool: MemPool } = db.adapters.createPg();
  memoryPool = new MemPool() as Pool;
  return memoryPool;
};

export const closePostgresPool = async () => {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = null;
  await pool.end();
};

export const closeMemoryPostgresPool = async () => {
  if (!memoryPool) return;
  const pool = memoryPool;
  memoryPool = null;
  await pool.end();
};
