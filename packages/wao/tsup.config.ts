import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'es2020',
    platform: 'browser',
    // tsup's declaration build sets `baseUrl`, which TypeScript 6 deprecates.
    dts: {
      compilerOptions: { ignoreDeprecations: '6.0' },
      // The handle is `Disposable`. The bundler drops the source's lib
      // reference, so restore it for consumers whose `lib` predates it.
      banner: '/// <reference lib="esnext.disposable" />',
    },
    sourcemap: true,
    clean: true,
    treeshake: true,
  },
  {
    // The drop-in `<script>` build: one minified file, no module loader.
    entry: { wao: 'src/script.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.global.js' }),
    target: 'es2020',
    platform: 'browser',
    minify: true,
    sourcemap: true,
  },
]);
