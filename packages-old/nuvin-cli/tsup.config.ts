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
    options.define = {
      ...options.define,
      'process.env.NODE_ENV': '"production"',
    };
    options.jsx = 'automatic';
    options.jsxImportSource = 'react';
    options.alias = {
      '@': './source',
    };
    // Enable ?raw imports for markdown files
    options.loader = {
      ...options.loader,
      '.md': 'text',
    };
  },
  shims: true,
});
