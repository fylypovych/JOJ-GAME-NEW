import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const { parseVersionFromCommitMessage } = require('./scripts/version-from-commit.cjs') as {
  parseVersionFromCommitMessage: (message: string) => string;
};

const safeRunGit = (args: string[]) => {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim();
  } catch {
    return '';
  }
};

const resolveGitBuildInfo = () => {
  const commit = safeRunGit(['rev-parse', '--short=8', 'HEAD']);
  const commitMessage = safeRunGit(['log', '-1', '--pretty=%B']);
  const version = parseVersionFromCommitMessage(commitMessage);
  const label = version
    ? `v${version}`
    : (commit ? `commit ${commit}` : '');
  return { commit, version, label };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildInfo = resolveGitBuildInfo();
  const previewAllowedHosts = (
    env.VITE_PREVIEW_ALLOWED_HOSTS ??
    process.env.VITE_PREVIEW_ALLOWED_HOSTS ??
    'joj.lol,www.joj.lol,localhost,127.0.0.1'
  )
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  return {
    plugins: [react()],
    define: {
      __APP_BUILD_COMMIT__: JSON.stringify(buildInfo.commit),
      __APP_BUILD_VERSION__: JSON.stringify(buildInfo.version),
      __APP_BUILD_LABEL__: JSON.stringify(buildInfo.label),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/');
            if (normalizedId.includes('/node_modules/boardgame.io/')) return 'boardgame-vendor';
            if (normalizedId.includes('/node_modules/html2canvas/')) return 'capture-vendor';
            if (normalizedId.includes('/src/ui/board/')) return 'board-ui';
            if (normalizedId.includes('/src/game/')) return 'game-core';
            if (normalizedId.includes('/src/ui/app/sections.tsx')) return 'app-sections';
            if (normalizedId.includes('/node_modules/')) return 'vendor';
            return undefined;
          },
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts: previewAllowedHosts,
    },
  };
});
