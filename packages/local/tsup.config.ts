import { copyFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // browser-toolset is on GitHub Packages, not npm: bundled from its source, so
  // installing this package needs nothing from there.
  noExternal: ['@stunt-double/browser-toolset'],
  esbuildOptions(options) {
    options.conditions = ['@stunt-double/source'];
  },
  onSuccess: () => copyFile('src/ui.html', 'dist/ui.html'),
});
