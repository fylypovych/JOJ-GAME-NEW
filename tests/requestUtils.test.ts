import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequireAdminAuth, setCookieHeader } from '../server/request-utils';

test('setCookieHeader appends multiple cookies instead of overwriting them', async () => {
  const headerState = new Map<string, string | string[]>();
  const ctx = {
    response: { headers: {} as Record<string, string | string[]> },
    set(name: string, value: string | string[]) {
      headerState.set(name, value);
    },
  };

  setCookieHeader(ctx, 'first', 'one', { httpOnly: true, sameSite: 'Lax' });
  setCookieHeader(ctx, 'second', 'two', { httpOnly: false, sameSite: 'Lax' });

  const setCookie = headerState.get('Set-Cookie');
  assert.ok(Array.isArray(setCookie));
  assert.equal(setCookie.length, 2);
  assert.match(setCookie[0], /^first=one;/);
  assert.match(setCookie[1], /^second=two;/);
});

test('createRequireAdminAuth rejects when admin token is disabled and there is no admin session', async () => {
  const requireAdminAuth = createRequireAdminAuth({
    isAdminAuthEnabled: false,
    adminToken: '',
    logLine: async () => undefined,
    getUserStore: () => ({
      getUserBySessionToken: async () => null,
    }),
  });
  const ctx = {
    request: {
      headers: {},
    },
  };

  const ok = await requireAdminAuth(ctx, '/api/admin/verify');
  assert.equal(ok, false);
  assert.equal(ctx.status, 401);
});

