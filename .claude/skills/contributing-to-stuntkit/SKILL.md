---
name: contributing-to-stuntkit
description: Use when changing anything in the stuntkit repository: editing a package's source, tests, README or skill, adding a changeset, committing, or opening a pull request. Covers the dev loop, the source conventions that let node --test run TypeScript directly, changesets and releases, and the rules for a public repository.
---

# Working in stuntkit

A public pnpm workspace of npm packages under `@stunt-double/*` (`packages/*`), released with Changesets to GitHub Packages. Read `CONTRIBUTING.md` for the long form; this is the checklist.

## Before you push

Everything CI runs, from the root:

```sh
pnpm format:check   # or pnpm format
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

One package: `pnpm --filter @stunt-double/<name> test`. CI runs Node 22 and 24, so do not use syntax Node 22 cannot parse in tests (for example `using` declarations).

## Source conventions

- Imports carry their `.ts` extension, and tests use `node:test` with `node:assert/strict`, so `node --test` runs source with no build.
- Only erasable TypeScript (no enums, namespaces or parameter properties); `erasableSyntaxOnly` enforces it.
- No runtime dependencies unless truly needed. SDKs used only for types are optional `peerDependencies` plus `devDependencies`.
- DOM packages test with `happy-dom`. When happy-dom misbehaves (it hangs on `insertAdjacentHTML` inside a shadow root), build nodes with `createElement` and say why in a comment.
- Check what ships, not just what compiles: after `pnpm build`, read the package's `dist/*.d.ts`. The declaration bundler can drop things the source relies on (a `/// <reference lib>`, for example), and a consumer without `skipLibCheck` sees the error.

## Prose and copy

British English in prose, no emdash characters anywhere (code, comments, docs, changesets). Package READMEs lead with what the package does for the reader, then install, then the API.

## Changesets

Any change to what a published package does needs one:

```sh
pnpm changeset
```

Patch for fixes, minor for features. Packages below 1.0 take minor for breaking changes. CI, docs, examples and skills need none. Merging to `main` opens or updates the "Version packages" PR; merging that publishes. Never publish by hand.

When a package's behaviour changes, update its skill in `skills/stunt-double-<name>/SKILL.md` in the same PR, and bump `version` in the plugin manifest.

## Commits and pull requests

- Conventional Commits: `feat(wao): ...`, `fix(browser-toolset): ...`, `docs: ...`, `chore: ...`.
- Sign off every commit (`git commit -s`), per the DCO.
- This repository is public. Never mention AI assistants, add AI attribution or co-author trailers, link to agent sessions, or include internal hostnames, credentials or private context in commits, PRs, comments or code.
- Fill in `.github/pull_request_template.md`, ticking every package touched.
