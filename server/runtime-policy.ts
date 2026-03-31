const hasDeprecatedFlagValue = (value: string | undefined) => (value ?? '').trim().length > 0;

export const getDeprecatedAdminAuthEnvNames = (env: NodeJS.ProcessEnv) => {
  const names: string[] = [];
  if (hasDeprecatedFlagValue(env.DISABLE_ADMIN_AUTH)) names.push('DISABLE_ADMIN_AUTH');
  if (hasDeprecatedFlagValue(env.ALLOW_INSECURE_ADMIN)) names.push('ALLOW_INSECURE_ADMIN');
  return names;
};

export const getAdminRuntimePolicy = (env: NodeJS.ProcessEnv) => {
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const deprecatedEnvNames = getDeprecatedAdminAuthEnvNames(env);
  const warnings = deprecatedEnvNames.length > 0
    ? [`Deprecated admin auth env vars are ignored: ${deprecatedEnvNames.join(', ')}.`]
    : [];
  const adminToken = (env.ADMIN_TOKEN ?? '').trim();
  const missingAdminTokenInProduction = nodeEnv === 'production' && !adminToken;
  const startupError = missingAdminTokenInProduction
    ? (
      deprecatedEnvNames.length > 0
        ? 'Server cannot start in production without ADMIN_TOKEN; deprecated admin override flags cannot bypass this requirement.'
        : 'Server cannot start in production without ADMIN_TOKEN.'
    )
    : '';

  return {
    nodeEnv,
    deprecatedEnvNames,
    warnings,
    startupError,
  };
};
