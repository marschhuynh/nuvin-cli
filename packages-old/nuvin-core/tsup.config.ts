import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  minify: false,
  target: 'node18',
  external: [
    'node:*',
    'fs',
    'path',
    'os',
    'crypto',
    'child_process',
    'stream',
    'util',
    'events',
    'url',
    'buffer',
    'process',
    'module',
    '../lib/node-pty/index.cjs',
  ],
  outDir: 'dist',
  noExternal: [],
  loader: {
    '.cjs': 'copy',
  },
  esbuildOptions(options) {
    options.define = {
      ...options.define,
      'process.env.NODE_ENV': '"production"',
    };
  },
});
