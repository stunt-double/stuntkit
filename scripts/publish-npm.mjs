// Publishes the packages that live on npm rather than GitHub Packages
// (today only `stuntdouble`), before `changeset publish` runs. changesets
// publishes through `pnpm publish`; this uses `npm publish` so npm's trusted
// publishing (the GitHub Actions OIDC exchange, npm 11.5.1 or later) and
// provenance apply. A version npm already has is skipped, so a re-run is safe.
//
// Each published version is tagged `<name>@<version>` and printed as
// "New tag:", the line changesets/action reads to push tags and create the
// GitHub release.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NPM_PACKAGES = ['packages/local'];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] })
    .toString()
    .trim();

for (const dir of NPM_PACKAGES) {
  const { name, version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  let published = '';
  try {
    published = run('npm', [
      'view',
      `${name}@${version}`,
      'version',
      '--registry',
      'https://registry.npmjs.org',
    ]);
  } catch {
    // 404: not published yet.
  }
  if (published === version) {
    console.log(`${name}@${version} is already on npm`);
    continue;
  }
  execFileSync('npm', ['publish', '--access', 'public', '--provenance'], {
    cwd: dir,
    stdio: 'inherit',
  });
  const tag = `${name}@${version}`;
  run('git', ['tag', tag]);
  console.log(`New tag: ${tag}`);
}
