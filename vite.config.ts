import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https: maja-artwork:",
  "media-src 'self' blob: maja-audio:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const DEV_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY
  .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  .replace(
    "connect-src 'self'",
    "connect-src 'self' ws://localhost:5173 http://localhost:5173"
  );

function injectCspMeta(): Plugin {
  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        /<head>/i,
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), injectCspMeta()],
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
    headers: {
      'Content-Security-Policy': DEV_CONTENT_SECURITY_POLICY,
    },
  },
  preview: {
    headers: {
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    },
  },
});
