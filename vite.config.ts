import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './app/test/setup.ts',
    css: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
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
