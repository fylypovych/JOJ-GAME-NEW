import type { Pool } from 'pg';

export type PasswordResetDeliveryHealth = {
  status: 'unknown' | 'healthy' | 'degraded';
  ok: boolean | null;
  lastDegradedAt: string | null;
  lastDegradedMode: 'log' | 'error' | null;
  lastHealthyAt: string | null;
  lastError: string | null;
  observedSinceStartAt: string;
};

export type PublicPasswordResetDeliveryHealth = Omit<PasswordResetDeliveryHealth, 'lastError'>;

const createInitialState = (now = new Date().toISOString()): PasswordResetDeliveryHealth => ({
  status: 'unknown',
  ok: null,
  lastDegradedAt: null,
  lastDegradedMode: null,
  lastHealthyAt: null,
  lastError: null,
  observedSinceStartAt: now,
});

const state: PasswordResetDeliveryHealth = createInitialState();
let healthPool: Pool | null = null;
let pendingWrite = Promise.resolve();
const HEALTH_KEY = 'password_reset_delivery_health';

const normalizePersistedState = (value: unknown): Partial<PasswordResetDeliveryHealth> => {
  if (!value || typeof value !== 'object') return {};
  const payload = value as Record<string, unknown>;
  return {
    status: payload.status === 'healthy' || payload.status === 'degraded' ? payload.status : 'unknown',
    ok: typeof payload.ok === 'boolean' ? payload.ok : null,
    lastDegradedAt: typeof payload.lastDegradedAt === 'string' ? payload.lastDegradedAt : null,
    lastDegradedMode: payload.lastDegradedMode === 'log' || payload.lastDegradedMode === 'error' ? payload.lastDegradedMode : null,
    lastHealthyAt: typeof payload.lastHealthyAt === 'string' ? payload.lastHealthyAt : null,
    lastError: typeof payload.lastError === 'string' ? payload.lastError : null,
  };
};

const queuePersist = () => {
  if (!healthPool) return pendingWrite;
  const snapshot: PasswordResetDeliveryHealth = { ...state };
  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      if (!healthPool) return;
      await healthPool.query(
        `INSERT INTO app_settings (key, value, updated_by)
         VALUES ($1, $2::jsonb, 'password-reset-health')
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [HEALTH_KEY, JSON.stringify(snapshot)],
      );
    });
  return pendingWrite;
};

const replaceState = (nextState: PasswordResetDeliveryHealth) => {
  state.status = nextState.status;
  state.ok = nextState.ok;
  state.lastDegradedAt = nextState.lastDegradedAt;
  state.lastDegradedMode = nextState.lastDegradedMode;
  state.lastHealthyAt = nextState.lastHealthyAt;
  state.lastError = nextState.lastError;
  state.observedSinceStartAt = nextState.observedSinceStartAt;
};

export const initializePasswordResetDeliveryHealth = async (args?: {
  pool?: Pool | null;
  now?: string;
}) => {
  const now = args?.now ?? new Date().toISOString();
  healthPool = args?.pool ?? null;
  const nextState = createInitialState(now);
  if (healthPool) {
    try {
      const result = await healthPool.query<{ value: unknown }>(
        'SELECT value FROM app_settings WHERE key = $1 LIMIT 1',
        [HEALTH_KEY],
      );
      Object.assign(nextState, normalizePersistedState(result.rows[0]?.value));
    } catch {
      // Missing or invalid state should not block server startup.
    }
  }
  replaceState(nextState);
  return getPasswordResetDeliveryHealth();
};

export const flushPasswordResetDeliveryHealthWrites = () => pendingWrite.catch(() => undefined);

export const resetPasswordResetDeliveryHealthForTests = (args?: {
  now?: string;
  pool?: Pool | null;
}) => {
  healthPool = args?.pool ?? null;
  replaceState(createInitialState(args?.now));
  pendingWrite = Promise.resolve();
};

export const markPasswordResetDeliveryHealthy = (now = new Date().toISOString()) => {
  state.status = 'healthy';
  state.ok = true;
  state.lastHealthyAt = now;
  void queuePersist();
};

export const markPasswordResetDeliveryDegraded = (args: {
  mode: 'log' | 'error';
  error?: string;
  now?: string;
}) => {
  const now = args.now ?? new Date().toISOString();
  state.status = 'degraded';
  state.ok = false;
  state.lastDegradedAt = now;
  state.lastDegradedMode = args.mode;
  state.lastError = args.error ?? null;
  void queuePersist();
};

export const getPasswordResetDeliveryHealth = (): PasswordResetDeliveryHealth => ({ ...state });

export const getPublicPasswordResetDeliveryHealth = (): PublicPasswordResetDeliveryHealth => ({
  status: state.status,
  ok: state.ok,
  lastDegradedAt: state.lastDegradedAt,
  lastDegradedMode: state.lastDegradedMode,
  lastHealthyAt: state.lastHealthyAt,
  observedSinceStartAt: state.observedSinceStartAt,
});
