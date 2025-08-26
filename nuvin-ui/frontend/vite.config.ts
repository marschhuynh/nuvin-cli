import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@wails/binding': path.resolve(__dirname, './bindings/nuvin-ui'),
      '@wails/services': path.resolve(__dirname, './bindings/nuvin-ui/services'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        // Exclude Node.js modules that shouldn't be bundled for browser
        'events',
        'fs',
        'path',
        'http',
        'https',
        'url',
        'querystring',
        'buffer',
        'stream',
        'util',
        'zlib',
        'crypto',
        'net',
        'async_hooks',
      ],
    },
  },
  test: {
    // Test environment
    environment: 'jsdom',

    // Global test configuration
    globals: true,

    // Setup files
    setupFiles: ['src/test/setup.ts', 'src/test/agent-test-setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: ['src/lib/agents/**/*.ts', 'src/lib/tools/**/*.ts', 'src/lib/providers/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/mocks/**'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },

    // Test timeout for async operations
    testTimeout: 10000,

    // Mock configuration
    clearMocks: true,
  },
});
