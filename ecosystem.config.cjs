const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '.env');
const readDotEnv = () => {
  const out = {};
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (!key) continue;
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
  } catch {
    // .env is optional
  }
  return out;
};

const dotenv = readDotEnv();
const envValue = (key, fallback) => process.env[key] ?? dotenv[key] ?? fallback;

module.exports = {
  apps: [
    {
      name: 'joj-game-server',
      script: 'npm',
      args: 'run start:server',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: String(envValue('PORT', '8000')),
        FRONTEND_ORIGIN: String(envValue('FRONTEND_ORIGIN', 'http://localhost:5173')),
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      time: true,
      out_file: 'logs/pm2-server.out.log',
      error_file: 'logs/pm2-server.err.log',
    },
    {
      name: 'joj-game-web',
      script: 'npm',
      args: `run preview -- --host 0.0.0.0 --port ${String(envValue('WEB_PORT', '4173'))}`,
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        VITE_PREVIEW_ALLOWED_HOSTS: String(
          envValue('VITE_PREVIEW_ALLOWED_HOSTS', 'joj.lol,www.joj.lol,localhost,127.0.0.1'),
        ),
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      time: true,
      out_file: 'logs/pm2-web.out.log',
      error_file: 'logs/pm2-web.err.log',
    },
  ],
};
