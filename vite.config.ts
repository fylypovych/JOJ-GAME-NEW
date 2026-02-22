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
    preview: {
      host: '0.0.0.0',
      allowedHosts: previewAllowedHosts,
    },
  };
});
