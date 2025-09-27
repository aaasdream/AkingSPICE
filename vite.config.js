import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    open: '/buck-vite.html',
    cors: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './buck-vite.html'
      }
    }
  },
  resolve: {
    alias: {
      '@': './src'
    }
  },
  optimizeDeps: {
    include: ['chart.js']
  }
});