import { defineConfig } from 'rollup';

export default defineConfig([
  // UMD build for browsers
  {
    input: 'src/index.js',
    output: {
      file: 'lib-dist/AkingSPICE.umd.js',
      format: 'umd',
      name: 'AkingSPICE',
      sourcemap: true,
      exports: 'named', // 修復混合導出警告
      globals: {
        // Add any external dependencies here
      }
    },
    external: [], // List external dependencies that shouldn't be bundled
  },
  // ES Module build
  {
    input: 'src/index.js',
    output: {
      file: 'lib-dist/AkingSPICE.es.js',
      format: 'es',
      sourcemap: true
    },
    external: []
  }
]);