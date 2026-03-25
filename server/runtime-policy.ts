const hasDeprecatedFlagValue = (value: string | undefined) => (value ?? '').trim().length > 0;

export const getDeprecatedAdminAuthEnvNames = (env: NodeJS.ProcessEnv) => {
  const names: string[] = [];
  if (hasDeprecatedFlagValue(env.DISABLE_ADMIN_AUTH)) names.push('DISABLE_ADMIN_AUTH');
  if (hasDeprecatedFlagValue(env.ALLOW_INSECURE_ADMIN)) names.push('ALLOW_INSECURE_ADMIN');
  return names;
};

export const getAdminRuntimePolicy = (env: NodeJS.ProcessEnv) => {
  const adminToken = (env.ADMIN_TOKEN ?? '').trim();
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const deprecatedEnvNames = getDeprecatedAdminAuthEnvNames(env);
  const warnings = deprecatedEnvNames.length > 0
    ? [`Deprecated admin auth env vars are ignored: ${deprecatedEnvNames.join(', ')}.`]
    : [];

  if (!adminToken && nodeEnv === 'production') {
    const deprecatedDetail = deprecatedEnvNames.length > 0
      ? ` Deprecated env vars cannot bypass this requirement: ${deprecatedEnvNames.join(', ')}.`
      : '';
    return {
      adminToken,
      nodeEnv,
      deprecatedEnvNames,
      warnings,
      startupError: `Refusing to start in production without ADMIN_TOKEN.${deprecatedDetail}`,
    };
  }

  return {
    adminToken,
    nodeEnv,
    deprecatedEnvNames,
    warnings,
    startupError: '',
  };
};
