# Contributing

Thanks for helping. Issues and pull requests are welcome; for anything larger than a fix, open an issue first so we can agree on the shape before you spend time on it.

By taking part you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Developer Certificate of Origin

Every commit must be signed off, certifying that you wrote it or otherwise have the right to submit it under the project's licence ([developercertificate.org](https://developercertificate.org/)):

```sh
git commit -s -m "fix(browser-toolset): ..."
```

This adds a `Signed-off-by: Your Name <you@example.com>` line matching your Git identity. To sign off commits you already made on your branch: `git rebase --signoff main`.

## The dev loop

You need Node 22.18 or later (`node --test` runs the TypeScript source directly, with type stripping) and pnpm 11 (`corepack enable` picks up the version pinned in `package.json`).

```sh
pnpm install
pnpm test          # node --test in every package
pnpm type-check    # tsc in every package and example
pnpm lint          # ESLint (typescript-eslint) over the repo
pnpm format        # Prettier
pnpm build         # tsup: ESM plus .d.ts into each package's dist/
```

Run one package with `pnpm --filter @stdbl/browser-toolset test`.

Conventions:

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(browser-toolset): ...`, `fix: ...`, `docs: ...`).
- Source imports use explicit `.ts` extensions, and tests use `node:test` and `node:assert/strict`, so the source runs under `node --test` without a build. Avoid TypeScript syntax that type stripping rejects (parameter properties, enums, namespaces); `erasableSyntaxOnly` in `tsconfig.base.json` catches it.
- Packages have no runtime dependencies unless they truly need one. SDKs used only for types are optional `peerDependencies` (and `devDependencies` for type-checking).
- No emdash characters, in code or prose. British English in prose.

## Changesets

Every pull request that changes what a published package does includes a changeset:

```sh
pnpm changeset
```

Pick the packages, the bump (patch for fixes, minor for features, and while a package is below 1.0, minor for breaking changes too), and write a sentence or two for the changelog. Commit the generated file in `.changeset/` with your change. Changes to CI, docs or examples need none.

Releases are automatic. On every push to `main`, `.github/workflows/release.yml` runs [changesets/action](https://github.com/changesets/action): while changesets are pending it keeps a "Version packages" pull request open that bumps versions and writes changelogs, and merging that pull request publishes the new versions to npm with provenance. Maintainers never publish from a laptop.

## Adding a package

1. Create `packages/<name>/` with:
   - `package.json`: name `@stdbl/<name>`, version `0.0.0` (the first changeset sets the first real version), `"type": "module"`, `"license"`, `"repository"` with `"directory": "packages/<name>"`, `"files": ["dist", "src", "!src/**/*.test.ts", "README.md", "LICENSE"]`, `"publishConfig": { "access": "public", "provenance": true }`, and the scripts `build` (`tsup`), `type-check` (`tsc -p tsconfig.json`) and `test` (`node --test "src/**/*.test.ts"`). Copy `packages/browser-toolset/package.json` as a starting point.
   - `exports` with, for each entry point, an `@stdbl/source` condition pointing at the `.ts` source, then `types` and `default` pointing into `dist`. The source condition lets the examples and other workspace packages type-check and run against source without a build (`customConditions` in `tsconfig.base.json`, `node --conditions=@stdbl/source` at runtime).
   - `tsconfig.json` extending `../../tsconfig.base.json`, and `tsup.config.ts` listing the same entry points as `exports`.
   - `README.md` and a `LICENSE` file. A package may use a different licence from the rest of the repository; its own `LICENSE` and `license` field are what count.
2. Add a row to the packages table in the root `README.md`, and the package to the issue forms in `.github/ISSUE_TEMPLATE/`.
3. Run `pnpm install`, then the dev loop above. CI and the release workflow pick the package up from `packages/*` with no further changes.
4. Add a changeset (`pnpm changeset`, minor) so the first release goes out when it merges.

Examples that need extra dependencies live in `packages/<name>/examples/` as a private workspace package (see `packages/browser-toolset/examples`), and are listed under `ignore` in `.changeset/config.json`.

## Developing against unpublished changes from the Stunt Double monorepo

The Stunt Double product consumes these packages from npm. To try a change here in the product before it is released, check this repository out beside the monorepo:

```
~/code/stuntdouble
~/code/toolkit
```

Then, in the monorepo, override the package with a link to your checkout. pnpm 11 reads overrides from `pnpm-workspace.yaml` (with older pnpm, the same entry goes under `pnpm.overrides` in the root `package.json`):

```yaml
# stuntdouble/pnpm-workspace.yaml (do not commit)
overrides:
  '@stdbl/browser-toolset': link:../toolkit/packages/browser-toolset
```

Run `pnpm install` in the monorepo. The link resolves through the package's `exports`, so either build here once and keep it fresh with `pnpm --filter @stdbl/browser-toolset exec tsup --watch`, or, in a monorepo project whose TypeScript and runtime can read source, add the `@stdbl/source` condition (`customConditions` in its `tsconfig.json`, `--conditions=@stdbl/source` for Node) to use the TypeScript source directly.

Remove the override and run `pnpm install` again before committing in the monorepo; once the change is released, bump the version there instead.
