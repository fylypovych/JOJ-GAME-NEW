import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
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
