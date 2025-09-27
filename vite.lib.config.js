import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.js',
      name: 'AkingSPICE',
      fileName: (format) => `AkingSPICE.${format}.js`,
      formats: ['es', 'umd']
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    },
    outDir: 'lib-dist',
    emptyOutDir: true,
    sourcemap: true
  }
});