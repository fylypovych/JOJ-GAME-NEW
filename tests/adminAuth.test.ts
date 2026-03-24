import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdminMutationAuth } from '../server/admin-auth';

test('admin mutation auth rejects cookie-backed admin POST without csrf token', async () => {
  const ctx = {
    request: {
      headers: {
        cookie: 'joj_user_session=session-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
    },
  };

  const ok = await requireAdminMutationAuth(
    ctx,
    '/api/admin/restart',
    async () => true,
  );

  assert.equal(ok, false);
  assert.equal(ctx.status, 403);
});

test('admin mutation auth accepts explicit admin token without csrf token', async () => {
  const ctx = {
    request: {
      headers: {
        'x-admin-token': 'admin-secret',
      },
    },
  };

  const ok = await requireAdminMutationAuth(
    ctx,
    '/api/admin/restart',
    async () => true,
  );

  assert.equal(ok, true);
});

test('admin mutation auth accepts cookie-backed admin POST with csrf token', async () => {
  const ctx = {
    request: {
      headers: {
        cookie: 'joj_user_session=session-token; joj_user_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
        host: 'localhost:8000',
        origin: 'http://localhost:8000',
      },
    },
  };

  const ok = await requireAdminMutationAuth(
    ctx,
    '/api/admin/restart',
    async () => true,
  );

  assert.equal(ok, true);
});
