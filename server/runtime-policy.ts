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
  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  const frontendOrigin = (env.FRONTEND_ORIGIN ?? '').trim();
  const trustProxy = (env.TRUST_PROXY ?? '').trim();
  const missingDatabaseUrlInProduction = nodeEnv === 'production' && !databaseUrl;
  const missingFrontendOriginInProduction = nodeEnv === 'production' && !frontendOrigin;
  if (nodeEnv === 'production' && !trustProxy) {
    warnings.push('Production runtime should set TRUST_PROXY when running behind a reverse proxy.');
  }
  const startupError = missingDatabaseUrlInProduction
      ? 'Server cannot start in production without DATABASE_URL.'
      : missingFrontendOriginInProduction
        ? 'Server cannot start in production without FRONTEND_ORIGIN.'
        : '';

  return {
    nodeEnv,
    deprecatedEnvNames,
    warnings,
    startupError,
  };
};
