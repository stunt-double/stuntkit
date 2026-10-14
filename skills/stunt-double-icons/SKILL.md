---
name: stunt-double-icons
description: Use when adding or replacing icons with @stunt-double/icons (the Continuity icon pack), or showing an AI provider or coding agent logo (Claude, Claude Code, Cursor, OpenAI, Gemini, Copilot and others), including migrating from lucide-react, rendering icons as React components, SVG files or raw markup (emails, OG images with Satori, canvas, Vue, Svelte, server templates), picking an icon by meaning with icons.json, making icons accessible, drawing custom icons on the same grid, and building layered or exploded icon views.
---

# Continuity icons (`@stunt-double/icons`)

235 stroked icons on a 24 unit grid (2 unit margin, stroke 1.5, square caps, mitred joins) and 29 filled AI provider marks. Framework-free geometry at the root, standalone SVG files, and React components at `/react`. No dependencies; React 18+ is an optional peer.

```sh
pnpm add @stunt-double/icons
```

Releases are on GitHub Packages: the project `.npmrc` needs `@stunt-double:registry=https://npm.pkg.github.com` and a token with `read:packages`.

## Pick the entry

| Need                                                 | Import                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| React UI                                             | `import { ArrowRightIcon } from '@stunt-double/icons/react'`   |
| Icon chosen from data (a CMS, a config)              | `iconComponents['arrow-right']` from `/react`                  |
| A file for a bundler, CSS or static HTML             | `@stunt-double/icons/svg/arrow-right.svg`                      |
| Markup without React (email, Satori, canvas, server) | `iconToSvg(iconNodes.arrowRight, { size: 32, color: '#111' })` |
| Search by meaning, or a lucide name                  | `@stunt-double/icons/icons.json`, or the catalogue below       |

Names: kebab-case for files and maps (`arrow-right`), PascalCase plus `Icon` for components (`ArrowRightIcon`), camelCase in `iconNodes` (`arrowRight`). `toComponent`, `toCamel` and `toBrandComponent` convert between them.

## Choosing an icon

Look the meaning up in [references/catalogue.md](references/catalogue.md) (every icon with category, tags and the lucide names it replaces, generated from the package) rather than guessing a name. 15 categories: product, arrows, actions, status, interface, communication, people, security, files, media, devices, data, development, objects, commerce. When nothing fits, say so and pick the nearest by tags; do not draw an icon inline.

## React props

`size` (24, px or any CSS length), `color` (`currentColor`), `strokeWidth` (1.5 grid units), `absoluteStrokeWidth` (hold the stroke in px at any size), `title`. Any other SVG attribute passes through, and refs reach the `<svg>`. Every component carries `continuity-icon` and `continuity-icon-<name>` classes.

## Migrating from lucide-react

Props match, so a migration is an import rename. For each lucide import, find the row whose "Replaces lucide" column lists it; rewrite `import { Trash2 } from 'lucide-react'` to `import { TrashIcon } from '@stunt-double/icons/react'` and rename the JSX. List every lucide icon with no match for the user instead of guessing. Step by step, with a codemod-style script: [references/recipes.md](references/recipes.md#migrating-from-lucide-react).

## AI provider marks

`ClaudeLogo`, `ClaudeCodeLogo`, `CursorLogo`, `OpenaiLogo` and the rest from `/react` (PascalCase plus `Logo`), or `brandComponents['claude-code']`. Props: `variant` (`color` default, or `mono` in `currentColor`), `size` (`sm` 16, `md` 24 default, `lg` 32, or any length), `color` (the mono paint), `title`. Files: `svg/brands/<name>-<variant>-<size>.svg`. Without React: `brandToSvg(mark, { variant, size })` with a mark from `BRAND_MARKS` (each has `name`, `title`, `mono`, `color`). Use `mono` on dark backgrounds, since black marks stay black in `color`. They are trademarks (from LobeHub Icons, MIT): use one to refer to its product, never to suggest endorsement.

## Accessibility

Icons are decorative (`aria-hidden`) by default. An icon that is the only content of a control needs a name, on the control (`<button aria-label="Next">`) or on the icon (`<ArrowRightIcon title="Next" />`, which makes it `role="img"`). Do not name an icon beside visible text: it would be read twice. Marks follow the same rule; give a logo standing alone the product's `title`.

## Styling

Stroked in `currentColor`, so icons follow the text colour. Size icons to the text they sit with (16 at 14 to 16px text, 20 at 18px, 24 standalone). `absoluteStrokeWidth` keeps a 1.5px line at 32px and up.

## Custom geometry and layers

`createIcon(name, node)` builds a component from your own `[tag, attrs]` elements on the same grid (keep them within 2 to 22 units). `iconLayers(name, node)` splits an icon into its parts, bottom first, for layered or exploded views. Recipes for non-React frameworks, emails, Satori, canvas and CSS masks: [references/recipes.md](references/recipes.md).

## Adding an icon to the pack

In the stuntkit repository: geometry in `packages/icons/src/nodes.ts`, an entry in `src/manifest.ts` (name, category, tags, lucide names), then `pnpm --filter @stunt-double/icons generate`. That rewrites the components, SVG files, `icons.json` and this skill's catalogue; the tests fail while any of them is stale or a shape leaves the 2 to 22 unit area.
