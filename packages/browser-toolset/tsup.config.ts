import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    driver: 'src/driver.ts',
    executor: 'src/executor.ts',
    keys: 'src/keys.ts',
    'page-script': 'src/page-script.ts',
    'direct-tools': 'src/direct-tools.ts',
    safety: 'src/safety.ts',
    prune: 'src/prune.ts',
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
  external: ['@anthropic-ai/sdk', 'ai'],
});
