import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
export default defineConfig({
  main: { build: { rollupOptions: { input: { index: resolve('src/main/wheeldesk.ts') }, output: { format: 'cjs', entryFileNames: '[name].js' } } } },
  preload: { build: { rollupOptions: { input: { workbench: resolve('src/preload/workbench.ts') }, output: { format: 'cjs', entryFileNames: '[name].js' } } } },
  renderer: { root: resolve('src/renderer'), publicDir: false, plugins: [react()],
    build: { rollupOptions: { input: { workbench: resolve('src/renderer/workbench/index.html') } } } },
});
