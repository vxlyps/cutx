import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const radice = resolve(import.meta.dirname, 'src/renderer');
const dist = resolve(import.meta.dirname, 'dist');

// Le mani (MediaPipe): il modello e il Wasm vanno dentro l'app (dist/mani), così non si scarica niente a ogni avvio.
// Il Wasm si copia da node_modules a ogni build (non sta nel repo); il modello sta in risorse/mani/.
const copiaMani = {
  name: 'copia-mani',
  closeBundle() {
    const dest = resolve(dist, 'mani');
    mkdirSync(resolve(dest, 'wasm'), { recursive: true });
    for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
      cpSync(resolve(import.meta.dirname, 'node_modules/@mediapipe/tasks-vision/wasm', f), resolve(dest, 'wasm', f));
    }
    cpSync(resolve(import.meta.dirname, 'risorse/mani/hand_landmarker.task'), resolve(dest, 'hand_landmarker.task'));
  },
};

export default defineConfig({
  root: radice,
  base: './',
  plugins: [copiaMani],
  build: {
    outDir: dist,
    emptyOutDir: true,
    target: 'esnext',
    chunkSizeWarningLimit: 2000, // Strudel è grosso, e gira in locale
    rollupOptions: {
      input: {
        index: resolve(radice, 'index.html'),
        motore: resolve(radice, 'motore.html'),
        uscita: resolve(radice, 'uscita.html'),
        mani: resolve(radice, 'mani.html'),
      },
    },
  },
});
