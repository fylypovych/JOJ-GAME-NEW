import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const previewAllowedHosts = (
  process.env.VITE_PREVIEW_ALLOWED_HOSTS ??
  'joj.lol,www.joj.lol,localhost,127.0.0.1,192.168.1.210'
)
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  preview: {
    host: '0.0.0.0',
    allowedHosts: previewAllowedHosts,
  },
});
