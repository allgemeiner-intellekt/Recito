import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Keep the fixture server independent of CRXJS, so it never rewrites the
// installed extension's production dist while running browser checks.
export default defineConfig({
  root: resolve(__dirname, '..'),
  resolve: { alias: { '@shared': resolve(__dirname, '../src/lib') } },
  server: { host: '127.0.0.1', port: 5174 },
});
