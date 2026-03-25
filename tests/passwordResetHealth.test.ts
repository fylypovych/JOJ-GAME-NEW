import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  flushPasswordResetDeliveryHealthWrites,
  getPasswordResetDeliveryHealth,
  initializePasswordResetDeliveryHealth,
  markPasswordResetDeliveryDegraded,
  markPasswordResetDeliveryHealthy,
  resetPasswordResetDeliveryHealthForTests,
} from '../server/services/password-reset-health';

test('password reset delivery health persists degraded state across reinitialization', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'joj-password-reset-health-'));
  const statePath = path.join(tempDir, 'password-reset-health.json');

  try {
    await initializePasswordResetDeliveryHealth({
      statePath,
      now: '2026-03-25T08:00:00.000Z',
    });
    markPasswordResetDeliveryDegraded({
      mode: 'error',
      error: 'smtp failed',
      now: '2026-03-25T08:05:00.000Z',
    });
    await flushPasswordResetDeliveryHealthWrites();

    const persisted = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, unknown>;
    assert.equal(persisted.status, 'degraded');
    assert.equal(persisted.lastError, 'smtp failed');

    resetPasswordResetDeliveryHealthForTests({
      now: '2026-03-25T08:10:00.000Z',
      statePath: '',
    });
    await initializePasswordResetDeliveryHealth({
      statePath,
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
      statePath: '',
    });
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('password reset delivery health persists healthy state without carrying previous startup time', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'joj-password-reset-health-'));
  const statePath = path.join(tempDir, 'password-reset-health.json');

  try {
    await initializePasswordResetDeliveryHealth({
      statePath,
      now: '2026-03-25T11:00:00.000Z',
    });
    markPasswordResetDeliveryHealthy('2026-03-25T11:05:00.000Z');
    await flushPasswordResetDeliveryHealthWrites();

    resetPasswordResetDeliveryHealthForTests({
      now: '2026-03-25T11:10:00.000Z',
      statePath: '',
    });
    await initializePasswordResetDeliveryHealth({
      statePath,
      now: '2026-03-25T12:00:00.000Z',
    });

    assert.equal(getPasswordResetDeliveryHealth().status, 'healthy');
    assert.equal(getPasswordResetDeliveryHealth().lastHealthyAt, '2026-03-25T11:05:00.000Z');
    assert.equal(getPasswordResetDeliveryHealth().observedSinceStartAt, '2026-03-25T12:00:00.000Z');
  } finally {
    resetPasswordResetDeliveryHealthForTests({
      now: '2026-03-25T12:30:00.000Z',
      statePath: '',
    });
    await rm(tempDir, { recursive: true, force: true });
  }
});
