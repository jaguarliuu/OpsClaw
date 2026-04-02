import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { resolveManualChunk } from './build/viteManualChunks';
import { resolveViteBase } from './build/viteBase';

export default defineConfig(({ command }) => ({
  base: resolveViteBase(command),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
}));
