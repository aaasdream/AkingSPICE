import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.js',
      name: 'JSSolverPE',
      fileName: (format) => `jssolver-pe.${format}.js`,
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