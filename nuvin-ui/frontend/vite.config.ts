import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@wails/runtime': path.resolve(__dirname, './wailsjs/runtime/runtime.js'),
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
});
