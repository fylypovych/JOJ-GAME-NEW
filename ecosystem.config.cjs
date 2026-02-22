module.exports = {
  apps: [
    {
      name: 'joj-game-server',
      script: 'npm',
      args: 'run start:server',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: '8000',
        // Intentionally omitted: FRONTEND_ORIGIN should come from .env or shell env.
        // Hardcoding here can override .env and break CORS during LAN/HTTPS tests.
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
      args: 'run preview -- --host 0.0.0.0 --port 4173',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        // Comma-separated list for Vite preview host allowlist (optional)
        // VITE_PREVIEW_ALLOWED_HOSTS: 'joj.lol,www.joj.lol,192.168.1.210',
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
