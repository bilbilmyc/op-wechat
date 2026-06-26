import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for op-wechat SPA.
// In dev: serves on 0.0.0.0:5173, proxies /api and /webhook to the host
// machine's exposed backend ports (so HMR works without going through nginx).
// In prod: builds static files; nginx serves them.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/webhook': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
});
