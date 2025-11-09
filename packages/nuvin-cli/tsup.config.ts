import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['source/cli.tsx'],
  format: ['esm'],
  dts: false,
  clean: true,
  minify: true,
  target: 'node18',
  outDir: 'dist',
  // noExternal: ['ink'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.jsxImportSource = 'react';
    options.alias = {
      '@': './source',
    };
  },
  shims: true,
});
