import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverPasswordReset } from '../server/services/user-recovery';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  PASSWORD_RESET_WEBHOOK_URL: process.env.PASSWORD_RESET_WEBHOOK_URL,
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN,
};

const restoreEnv = () => {
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  process.env.PASSWORD_RESET_WEBHOOK_URL = ORIGINAL_ENV.PASSWORD_RESET_WEBHOOK_URL;
  process.env.FRONTEND_ORIGIN = ORIGINAL_ENV.FRONTEND_ORIGIN;
};

test('password reset webhook rejects localhost target in production', async () => {
  process.env.NODE_ENV = 'production';
  process.env.PASSWORD_RESET_WEBHOOK_URL = 'https://127.0.0.1/reset-hook';
  process.env.FRONTEND_ORIGIN = 'https://joj.example';

  await assert.rejects(
    () => deliverPasswordReset({
      usernameOrEmail: 'tester@example.com',
      token: 'token-1',
      expiresAt: new Date().toISOString(),
      logLine: async () => undefined,
    }),
    /must not target localhost or private IP ranges in production/,
  );

  restoreEnv();
});

test('password reset webhook allows localhost http target in development', async () => {
  process.env.NODE_ENV = 'development';
  process.env.PASSWORD_RESET_WEBHOOK_URL = 'http://127.0.0.1:3001/reset-hook';
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

  const originalFetch = global.fetch;
  let calledUrl = '';
  global.fetch = (async (input: string | URL | Request) => {
    calledUrl = String(input);
    return { ok: true, status: 200 } as Response;
  }) as typeof fetch;

  try {
    const result = await deliverPasswordReset({
      usernameOrEmail: 'tester@example.com',
      token: 'token-2',
      expiresAt: new Date().toISOString(),
      logLine: async () => undefined,
    });
    assert.equal(result.mode, 'webhook');
    assert.equal(calledUrl, 'http://127.0.0.1:3001/reset-hook');
  } finally {
    global.fetch = originalFetch;
    restoreEnv();
  }
});
