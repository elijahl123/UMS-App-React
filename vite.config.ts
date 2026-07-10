import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  optimizeDeps: {
    include: ['use-sync-external-store/shim', 'use-sync-external-store/shim/with-selector'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
