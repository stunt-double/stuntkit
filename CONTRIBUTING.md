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

Run one package with `pnpm --filter @stunt-double/browser-toolset test`.

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

When a change alters how a package is used, update its skill in `skills/` in the same pull request.

Pick the packages, the bump (patch for fixes, minor for features, and while a package is below 1.0, minor for breaking changes too), and write a sentence or two for the changelog. Commit the generated file in `.changeset/` with your change. Changes to CI, docs, examples or skills need none.

Releases are automatic. On every push to `main`, `.github/workflows/release.yml` runs [changesets/action](https://github.com/changesets/action): while changesets are pending it keeps a "Version packages" pull request open that bumps versions and writes changelogs, and merging that pull request publishes the new versions, tags each one (`@stunt-double/<name>@<version>`) and creates its GitHub release from the changelog entry. Maintainers never publish from a laptop.

Until the `@stunt-double` scope is available on npm, packages publish to GitHub Packages: each package's `publishConfig.registry` is `https://npm.pkg.github.com`, and the workflow authenticates with its own `GITHUB_TOKEN`, so no secret is needed. To move to npm, set `publishConfig` back to `{ "access": "public", "provenance": true }` and restore `id-token: write` and the npm settings in `release.yml`.

On npm, publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): the workflow swaps a GitHub OIDC token for a short-lived publish token, so the repository holds no npm secret. Each package needs a trusted publisher on npmjs.com (package settings, Trusted publishing: GitHub Actions, organisation `stunt-double`, repository `stuntkit`, workflow `release.yml`, no environment). npm only lets you add one to a package that already exists, so a brand new package's first version is bootstrapped once:

1. Create a granular access token on npmjs.com with read and write on the `@stunt-double` scope, short expiry, and save it as the `NPM_TOKEN` Actions secret.
2. Re-run the Release workflow (Actions, Release, Run workflow). It publishes every version npm does not have yet.
3. Add the trusted publisher to the new package, set "Require two-factor authentication and disallow tokens" under its publishing access, then delete the `NPM_TOKEN` secret and revoke the token.

## Adding a package

1. Create `packages/<name>/` with:
   - `package.json`: name `@stunt-double/<name>`, version `0.0.0` (the first changeset sets the first real version), `"type": "module"`, `"license"`, `"repository"` with `"directory": "packages/<name>"`, `"files": ["dist", "src", "!src/**/*.test.ts", "README.md", "LICENSE"]`, `"publishConfig": { "access": "public", "registry": "https://npm.pkg.github.com" }`, and the scripts `build` (`tsup`), `type-check` (`tsc -p tsconfig.json`) and `test` (`node --test "src/**/*.test.ts"`). Copy `packages/browser-toolset/package.json` as a starting point.
   - `exports` with, for each entry point, an `@stunt-double/source` condition pointing at the `.ts` source, then `types` and `default` pointing into `dist`. The source condition lets the examples and other workspace packages type-check and run against source without a build (`customConditions` in `tsconfig.base.json`, `node --conditions=@stunt-double/source` at runtime).
   - `tsconfig.json` extending `../../tsconfig.base.json`, and `tsup.config.ts` listing the same entry points as `exports`.
   - `README.md` and a `LICENSE` file. A package may use a different licence from the rest of the repository; its own `LICENSE` and `license` field are what count.
2. Add a row to the packages table in the root `README.md`, the package to the issue forms in `.github/ISSUE_TEMPLATE/` and to the checklist in `.github/pull_request_template.md`.
3. Write its agent skill in `skills/stunt-double-<name>/SKILL.md` (see [`skills/README.md`](./skills/README.md)), add it to the table there, and bump `version` in the plugin manifest.
4. Run `pnpm install`, then the dev loop above. CI and the release workflow pick the package up from `packages/*` with no further changes.
5. Add a changeset (`pnpm changeset`, minor) so the first release goes out when it merges, and bootstrap its first publish as described under Changesets above.

Examples that need extra dependencies live in `packages/<name>/examples/` as a private workspace package (see `packages/browser-toolset/examples`), and are listed under `ignore` in `.changeset/config.json`.

## Developing against unpublished changes from the Stunt Double monorepo

The Stunt Double product consumes these packages from npm. To try a change here in the product before it is released, check this repository out beside the monorepo:

```
~/code/stuntdouble
~/code/stuntkit
```

Then, in the monorepo, override the package with a link to your checkout. pnpm 11 reads overrides from `pnpm-workspace.yaml` (with older pnpm, the same entry goes under `pnpm.overrides` in the root `package.json`):

```yaml
# stuntdouble/pnpm-workspace.yaml (do not commit)
overrides:
  '@stunt-double/browser-toolset': link:../stuntkit/packages/browser-toolset
```

Run `pnpm install` in the monorepo. The link resolves through the package's `exports`, so either build here once and keep it fresh with `pnpm --filter @stunt-double/browser-toolset exec tsup --watch`, or, in a monorepo project whose TypeScript and runtime can read source, add the `@stunt-double/source` condition (`customConditions` in its `tsconfig.json`, `--conditions=@stunt-double/source` for Node) to use the TypeScript source directly.

Remove the override and run `pnpm install` again before committing in the monorepo; once the change is released, bump the version there instead.
