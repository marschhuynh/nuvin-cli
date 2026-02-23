import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false,
    reporters: ['default'],
  },
  esbuild: {
    target: 'es2020',
  },
});
