/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 100000 },
  test: { environment: 'node', globals: true, include: ['tests/**/*.test.ts'] },
});
