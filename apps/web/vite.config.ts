import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const pages = [
  'png-to-svg',
  'free-logo-vectorizer',
  'vectorizer-ai-alternative',
  'jpg-to-svg',
  'image-to-svg-converter',
];

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      'trace-vectorizer': resolve(here, '../../packages/trace-vectorizer/src/index.ts'),
    },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        ...Object.fromEntries(pages.map((p) => [p, resolve(here, `pages/${p}.html`)])),
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
