---
name: stuntkit
description: Use when deciding which StuntKit package (@stunt-double/browser-toolset, wao, spelling, icons) fits a task, when installing any @stunt-double package from GitHub Packages (.npmrc, tokens, CI), or when combining them, for example a browser agent that also repairs legacy pages, or a site made ready for AI agents and checked by one. Routes to the per-package skills.
---

# StuntKit

Open source building blocks for AI agents that use the web, extracted from [Stunt Double](https://stuntdouble.io). Four independent packages with no runtime dependencies; use one or any combination.

| Task                                                               | Package                         | Skill                          |
| ------------------------------------------------------------------ | ------------------------------- | ------------------------------ |
| An agent that drives a real browser (any model)                    | `@stunt-double/browser-toolset` | `stunt-double-browser-toolset` |
| A site, legacy page or web app that agents struggle to read or use | `@stunt-double/wao`             | `stunt-double-wao`             |
| American, British and Canadian spelling from one source            | `@stunt-double/spelling`        | `stunt-double-spelling`        |
| Icons (lucide-compatible) or AI provider and coding agent logos    | `@stunt-double/icons`           | `stunt-double-icons`           |
| Make a site agent-ready and prove it with an agent                 | wao + browser-toolset           | `stuntkit-agent-ready-site`    |

Load the matching skill before writing code; each has references for the details.

## Installing from GitHub Packages

Releases are published to GitHub Packages, not the public npm registry, so every project needs the scope mapped once:

```ini
# .npmrc in the project root
@stunt-double:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

- The token needs `read:packages`. Locally, a classic personal access token with that scope, exported as `GITHUB_TOKEN` (or `gh auth token` after `gh auth refresh -s read:packages`).
- Commit the `.npmrc` with the `${GITHUB_TOKEN}` placeholder, never a literal token.
- GitHub Actions: `GITHUB_TOKEN` can read public packages; pass it as `env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }` on the install step, or use `actions/setup-node` with `registry-url: https://npm.pkg.github.com` and `scope: '@stunt-double'`, which writes the file for you and reads `NODE_AUTH_TOKEN`.
- Vercel, Netlify and other hosts: add the token as an environment variable with the name the `.npmrc` uses.
- An `E401` or `E404` on install means the scope line or the token is missing, not that the package does not exist.

Then install with the project's package manager: `pnpm add @stunt-double/<package>` (or npm, yarn, bun).

## Runtimes

| Package         | Runs in                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| browser-toolset | Node 20+, or any runtime with `Buffer` (Workers with `nodejs_compat`, Bun, Deno), next to a browser |
| wao             | Browsers (npm entry or the `script` build); injected by Node harnesses                              |
| spelling        | Anywhere: browsers, Node 20+, workers, edge                                                         |
| icons           | Anywhere; `/react` needs React 18+                                                                  |

All are ESM with TypeScript types, `sideEffects: false` except WAO's script build, and Apache-2.0.

## How they fit together

- **browser-toolset + wao.** The toolset's `read_page` reads the accessibility tree; WAO repairs it. Inject WAO into the browser context before navigating and agents see named buttons where there were clickable `div`s.
- **wao on your own site.** Ship it so third-party agents (and your own) can use the site today, then fix the markup it reports.
- **spelling + icons.** Product polish for agent-facing and human-facing UI alike: one copy source in many spellings, one icon language including the logos of the agents you support.

## Agents in this plugin

- `browser-agent-builder`: scaffolds a complete browser agent in a project.
- `browser-agent-reviewer`: reviews an existing browser-toolset integration.
