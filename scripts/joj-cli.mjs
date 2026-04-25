#!/usr/bin/env node
/**
 * JOJ Game CLI - Management commands for JOJ game server
 * Usage: joj [start|stop|restart|build|update|status|logs]
 * Works from any directory - auto-finds project
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Possible project locations (in order of priority)
const PROJECT_PATHS = [
  // From CLI location (development)
  path.resolve(__dirname, '..'),
  // Production server paths
  '/var/www/joj-game',
  '/opt/joj-game',
  '/home/joj/joj-game',
  // Current working directory if it looks like joj project
  process.cwd(),
];

function findProjectRoot() {
  // First check if we're in a joj project already
  const cwd = process.cwd();
  const cwdPkg = path.join(cwd, 'package.json');
  if (fs.existsSync(cwdPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(cwdPkg, 'utf8'));
      if (pkg.name === 'joj-game-new') {
        return cwd;
      }
    } catch {}
  }

  // Check known paths
  for (const projectPath of PROJECT_PATHS) {
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'joj-game-new') {
          return projectPath;
        }
      } catch {}
    }
  }

  return null;
}

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
  const projectRoot = findProjectRoot();
  
  if (!projectRoot) {
    console.error('Error: Could not find joj-game project root.');
    console.error('Searched in:');
    PROJECT_PATHS.forEach(p => console.error(`  - ${p}`));
    console.error('\nMake sure you are in the project directory or the project is installed at a known location.');
    process.exit(1);
  }

  console.log(`Working in: ${projectRoot}\n`);
  process.chdir(projectRoot);

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
      console.log('  joj status    # Check service status');
      console.log('  joj logs      # View live logs');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
