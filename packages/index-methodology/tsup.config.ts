import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'rubric-schema': 'src/rubric-schema.ts',
  },
  format: ['esm'],
  target: 'es2022',
  platform: 'neutral',
  // tsup's declaration build sets `baseUrl`, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: ['zod'],
});
