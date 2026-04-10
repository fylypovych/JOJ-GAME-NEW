import { readFileSync } from 'node:fs';

export const loadEnvFile = (envPath: string) => {
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (error) {
    // .env is optional, but log for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[env] Failed to load .env file from ${envPath}:`, error instanceof Error ? error.message : error);
    }
  }
};

