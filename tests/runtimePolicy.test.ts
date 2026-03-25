import test from 'node:test';
import assert from 'node:assert/strict';
import { getAdminRuntimePolicy, getDeprecatedAdminAuthEnvNames } from '../server/runtime-policy';

test('production requires ADMIN_TOKEN', () => {
  const policy = getAdminRuntimePolicy({
    NODE_ENV: 'production',
    ADMIN_TOKEN: '',
  });

  assert.match(policy.startupError, /without ADMIN_TOKEN/);
  assert.deepEqual(policy.warnings, []);
});

test('production error explains deprecated admin override flags are ignored', () => {
  const policy = getAdminRuntimePolicy({
    NODE_ENV: 'production',
    ADMIN_TOKEN: '',
    ALLOW_INSECURE_ADMIN: '1',
    DISABLE_ADMIN_AUTH: 'true',
  });

  assert.match(policy.startupError, /cannot bypass this requirement/);
  assert.deepEqual(policy.deprecatedEnvNames, ['DISABLE_ADMIN_AUTH', 'ALLOW_INSECURE_ADMIN']);
});

test('deprecated admin override flags produce warnings but do not block valid startup', () => {
  const policy = getAdminRuntimePolicy({
    NODE_ENV: 'production',
    ADMIN_TOKEN: 'secret',
    ALLOW_INSECURE_ADMIN: '1',
  });

  assert.equal(policy.startupError, '');
  assert.deepEqual(policy.warnings, ['Deprecated admin auth env vars are ignored: ALLOW_INSECURE_ADMIN.']);
});

test('deprecated admin override helper returns only populated flags', () => {
  const names = getDeprecatedAdminAuthEnvNames({
    DISABLE_ADMIN_AUTH: '',
    ALLOW_INSECURE_ADMIN: 'yes',
  });

  assert.deepEqual(names, ['ALLOW_INSECURE_ADMIN']);
});
