import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverPasswordReset } from '../server/services/user-recovery';

test('password reset webhook rejects localhost target in production', async () => {
  await assert.rejects(
    () => deliverPasswordReset({
      usernameOrEmail: 'tester@example.com',
      token: 'token-1',
      expiresAt: new Date().toISOString(),
      logLine: async () => undefined,
      env: {
        NODE_ENV: 'production',
        PASSWORD_RESET_WEBHOOK_URL: 'https://127.0.0.1/reset-hook',
        FRONTEND_ORIGIN: 'https://joj.example',
      },
    }),
    /must not target localhost or private IP ranges in production/,
  );
});

test('password reset webhook allows localhost http target in development', async () => {
  let calledUrl = '';
  const fetchImpl = (async (input: string | URL | Request) => {
    calledUrl = String(input);
    return { ok: true, status: 200 } as Response;
  }) as typeof fetch;

  const result = await deliverPasswordReset({
    usernameOrEmail: 'tester@example.com',
    token: 'token-2',
    expiresAt: new Date().toISOString(),
    logLine: async () => undefined,
    env: {
      NODE_ENV: 'development',
      PASSWORD_RESET_WEBHOOK_URL: 'http://127.0.0.1:3001/reset-hook',
      FRONTEND_ORIGIN: 'http://localhost:5173',
    },
    fetchImpl,
  });
  assert.equal(result.mode, 'webhook');
  assert.equal(calledUrl, 'http://127.0.0.1:3001/reset-hook');
});

test('password reset smtp transport uses provided env instead of global process env', async () => {
  const originalSmtpHost = process.env.SMTP_HOST;
  const originalSmtpFrom = process.env.SMTP_FROM;
  process.env.SMTP_HOST = '';
  process.env.SMTP_FROM = '';

  const sentMessages: Array<{ from: string | undefined; to: string; subject: string }> = [];
  const mockTransporter = {
    sendMail: async (message: { from: string | undefined; to: string; subject: string }) => {
      sentMessages.push(message);
      return undefined;
    },
  };
  try {
    const result = await deliverPasswordReset({
      usernameOrEmail: 'tester@example.com',
      token: 'token-3',
      expiresAt: new Date().toISOString(),
      logLine: async () => undefined,
      env: {
        SMTP_HOST: 'smtp.test',
        SMTP_FROM: 'noreply@test.local',
        SMTP_PORT: '2525',
        FRONTEND_ORIGIN: 'http://localhost:5173',
      },
      getTransporterFn: async () => mockTransporter,
    });
    assert.equal(result.mode, 'smtp');
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0]?.from, 'noreply@test.local');
    assert.equal(sentMessages[0]?.to, 'tester@example.com');
  } finally {
    process.env.SMTP_HOST = originalSmtpHost;
    process.env.SMTP_FROM = originalSmtpFrom;
  }
});

test('password reset log fallback does not expose token or reset link', async () => {
  const logMessages: string[] = [];
  const result = await deliverPasswordReset({
    usernameOrEmail: 'tester@example.com',
    token: 'secret-token',
    expiresAt: '2026-03-25T10:00:00.000Z',
    logLine: async (_level, message) => { logMessages.push(message); },
    env: {
      FRONTEND_ORIGIN: 'http://localhost:5173',
    },
  });

  assert.equal(result.mode, 'log');
  assert.equal(logMessages.length, 1);
  assert.equal(logMessages[0]?.includes('secret-token'), false);
  assert.equal(logMessages[0]?.includes('resetToken='), false);
  assert.equal(logMessages[0]?.includes('resetLink'), false);
});
