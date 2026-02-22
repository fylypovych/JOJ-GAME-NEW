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
        FRONTEND_ORIGIN: 'https://your-domain.example',
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
