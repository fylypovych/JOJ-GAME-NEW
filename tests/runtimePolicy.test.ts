import test from 'node:test';
import assert from 'node:assert/strict';
import { getAdminRuntimePolicy, getDeprecatedAdminAuthEnvNames } from '../server/runtime-policy';

test('production runtime policy validates required env without legacy token auth', () => {
  const policy = getAdminRuntimePolicy({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost/db',
    FRONTEND_ORIGIN: 'https://joj.example',
  });

  assert.equal(policy.startupError, '');
  assert.ok(policy.warnings.some((warning) => warning.includes('TRUST_PROXY')));
});

test('deprecated admin override flags remain ignored and reported as warnings', () => {
  const policy = getAdminRuntimePolicy({
    NODE_ENV: 'production',
    ALLOW_INSECURE_ADMIN: '1',
    DISABLE_ADMIN_AUTH: 'true',
    DATABASE_URL: 'postgresql://user:pass@localhost/db',
    FRONTEND_ORIGIN: 'https://joj.example',
  });

  assert.equal(policy.startupError, '');
  assert.deepEqual(policy.deprecatedEnvNames, ['DISABLE_ADMIN_AUTH', 'ALLOW_INSECURE_ADMIN']);
  assert.ok(policy.warnings.some((warning) => warning.includes('Deprecated admin auth env vars are ignored')));
});

test('deprecated admin override flags produce warnings but do not block valid startup', () => {
  const policy = getAdminRuntimePolicy({
    NODE_ENV: 'production',
    ALLOW_INSECURE_ADMIN: '1',
    DATABASE_URL: 'postgresql://user:pass@localhost/db',
    FRONTEND_ORIGIN: 'https://joj.example',
  });

  assert.equal(policy.startupError, '');
  assert.ok(policy.warnings.includes('Deprecated admin auth env vars are ignored: ALLOW_INSECURE_ADMIN.'));
  assert.ok(policy.warnings.some((warning) => warning.includes('TRUST_PROXY')));
});

test('deprecated admin override helper returns only populated flags', () => {
  const names = getDeprecatedAdminAuthEnvNames({
    DISABLE_ADMIN_AUTH: '',
    ALLOW_INSECURE_ADMIN: 'yes',
  });

  assert.deepEqual(names, ['ALLOW_INSECURE_ADMIN']);
});

test('production requires DATABASE_URL', () => {
  const policy = getAdminRuntimePolicy({
    NODE_ENV: 'production',
    DATABASE_URL: '',
    FRONTEND_ORIGIN: 'https://joj.example',
  });

  assert.match(policy.startupError, /without DATABASE_URL/);
});

test('production requires FRONTEND_ORIGIN and warns about TRUST_PROXY', () => {
  const policy = getAdminRuntimePolicy({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost/db',
    FRONTEND_ORIGIN: '',
  });

  assert.match(policy.startupError, /without FRONTEND_ORIGIN/);
  assert.ok(policy.warnings.some((warning) => warning.includes('TRUST_PROXY')));
});
