import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const radice = resolve(import.meta.dirname, 'src/renderer');

export default defineConfig({
  root: radice,
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'esnext',
    chunkSizeWarningLimit: 2000, // Strudel è grosso, e gira in locale
    rollupOptions: {
      input: {
        index: resolve(radice, 'index.html'),
        motore: resolve(radice, 'motore.html'),
      },
    },
  },
});
