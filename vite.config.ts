import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  root: path.resolve(import.meta.dirname, 'src/renderer'),
  publicDir: path.resolve(import.meta.dirname, 'public'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(import.meta.dirname, 'src/renderer'),
      '@main': path.resolve(import.meta.dirname, 'src/main'),
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
