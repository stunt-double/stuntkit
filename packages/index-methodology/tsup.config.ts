import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    probe: 'src/probe/index.ts',
    'rubric-schema': 'src/rubric-schema.ts',
    'fix-prompt': 'src/fix-prompt.ts',
    leverage: 'src/leverage.ts',
    cli: 'src/cli.ts',
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
