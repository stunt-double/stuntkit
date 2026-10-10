---
name: adding-a-stuntkit-package
description: Use when adding a new package to the stuntkit repository, or extracting code from another codebase into one. Covers deciding whether it belongs here, the package.json exports shape with the @stunt-double/source condition, tsconfig and tsup, the README, the consumer skill, and wiring it into the root README, issue forms, PR template and first release.
---

# Adding a package to stuntkit

## Does it belong here?

StuntKit is for developers building agents that use the web, and for sites that want to work for those agents. A package belongs when it:

- solves a problem a developer outside Stunt Double has, without needing Stunt Double's product or services;
- has a small, stable API that can be documented in one README;
- has no runtime dependencies, or only ones it truly needs.

Product glue, brand-only assets with no developer use, or code that changes weekly with the product does not.

## Steps

1. **Scaffold** `packages/<name>/` from `packages/browser-toolset` (copy `package.json`, `tsconfig.json`, `tsup.config.ts`, `LICENSE`):
   - `name` `@stunt-double/<name>`, `version` `0.0.0`, `"type": "module"`, `repository.directory` `packages/<name>`, `"sideEffects": false` unless there truly are some.
   - `files`: `["dist", "src", "!src/**/*.test.ts", "README.md", "LICENSE"]`.
   - `publishConfig`: `{ "access": "public", "registry": "https://npm.pkg.github.com" }`.
   - Scripts: `build` (`tsup`), `type-check` (`tsc -p tsconfig.json`), `test` (`node --test "src/**/*.test.ts"`), `prepack` (`pnpm run build`).
   - Each `exports` entry: `"@stunt-double/source"` (the `.ts` source) first, then `types`, then `default`. List the same entries in `tsup.config.ts`.
2. **Write it** to the conventions in the `contributing-to-stuntkit` skill, with tests beside the source.
3. **README**: what it does and for whom in the first paragraph, a short example, install (with the GitHub Packages note the other READMEs carry), the API, what it does not do, licence.
4. **Consumer skill**: `skills/stunt-double-<name>/SKILL.md`, following `skills/README.md`. Add its row to the table there, and bump `version` in the plugin manifest.
5. **Wire it in**:
   - A row in the packages table in the root `README.md`.
   - An option in the package dropdowns in `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml`.
   - A checkbox in `.github/pull_request_template.md`.
   - Private example packages go in `packages/<name>/examples/` and under `ignore` in `.changeset/config.json`.
6. **Verify**: `pnpm install`, then the full dev loop, then `pnpm -r --filter "./packages/*" exec npm pack --dry-run --ignore-scripts` to see exactly what ships.
7. **Release**: `pnpm changeset`, minor, so the first version goes out on merge. The first publish of a brand new package on npm needs the one-time bootstrap in `CONTRIBUTING.md` (not needed while releases go to GitHub Packages).
