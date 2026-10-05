// Points every published package at GitHub Packages, for the release job only.
// GitHub Packages accepts only the scope of the repository owner, so @stdbl/*
// publishes as @stunt-double/*. GitHub Packages has no npm provenance either.
// Delete this script, and its use in `release:github`, once npm releases the
// @stdbl scope.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

for (const dir of readdirSync('packages')) {
  const file = `packages/${dir}/package.json`;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (pkg.private) continue;
  pkg.name = pkg.name.replace(/^@stdbl\//, '@stunt-double/');
  pkg.publishConfig = { access: 'public', registry: 'https://npm.pkg.github.com' };
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}
