# StuntKit

[![CI](https://github.com/stunt-double/stuntkit/actions/workflows/ci.yml/badge.svg)](https://github.com/stunt-double/stuntkit/actions/workflows/ci.yml)
[![Licence: Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-blue.svg)](./LICENSE)
<a href="https://index.stuntdouble.io/d/stuntdouble.io?ref=badge"><img src="https://index.stuntdouble.io/badge/stuntdouble.io.svg?style=flat" alt="stuntdouble.io Stunt Double Index agent score" width="184" height="20"></a>

Open source building blocks for AI agents that use the web. Extracted from [Stunt Double](https://stuntdouble.io), where AI personas test real products in real browsers. Published under the `@stunt-double` scope. Until that scope is available on npm, releases go to [GitHub Packages](https://github.com/orgs/stunt-double/packages): add `@stunt-double:registry=https://npm.pkg.github.com` and a GitHub token with `read:packages` to your `.npmrc`.

| Package                                                       | What                                                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`@stunt-double/browser-toolset`](./packages/browser-toolset) | Browser tools for AI agents over a provider-neutral `BrowserDriver`, with opt-in guards that refuse payments, sign-ups and secrets |
| [`@stunt-double/icons`](./packages/icons)                     | The Continuity icon pack: 235 icons as geometry, SVG files and React components                                                    |
| [`@stunt-double/spelling`](./packages/spelling)               | Whole-word American, British and Canadian spelling localisation                                                                    |
| [`@stunt-double/wao`](./packages/wao)                         | Web Agent Optimiser: a drop-in script that repairs the accessibility tree agents read, so legacy sites work for agents             |

## Agent skills

Each package has an [Agent Skill](./skills) that teaches a coding agent when to reach for it, how to wire it up and the mistakes to avoid. Install them all as a plugin from this repository's marketplace:

```sh
/plugin marketplace add stunt-double/stuntkit
/plugin install stuntkit@stuntkit
```

Other agents that read `SKILL.md` folders can copy them from [`skills/`](./skills).

## Development

Node 22.18 or later and pnpm 11 (Corepack picks up the pinned version: `corepack enable`).

```sh
pnpm install
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop, adding a package and releasing. Coding agents working in this repository get the same guidance as [project skills](./.claude/skills).

## Licence

Everything in this repository is licensed under [Apache-2.0](./LICENSE), copyright 2026 Turnout Labs Ltd, unless a package says otherwise: each package carries its own `LICENSE` file, and a future package may be released under a different licence.
