import test from 'node:test';
import assert from 'node:assert/strict';
import {
  flushPasswordResetDeliveryHealthWrites,
  getPasswordResetDeliveryHealth,
  initializePasswordResetDeliveryHealth,
  markPasswordResetDeliveryDegraded,
  markPasswordResetDeliveryHealthy,
  resetPasswordResetDeliveryHealthForTests,
} from '../server/services/password-reset-health';

const createSettingsPool = (initial: Record<string, unknown> = {}) => {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    pool: {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT value FROM app_settings')) {
          const key = String(params?.[0] ?? '');
          const value = store.get(key);
          return value === undefined
            ? { rowCount: 0, rows: [] }
            : { rowCount: 1, rows: [{ value }] };
        }
        if (sql.includes('INSERT INTO app_settings')) {
          const key = String(params?.[0] ?? '');
          const rawValue = String(params?.[1] ?? 'null');
          store.set(key, JSON.parse(rawValue));
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
    },
    getSetting: (key: string) => store.get(key),
  };
};

test('password reset delivery health persists degraded state across reinitialization', async () => {
  const settings = createSettingsPool();

  try {
    await initializePasswordResetDeliveryHealth({
      pool: settings.pool as never,
      now: '2026-03-25T08:00:00.000Z',
    });
    markPasswordResetDeliveryDegraded({
      mode: 'error',
      error: 'smtp failed',
      now: '2026-03-25T08:05:00.000Z',
    });
    await flushPasswordResetDeliveryHealthWrites();

    const persisted = settings.getSetting('password_reset_delivery_health') as Record<string, unknown>;
    assert.equal(persisted.status, 'degraded');
    assert.equal(persisted.lastError, 'smtp failed');

    resetPasswordResetDeliveryHealthForTests({
      now: '2026-03-25T08:10:00.000Z',
      pool: null,
    });
    await initializePasswordResetDeliveryHealth({
      pool: settings.pool as never,
      now: '2026-03-25T09:00:00.000Z',
    });

    assert.deepEqual(getPasswordResetDeliveryHealth(), {
      status: 'degraded',
      ok: false,
      lastDegradedAt: '2026-03-25T08:05:00.000Z',
      lastDegradedMode: 'error',
      lastHealthyAt: null,
      lastError: 'smtp failed',
      observedSinceStartAt: '2026-03-25T09:00:00.000Z',
    });
  } finally {
    resetPasswordResetDeliveryHealthForTests({
      now: '2026-03-25T10:00:00.000Z',
      pool: null,
    });
  }
});

test('password reset delivery health persists healthy state without carrying previous startup time', async () => {
  const settings = createSettingsPool();

  try {
    await initializePasswordResetDeliveryHealth({
      pool: settings.pool as never,
      now: '2026-03-25T11:00:00.000Z',
    });
    markPasswordResetDeliveryHealthy('2026-03-25T11:05:00.000Z');
    await flushPasswordResetDeliveryHealthWrites();

    resetPasswordResetDeliveryHealthForTests({
      now: '2026-03-25T11:10:00.000Z',
      pool: null,
    });
    await initializePasswordResetDeliveryHealth({
      pool: settings.pool as never,
      now: '2026-03-25T12:00:00.000Z',
    });

    assert.equal(getPasswordResetDeliveryHealth().status, 'healthy');
    assert.equal(getPasswordResetDeliveryHealth().lastHealthyAt, '2026-03-25T11:05:00.000Z');
    assert.equal(getPasswordResetDeliveryHealth().observedSinceStartAt, '2026-03-25T12:00:00.000Z');
  } finally {
    resetPasswordResetDeliveryHealthForTests({
      now: '2026-03-25T12:30:00.000Z',
      pool: null,
    });
  }
});
