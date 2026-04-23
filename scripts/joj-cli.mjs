#!/usr/bin/env node
/**
 * JOJ Game CLI - Management commands for JOJ game server
 * Usage: node scripts/joj-cli.mjs [start|stop|restart|build|update|status]
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMANDS = {
  start: 'Start the game server using PM2',
  stop: 'Stop the game server',
  restart: 'Restart the game server',
  build: 'Build the application (tsc + vite)',
  update: 'Full update: git pull, npm install, build, restart',
  status: 'Show PM2 status',
  logs: 'Show PM2 logs',
};

const CMD = process.argv[2];

function run(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`> ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true,
      ...options,
    });
    child.on('close', (code) => {
      if (code === 0) resolve(code);
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

async function main() {
  const appRoot = path.resolve(__dirname, '..');
  process.chdir(appRoot);

  switch (CMD) {
    case 'start':
      await run('pm2', ['start', 'ecosystem.config.js']);
      break;

    case 'stop':
      await run('pm2', ['stop', 'all']);
      break;

    case 'restart':
      await run('pm2', ['restart', 'all']);
      break;

    case 'build':
      await run('npm', ['run', 'build']);
      break;

    case 'update':
      console.log('=== JOJ Update ===');
      console.log('1. Pulling from git...');
      await run('git', ['pull']);
      console.log('2. Installing dependencies...');
      await run('npm', ['install']);
      console.log('3. Building...');
      await run('npm', ['run', 'build']);
      console.log('4. Restarting services...');
      await run('pm2', ['restart', 'all']);
      console.log('=== Update complete ===');
      break;

    case 'status':
      await run('pm2', ['status']);
      break;

    case 'logs':
      await run('pm2', ['logs']);
      break;

    default:
      console.log('JOJ Game CLI\n');
      console.log('Usage: joj <command>\n');
      console.log('Commands:');
      Object.entries(COMMANDS).forEach(([cmd, desc]) => {
        console.log(`  ${cmd.padEnd(10)} ${desc}`);
      });
      console.log('\nExamples:');
      console.log('  joj update    # Full deploy workflow');
      console.log('  joj restart   # Quick restart after config change');
      console.log('  joj logs      # View live logs');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
