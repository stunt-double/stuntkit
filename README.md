# Stuntkit

[![CI](https://github.com/stunt-double/stuntkit/actions/workflows/ci.yml/badge.svg)](https://github.com/stunt-double/stuntkit/actions/workflows/ci.yml)
[![Licence: Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-blue.svg)](./LICENSE)
<a href="https://index.stuntdouble.io/d/stuntdouble.io?ref=badge"><img src="https://index.stuntdouble.io/badge/stuntdouble.io.svg" alt="stuntdouble.io Stunt Double Index agent score" width="220" height="28"></a>

Open source building blocks for AI agents that use the web. Extracted from [Stunt Double](https://stuntdouble.io), where AI personas test real products in real browsers. Published to npm under the `@stunt-double` scope.

| Package                                                       | Version                                                                                                                               | What                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`@stunt-double/browser-toolset`](./packages/browser-toolset) | [![npm](https://img.shields.io/npm/v/@stunt-double/browser-toolset.svg)](https://www.npmjs.com/package/@stunt-double/browser-toolset) | Browser tools for AI agents over a provider-neutral `BrowserDriver`, with opt-in guards that refuse payments, sign-ups and secrets |
| [`@stunt-double/spelling`](./packages/spelling)               | [![npm](https://img.shields.io/npm/v/@stunt-double/spelling.svg)](https://www.npmjs.com/package/@stunt-double/spelling)               | Whole-word American, British and Canadian spelling localisation                                                                    |
| [`@stunt-double/wao`](./packages/wao)                         | [![npm](https://img.shields.io/npm/v/@stunt-double/wao.svg)](https://www.npmjs.com/package/@stunt-double/wao)                         | Web Agent Optimiser: a drop-in script that repairs the accessibility tree agents read, so legacy sites work for agents             |
| `@stunt-double/icons`                                         | Coming soon                                                                                                                           | Icons                                                                                                                              |

## Development

Node 22.18 or later and pnpm 11 (Corepack picks up the pinned version: `corepack enable`).

```sh
pnpm install
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop, adding a package and releasing.

## Licence

Everything in this repository is licensed under [Apache-2.0](./LICENSE), copyright 2026 Turnout Labs Ltd, unless a package says otherwise: each package carries its own `LICENSE` file, and a future package may be released under a different licence.
